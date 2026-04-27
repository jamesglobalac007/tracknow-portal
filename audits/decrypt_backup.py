#!/usr/bin/env python3
"""
Decrypt a tracknow-portal off-site backup snapshot.

The backup format is JSON:
  { version, alg: "aes-256-gcm", iv: b64, authTag: b64, ciphertext: b64, sha256, bytes }

The ciphertext, once decrypted, is a UTF-8 string of JSON containing:
  { "files": { "data.json": "...", "users.json": "...", "audit.json": "...",
               "trustedDevices.json": "...", "contentLibrary": {...} } }

Usage:
  python3 decrypt_backup.py <encrypted_file.json.enc> [out_dir]

If out_dir is omitted, prints a one-line summary (counts of leads/prospects/customers/agreements).
"""
import sys, json, base64, hashlib, os
from pathlib import Path
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def load_key():
    creds_path = Path.home() / ".mds" / "credentials.json"
    with creds_path.open() as f:
        return base64.b64decode(json.load(f)["tracknow_backup_encryption_key"])


def decrypt_file(enc_path):
    with open(enc_path) as f:
        env = json.load(f)
    if env.get("alg") != "aes-256-gcm":
        raise SystemExit(f"unexpected alg: {env.get('alg')}")
    key = load_key()
    if len(key) != 32:
        raise SystemExit("key must decode to 32 bytes")
    iv = base64.b64decode(env["iv"])
    ct_with_tag = base64.b64decode(env["ciphertext"]) + base64.b64decode(env["authTag"])
    aes = AESGCM(key)
    pt = aes.decrypt(iv, ct_with_tag, None).decode("utf-8")
    # integrity cross-check
    actual_sha = hashlib.sha256(pt.encode("utf-8")).hexdigest()
    expected_sha = env.get("sha256")
    if expected_sha and actual_sha != expected_sha:
        raise SystemExit(f"sha mismatch: expected {expected_sha}, got {actual_sha}")
    return pt


def summarize(payload_str):
    payload = json.loads(payload_str)
    files = payload.get("files", {})
    out = {"snapshot_bytes": len(payload_str), "files": {}}
    if "data.json" in files:
        try:
            data = json.loads(files["data.json"])
            out["counts"] = {
                "leads": len(data.get("leads", [])),
                "prospects": len(data.get("prospects", [])),
                "customers": len(data.get("customers", [])),
                "agreements_in_data": len(data.get("agreements", [])) if "agreements" in data else "(none in data.json)",
                "version": data.get("version"),
                "lastUpdate": data.get("lastUpdate"),
            }
        except Exception as e:
            out["counts_error"] = str(e)
    for k, v in files.items():
        out["files"][k] = f"{len(v) if isinstance(v, str) else type(v).__name__} {len(v) if isinstance(v, str) else ''} chars"
    cl = files.get("contentLibrary")
    if isinstance(cl, dict):
        out["content_library"] = {"file_count": len(cl.get("files", {})) if "files" in cl else len(cl)}
    return out


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    enc = sys.argv[1]
    plaintext = decrypt_file(enc)
    if len(sys.argv) >= 3:
        out_dir = Path(sys.argv[2])
        out_dir.mkdir(parents=True, exist_ok=True)
        # write the full payload AND each file individually
        (out_dir / "_payload.json").write_text(plaintext)
        payload = json.loads(plaintext)
        for fname, content in payload.get("files", {}).items():
            tgt = out_dir / fname
            tgt.write_text(content if isinstance(content, str) else json.dumps(content))
        print(f"wrote {len(payload.get('files', {}))} files to {out_dir}")
    s = summarize(plaintext)
    print(json.dumps(s, indent=2, default=str))


if __name__ == "__main__":
    main()
