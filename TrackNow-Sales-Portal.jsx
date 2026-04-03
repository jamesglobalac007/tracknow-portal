import { useState } from "react";
import {
  LayoutDashboard, Users, Search, Send, BarChart3, FileText,
  TrendingUp, TrendingDown, UserPlus, Mail, Phone, MapPin,
  Download, Eye, Clock, CheckCircle2, AlertCircle, Star, Globe,
  Truck, Plus, RefreshCw, Target, MessageSquare, ExternalLink,
  Edit3, MoreHorizontal, ChevronLeft, ChevronRight, Filter
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, Legend
} from "recharts";

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   TRACKNOW SALES PORTAL — Blue Branding (#3498db)
   "Take Control of Your Assets"
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const BLUE = "#3498db";
const DARK = "#20303c";
const TEAL = "#1abc9c";

// ─── DATA ──────────────────────────────────────────────────
const INDUSTRIES = [
  { name: "Civil", icon: "🏗️", count: 342, color: "#3498db" },
  { name: "Service", icon: "🔧", count: 287, color: "#2980b9" },
  { name: "Transport & Logistics", icon: "🚛", count: 203, color: "#1a6fa8" },
  { name: "Storage & Waste", icon: "♻️", count: 156, color: "#20303c" },
  { name: "Medical & Personal Care", icon: "🏥", count: 128, color: "#1abc9c" },
  { name: "Live Stock & Pets", icon: "🐄", count: 94, color: "#2c3e50" },
  { name: "Manufacturing", icon: "🏭", count: 167, color: "#34495e" },
  { name: "Mining & Resources", icon: "⛏️", count: 89, color: "#16a085" },
];

const STATES = ["All States","QLD","NSW","VIC","SA","WA","TAS","NT","ACT"];

const STAGES = [
  { id:"new",      label:"New Lead",      color:"#6B7280", bg:"#F3F4F6" },
  { id:"contacted", label:"Contacted",    color:"#3B82F6", bg:"#EFF6FF" },
  { id:"interested",label:"Interested",   color:"#F59E0B", bg:"#FFFBEB" },
  { id:"demo",      label:"Demo Booked",  color:"#8B5CF6", bg:"#F5F3FF" },
  { id:"proposal",  label:"Proposal Sent",color:"#EC4899", bg:"#FDF2F8" },
  { id:"closed",    label:"Closed Won",   color:"#10B981", bg:"#ECFDF5" },
];

const LEADS = [
  { id:1,  co:"Smith's Transport Pty Ltd",    name:"David Smith",   email:"david@smithstransport.com.au",  ph:"0412 345 678", ind:"Transport & Logistics", st:"QLD", city:"Brisbane",   stage:"demo",      v:45,  val:16200, last:"28 Mar", note:"Eco Driving demo next Tue", star:true },
  { id:2,  co:"Pacific Civil Contractors",    name:"Sarah Chen",    email:"sarah@pacificcivil.com.au",     ph:"0423 456 789", ind:"Civil",                 st:"NSW", city:"Sydney",     stage:"interested",v:78,  val:28080, last:"27 Mar", note:"78 machines, 3 sites. Wants geofencing.", star:true },
  { id:3,  co:"GreenWaste Solutions",         name:"Mike O'Brien",  email:"mike@greenwaste.com.au",        ph:"0434 567 890", ind:"Storage & Waste",       st:"VIC", city:"Melbourne",  stage:"proposal",  v:32,  val:11520, last:"29 Mar", note:"Proposal sent. Awaiting board.", star:false },
  { id:4,  co:"Outback Mining Services",      name:"James Wilson",  email:"jwilson@outbackmining.com.au",  ph:"0445 678 901", ind:"Mining & Resources",    st:"WA",  city:"Perth",      stage:"new",       v:120, val:43200, last:"30 Mar", note:"LinkedIn find. Pilbara region.", star:true },
  { id:5,  co:"QuickDrop Couriers",           name:"Tom Nguyen",    email:"tom@quickdrop.com.au",          ph:"0456 789 012", ind:"Transport & Logistics", st:"QLD", city:"Gold Coast", stage:"contacted", v:22,  val:7920,  last:"26 Mar", note:"Info pack sent. Follow up next week.", star:false },
  { id:6,  co:"Brisbane City Council",        name:"Angela Torres", email:"atorres@brisbane.qld.gov.au",   ph:"07 3403 8888", ind:"Service",               st:"QLD", city:"Brisbane",   stage:"interested",v:200, val:72000, last:"25 Mar", note:"Massive opp. Procurement committee.", star:true },
  { id:7,  co:"AgriTrack Farms",              name:"Peter Brown",   email:"pete@agritrack.com.au",         ph:"0467 890 123", ind:"Live Stock & Pets",     st:"NSW", city:"Dubbo",      stage:"new",       v:15,  val:5400,  last:"30 Mar", note:"Google Maps find. Farm machinery.", star:false },
  { id:8,  co:"Metro Rentals Australia",      name:"Lisa Park",     email:"lisa@metrorentals.com.au",      ph:"0478 901 234", ind:"Service",               st:"VIC", city:"Melbourne",  stage:"closed",    v:55,  val:19800, last:"20 Mar", note:"CLOSED! 55 units. Install Apr 5.", star:true },
  { id:9,  co:"Cairns Earthmoving",           name:"Rob Taylor",    email:"rob@cairnsearthmoving.com.au",  ph:"0489 012 345", ind:"Civil",                 st:"QLD", city:"Cairns",     stage:"contacted", v:28,  val:10080, last:"29 Mar", note:"Machine hrs tracking. Fleetrun sent.", star:false },
  { id:10, co:"SecureFleet Logistics",        name:"Karen White",   email:"karen@securefleet.com.au",      ph:"0490 123 456", ind:"Transport & Logistics", st:"SA",  city:"Adelaide",   stage:"demo",      v:67,  val:24120, last:"28 Mar", note:"Demo done. Loved geofencing. Quote next.", star:false },
  { id:11, co:"Darwin Waste Services",        name:"Chris Martin",  email:"chris@darwinwaste.com.au",      ph:"0401 234 567", ind:"Storage & Waste",       st:"NT",  city:"Darwin",     stage:"new",       v:18,  val:6480,  last:"31 Mar", note:"Cold outreach. Left voicemail.", star:false },
  { id:12, co:"Hobart Bus Lines",             name:"Emma Scott",    email:"emma@hobartbus.com.au",         ph:"0412 876 543", ind:"Transport & Logistics", st:"TAS", city:"Hobart",     stage:"interested",v:42,  val:15120, last:"27 Mar", note:"Public transport. Driver behaviour + fuel.", star:false },
];

const SCRAPER_RESULTS = [
  { name:"ABC Heavy Haulage",           abn:"12 345 678 901", ind:"Transport & Logistics", st:"QLD", city:"Townsville",   fleet:"~30", src:"ABN Lookup",  email:"info@abchaulage.com.au" },
  { name:"Sunshine Coast Earthworks",   abn:"23 456 789 012", ind:"Civil",                 st:"QLD", city:"Maroochydore", fleet:"~15", src:"Google Maps", email:"admin@scew.com.au" },
  { name:"Murray River Transport",      abn:"34 567 890 123", ind:"Transport & Logistics", st:"VIC", city:"Mildura",      fleet:"~50", src:"Yellow Pages",email:"dispatch@murrayriver.com.au" },
  { name:"Top End Mining Contractors",  abn:"45 678 901 234", ind:"Mining & Resources",    st:"NT",  city:"Katherine",    fleet:"~80", src:"ABN Lookup",  email:"ops@topendmining.com.au" },
  { name:"Clean City Waste",            abn:"56 789 012 345", ind:"Storage & Waste",       st:"NSW", city:"Wollongong",   fleet:"~25", src:"Google Maps", email:"hello@cleancity.com.au" },
  { name:"Pilbara Plant Hire",          abn:"67 890 123 456", ind:"Service",               st:"WA",  city:"Karratha",     fleet:"~40", src:"LinkedIn",    email:"hire@pilbaraplant.com.au" },
];

const MONTHLY = [
  { m:"Oct", leads:18, contacted:14, closed:3, rev:10800 },
  { m:"Nov", leads:24, contacted:19, closed:4, rev:14400 },
  { m:"Dec", leads:15, contacted:12, closed:2, rev:7200 },
  { m:"Jan", leads:31, contacted:25, closed:6, rev:21600 },
  { m:"Feb", leads:38, contacted:30, closed:8, rev:28800 },
  { m:"Mar", leads:45, contacted:36, closed:10,rev:36000 },
];

const STATE_DATA = [
  { st:"QLD",leads:87,val:156000 },{ st:"NSW",leads:64,val:112000 },
  { st:"VIC",leads:52,val:94000 }, { st:"WA", leads:38,val:72000 },
  { st:"SA", leads:21,val:38000 }, { st:"NT", leads:12,val:22000 },
  { st:"TAS",leads:8, val:14000 }, { st:"ACT",leads:5, val:9000 },
];

const CAMPAIGNS = [
  { id:1, name:"Civil Fleet Outreach — National",   status:"active", sent:156, opened:89,  clicked:34, replies:12 },
  { id:2, name:"Logistics Companies — QLD/NSW",     status:"active", sent:203, opened:124, clicked:56, replies:18 },
  { id:3, name:"Storage & Waste — National",        status:"paused", sent:87,  opened:42,  clicked:15, replies:5 },
  { id:4, name:"Mining Sector — WA Focus",          status:"draft",  sent:0,   opened:0,   clicked:0,  replies:0 },
];

const INFO_PACKS = [
  { name:"TrackNow System Overview",   file:"TRACKNOW-OVERVIEW.pdf",    sent:234, views:187 },
  { name:"Eco Driving Brochure",       file:"TRACKNOW-ECO-DRIVING.pdf", sent:156, views:112 },
  { name:"FleetRun Maintenance",       file:"TRACKNOW-FLEETRUN.pdf",    sent:128, views:94 },
  { name:"Custom Pricing Proposal",    file:"Custom-Quote-Template.pdf",sent:67,  views:58 },
];

const TEMPLATES = [
  { name:"Initial Outreach — GPS Tracking Intro",      subj:"Reduce Fleet Costs by 20% with Live GPS Tracking",                type:"Cold outreach" },
  { name:"Follow-Up #1 — Info Pack Delivery",           subj:"Your TrackNow GPS Tracking Info Pack",                            type:"Follow-up" },
  { name:"Follow-Up #2 — Demo Invitation",              subj:"See TrackNow in Action — Free Live Demo",                         type:"Follow-up" },
  { name:"Industry-Specific — Civil & Construction",    subj:"Track Your Machines, Cut Downtime — GPS for Civil Equipment",      type:"Industry" },
  { name:"Win-Back — Lapsed Prospects",                 subj:"Still Looking for Fleet Tracking? Special Offer Inside",           type:"Re-engagement" },
];

// ─── SMALL COMPONENTS ──────────────────────────────────────

function KPI({ label, value, change, up, icon: I, accent }) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {change && (
            <div className="flex items-center gap-1 mt-2">
              {up ? <TrendingUp size={13} className="text-emerald-500" /> : <TrendingDown size={13} className="text-red-400" />}
              <span className={`text-xs font-semibold ${up ? "text-emerald-500" : "text-red-400"}`}>{change}</span>
              <span className="text-xs text-gray-400">vs last month</span>
            </div>
          )}
        </div>
        <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ backgroundColor: accent + "18" }}>
          <I size={20} style={{ color: accent }} />
        </div>
      </div>
    </div>
  );
}

function Badge({ stage }) {
  const s = STAGES.find(x => x.id === stage);
  if (!s) return null;
  return (
    <span className="text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap" style={{ backgroundColor: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

function LeadCard({ l }) {
  return (
    <div className="bg-white rounded-lg p-3.5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow cursor-pointer mb-2.5">
      <div className="flex items-start justify-between gap-1 mb-1.5">
        <p className="text-sm font-bold text-gray-900 leading-snug">{l.co}</p>
        {l.star && <Star size={13} className="text-amber-400 fill-amber-400 flex-shrink-0 mt-0.5" />}
      </div>
      <p className="text-xs text-gray-500 mb-2">{l.name}</p>
      <div className="flex items-center gap-1 text-xs text-gray-400 mb-2.5">
        <MapPin size={11} />
        <span>{l.city}, {l.st}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: BLUE + "15", color: BLUE }}>{l.v} units</span>
        <span className="text-xs font-bold text-gray-700">${l.val.toLocaleString()}</span>
      </div>
    </div>
  );
}

// ─── PAGE: DASHBOARD ───────────────────────────────────────
function Dashboard() {
  const total = LEADS.reduce((s,l) => s + l.val, 0);
  const closed = LEADS.filter(l => l.stage === "closed");
  const totalV = LEADS.reduce((s,l) => s + l.v, 0);
  const pipeData = STAGES.map(s => ({ name: s.label, value: LEADS.filter(l => l.stage === s.id).length, fill: s.color }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-400 mt-1">Sales overview for March 2026</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2.5 text-white text-sm font-semibold rounded-lg shadow-sm hover:opacity-90 transition" style={{ backgroundColor: BLUE }}>
          <Plus size={16} /> New Lead
        </button>
      </div>

      <div className="grid grid-cols-4 gap-5">
        <KPI label="Total Leads"       value={LEADS.length}                      change="+18%" up icon={Users}        accent={BLUE} />
        <KPI label="Pipeline Value"     value={`$${(total/1000).toFixed(0)}K`}   change="+24%" up icon={Target}       accent="#2980b9" />
        <KPI label="Closed This Month"  value={closed.length}                    change="+67%" up icon={CheckCircle2} accent="#10B981" />
        <KPI label="Total Units"        value={totalV.toLocaleString()}           change="+12%" up icon={Truck}        accent="#8B5CF6" />
      </div>

      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-sm font-bold text-gray-700 mb-1">Monthly Lead Performance</h3>
          <p className="text-xs text-gray-400 mb-4">Oct 2025 – Mar 2026</p>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={MONTHLY}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="m" tick={{ fontSize: 11, fill: "#999" }} />
              <YAxis tick={{ fontSize: 11, fill: "#999" }} />
              <Tooltip contentStyle={{ borderRadius: 10, border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.1)", fontSize: 12 }} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="leads"     stroke={BLUE}    fill={BLUE+"20"}    strokeWidth={2} name="New Leads" />
              <Area type="monotone" dataKey="contacted" stroke="#2980b9" fill="#2980b920"     strokeWidth={2} name="Contacted" />
              <Area type="monotone" dataKey="closed"    stroke="#10B981" fill="#10B98120"     strokeWidth={2} name="Closed" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-sm font-bold text-gray-700 mb-1">Pipeline Breakdown</h3>
          <p className="text-xs text-gray-400 mb-3">{LEADS.length} total leads</p>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={pipeData} innerRadius={50} outerRadius={75} dataKey="value" paddingAngle={3}>
                {pipeData.map((e,i) => <Cell key={i} fill={e.fill} />)}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: 10, border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.1)", fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2 mt-1">
            {pipeData.map(p => (
              <div key={p.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.fill }} />
                  <span className="text-xs text-gray-500">{p.name}</span>
                </div>
                <span className="text-xs font-bold text-gray-800">{p.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-gray-700">Hot Leads — Action Required</h3>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: BLUE+"15", color: BLUE }}>
              {LEADS.filter(l => l.star && l.stage !== "closed").length} leads
            </span>
          </div>
          <div className="space-y-2.5">
            {LEADS.filter(l => l.star && l.stage !== "closed").map(l => (
              <div key={l.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 hover:bg-blue-50 transition cursor-pointer">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ backgroundColor: BLUE }}>
                  {l.co.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{l.co}</p>
                  <p className="text-xs text-gray-400">{l.v} vehicles · ${l.val.toLocaleString()}</p>
                </div>
                <Badge stage={l.stage} />
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-sm font-bold text-gray-700 mb-4">Recent Activity</h3>
          <div className="space-y-4">
            {[
              { icon: Send,        color: "#3B82F6", act: "Info pack sent to",    target: "Cairns Earthmoving",              time: "2 hours ago" },
              { icon: Eye,         color: "#8B5CF6", act: "Demo completed with",  target: "SecureFleet Logistics",           time: "5 hours ago" },
              { icon: Search,      color: BLUE,      act: "New lead scraped:",     target: "Outback Mining Services",         time: "1 day ago" },
              { icon: FileText,    color: "#F59E0B", act: "Proposal sent to",     target: "GreenWaste Solutions",            time: "2 days ago" },
              { icon: CheckCircle2,color: "#10B981", act: "DEAL CLOSED!",         target: "Metro Rentals — 55 units",        time: "11 days ago" },
            ].map((a, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: a.color+"15" }}>
                  <a.icon size={15} style={{ color: a.color }} />
                </div>
                <div>
                  <p className="text-sm text-gray-600">{a.act} <span className="font-semibold text-gray-900">{a.target}</span></p>
                  <p className="text-xs text-gray-400 mt-0.5">{a.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── PAGE: PIPELINE ────────────────────────────────────────
function Pipeline({ view, setView }) {
  const [fInd, setFInd] = useState("All");
  const [fSt, setFSt] = useState("All States");
  const fl = LEADS.filter(l => {
    if (fInd !== "All" && l.ind !== fInd) return false;
    if (fSt !== "All States" && l.st !== fSt) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sales Pipeline</h1>
          <p className="text-sm text-gray-400 mt-1">{fl.length} leads · ${fl.reduce((s,l) => s+l.val,0).toLocaleString()} total pipeline</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={fInd} onChange={e => setFInd(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-600">
            <option value="All">All Industries</option>
            {INDUSTRIES.map(i => <option key={i.name} value={i.name}>{i.name}</option>)}
          </select>
          <select value={fSt} onChange={e => setFSt(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-600">
            {STATES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button onClick={() => setView("board")} className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${view==="board" ? "bg-white text-gray-900 shadow-sm" : "text-gray-400"}`}>Board</button>
            <button onClick={() => setView("table")} className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${view==="table" ? "bg-white text-gray-900 shadow-sm" : "text-gray-400"}`}>Table</button>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 text-white text-sm font-semibold rounded-lg" style={{ backgroundColor: BLUE }}>
            <Plus size={15} /> Add Lead
          </button>
        </div>
      </div>

      {view === "board" ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STAGES.map(s => {
            const items = fl.filter(l => l.stage === s.id);
            return (
              <div key={s.id} className="flex-1 min-w-[210px]">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">{s.label}</span>
                  <span className="ml-auto text-xs font-bold bg-gray-200 text-gray-600 w-6 h-6 rounded-full flex items-center justify-center">{items.length}</span>
                </div>
                <div className="rounded-xl p-2.5 min-h-[300px]" style={{ backgroundColor: s.bg }}>
                  {items.map(l => <LeadCard key={l.id} l={l} />)}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {["Company","Industry","Location","Stage","Units","Value","Last Contact",""].map(h => (
                  <th key={h} className="text-left text-xs font-bold text-gray-400 uppercase tracking-wider py-3 px-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fl.map(l => (
                <tr key={l.id} className="border-b border-gray-50 hover:bg-blue-50/30 transition">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      {l.star && <Star size={12} className="text-amber-400 fill-amber-400" />}
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{l.co}</p>
                        <p className="text-xs text-gray-400">{l.name}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600">{l.ind}</td>
                  <td className="py-3 px-4 text-sm text-gray-600">{l.city}, {l.st}</td>
                  <td className="py-3 px-4"><Badge stage={l.stage} /></td>
                  <td className="py-3 px-4 text-sm font-semibold text-gray-700">{l.v}</td>
                  <td className="py-3 px-4 text-sm font-bold text-gray-900">${l.val.toLocaleString()}</td>
                  <td className="py-3 px-4 text-xs text-gray-400">{l.last}</td>
                  <td className="py-3 px-4">
                    <div className="flex gap-1">
                      <button className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><Mail size={14}/></button>
                      <button className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><Phone size={14}/></button>
                      <button className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><Eye size={14}/></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── PAGE: SCRAPER ─────────────────────────────────────────
function Scraper() {
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState(false);
  const [sel, setSel] = useState([]);

  const doSearch = () => { setSearching(true); setTimeout(() => { setSearching(false); setResults(true); }, 1500); };
  const toggle = i => setSel(p => p.includes(i) ? p.filter(x => x !== i) : [...p, i]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Lead Scraper</h1>
        <p className="text-sm text-gray-400 mt-1">Find prospective customers across Australia by industry, location, and business type.</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-sm font-bold text-gray-700 mb-4">Search Criteria</h3>
        <div className="grid grid-cols-4 gap-4">
          {[
            { label:"Industry", opts: INDUSTRIES.map(i => `${i.icon} ${i.name}`) },
            { label:"State / Territory", opts: STATES },
            { label:"Source", opts: ["All Sources","ABN Lookup","Google Maps","Yellow Pages","LinkedIn"] },
            { label:"Min Fleet Size", opts: ["Any","5+ vehicles","10+ vehicles","25+ vehicles","50+ vehicles"] },
          ].map(f => (
            <div key={f.label}>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">{f.label}</label>
              <select className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 bg-white text-gray-700">
                {f.opts.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 mt-5">
          <button onClick={doSearch} disabled={searching} className="flex items-center gap-2 px-5 py-2.5 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition" style={{ backgroundColor: BLUE }}>
            {searching ? <RefreshCw size={15} className="animate-spin" /> : <Search size={15} />}
            {searching ? "Searching..." : "Search for Leads"}
          </button>
          <span className="text-xs text-gray-400">Searches ABN registry, Google Maps, Yellow Pages & LinkedIn simultaneously</span>
        </div>
      </div>

      {results && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-gray-700">Search Results</h3>
              <span className="text-xs font-semibold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">{SCRAPER_RESULTS.length} found</span>
            </div>
            <div className="flex gap-2">
              {sel.length > 0 && (
                <button className="flex items-center gap-1.5 px-3 py-1.5 text-white text-xs font-semibold rounded-lg" style={{ backgroundColor: BLUE }}>
                  <UserPlus size={13} /> Add {sel.length} to Pipeline
                </button>
              )}
              <button className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-50">
                <Download size={13} /> Export CSV
              </button>
            </div>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="py-3 px-4 text-left"><input type="checkbox" className="rounded" onChange={() => sel.length === SCRAPER_RESULTS.length ? setSel([]) : setSel(SCRAPER_RESULTS.map((_,i)=>i))} checked={sel.length === SCRAPER_RESULTS.length} /></th>
                {["Business Name","ABN","Industry","Location","Est. Fleet","Source","Actions"].map(h => (
                  <th key={h} className="py-3 px-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SCRAPER_RESULTS.map((r,i) => (
                <tr key={i} className="border-b border-gray-50 hover:bg-blue-50/30 transition">
                  <td className="py-3 px-4"><input type="checkbox" checked={sel.includes(i)} onChange={() => toggle(i)} className="rounded" /></td>
                  <td className="py-3 px-4">
                    <p className="text-sm font-semibold text-gray-900">{r.name}</p>
                    <p className="text-xs text-gray-400">{r.email}</p>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-500 font-mono">{r.abn}</td>
                  <td className="py-3 px-4 text-sm text-gray-600">{r.ind}</td>
                  <td className="py-3 px-4 text-sm text-gray-600">{r.city}, {r.st}</td>
                  <td className="py-3 px-4 text-sm text-gray-600">{r.fleet}</td>
                  <td className="py-3 px-4">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: BLUE+"15", color: BLUE }}>{r.src}</span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex gap-1">
                      <button className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600"><UserPlus size={14}/></button>
                      <button className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600"><Send size={14}/></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid grid-cols-4 gap-4">
        {INDUSTRIES.map(ind => (
          <div key={ind.name} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:border-blue-300 hover:shadow-md transition cursor-pointer">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl">{ind.icon}</span>
              <div>
                <p className="text-sm font-bold text-gray-900">{ind.name}</p>
                <p className="text-xs text-gray-400">{ind.count} businesses</p>
              </div>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1.5">
              <div className="h-1.5 rounded-full" style={{ width: `${(ind.count / 350) * 100}%`, backgroundColor: ind.color }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── PAGE: OUTREACH ────────────────────────────────────────
function Outreach() {
  const [tab, setTab] = useState("campaigns");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Outreach & Automation</h1>
          <p className="text-sm text-gray-400 mt-1">Email campaigns, info pack delivery, and automated follow-ups.</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 text-white text-sm font-semibold rounded-lg" style={{ backgroundColor: BLUE }}>
          <Plus size={15} /> New Campaign
        </button>
      </div>

      <div className="grid grid-cols-4 gap-5">
        <KPI label="Total Sent"  value="446"   change="+32%" up icon={Send}          accent="#3B82F6" />
        <KPI label="Open Rate"   value="57.2%" change="+8%"  up icon={Eye}           accent="#8B5CF6" />
        <KPI label="Click Rate"  value="23.5%" change="+15%" up icon={Target}        accent="#F59E0B" />
        <KPI label="Replies"     value="35"    change="+42%" up icon={MessageSquare} accent="#10B981" />
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 w-fit">
        {[["campaigns","Campaigns"],["infopacks","Info Packs"],["templates","Email Templates"]].map(([k,v]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 text-sm font-semibold rounded-md transition ${tab === k ? "bg-white text-gray-900 shadow-sm" : "text-gray-400"}`}>{v}</button>
        ))}
      </div>

      {tab === "campaigns" && (
        <div className="space-y-4">
          {CAMPAIGNS.map(c => (
            <div key={c.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <h3 className="text-base font-bold text-gray-900">{c.name}</h3>
                  <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${c.status==="active"?"bg-emerald-100 text-emerald-700":c.status==="paused"?"bg-amber-100 text-amber-700":"bg-gray-100 text-gray-500"}`}>
                    {c.status.charAt(0).toUpperCase()+c.status.slice(1)}
                  </span>
                </div>
                <button className="p-2 rounded-lg hover:bg-gray-100 text-gray-400"><MoreHorizontal size={16}/></button>
              </div>
              {c.sent > 0 ? (
                <>
                  <div className="grid grid-cols-4 gap-6">
                    {[["Sent",c.sent,null],["Opened",c.opened,c.sent],["Clicked",c.clicked,c.sent],["Replies",c.replies,c.sent]].map(([label,val,base]) => (
                      <div key={label}>
                        <p className="text-xs text-gray-400 mb-0.5">{label}</p>
                        <p className="text-xl font-bold text-gray-900">{val}{base ? <span className="text-xs font-normal text-gray-400 ml-1">({Math.round(val/base*100)}%)</span> : null}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 w-full h-2 bg-gray-100 rounded-full overflow-hidden flex">
                    <div className="h-full bg-blue-400" style={{ width:`${(c.opened/c.sent)*100}%` }} />
                    <div className="h-full bg-amber-400" style={{ width:`${(c.clicked/c.sent)*100}%` }} />
                    <div className="h-full bg-emerald-400" style={{ width:`${(c.replies/c.sent)*100}%` }} />
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-400 italic">Draft — not yet sent</p>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "infopacks" && (
        <div className="grid grid-cols-2 gap-4">
          {INFO_PACKS.map((p,i) => (
            <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl flex items-center justify-center" style={{ backgroundColor: BLUE+"15" }}>
                <FileText size={24} style={{ color: BLUE }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900">{p.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{p.file}</p>
                <div className="flex items-center gap-4 mt-2">
                  <span className="text-xs text-gray-500">{p.sent} sent</span>
                  <span className="text-xs text-gray-500">{p.views} viewed</span>
                </div>
              </div>
              <button className="px-4 py-2 text-white text-xs font-semibold rounded-lg" style={{ backgroundColor: BLUE }}>Send</button>
            </div>
          ))}
        </div>
      )}

      {tab === "templates" && (
        <div className="space-y-3">
          {TEMPLATES.map((t,i) => (
            <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-4 hover:border-blue-200 transition cursor-pointer">
              <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                <Mail size={18} className="text-gray-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900">{t.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">Subject: {t.subj}</p>
              </div>
              <span className="text-xs font-semibold bg-gray-100 text-gray-500 px-2.5 py-1 rounded-full">{t.type}</span>
              <button className="p-2 rounded-lg hover:bg-gray-100 text-gray-400"><Edit3 size={14}/></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── PAGE: ANALYTICS ───────────────────────────────────────
function Analytics() {
  const COLORS = ["#3498db","#2980b9","#1a6fa8","#20303c","#1abc9c","#2c3e50","#34495e","#16a085"];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics & Insights</h1>
          <p className="text-sm text-gray-400 mt-1">Market analysis, growth tracking, and sector performance across Australia.</p>
        </div>
        <div className="flex gap-2">
          <select className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-600">
            <option>Last 6 months</option><option>Last 3 months</option><option>Last 12 months</option>
          </select>
          <button className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50">
            <Download size={14}/> Export
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-5">
        <KPI label="Conversion Rate" value="22.2%" change="+5.3%" up icon={TrendingUp} accent="#10B981" />
        <KPI label="Avg Deal Size"   value="$15.4K" change="+18%" up icon={Target}     accent={BLUE} />
        <KPI label="Time to Close"   value="18 days" change="-3 days" up icon={Clock}  accent="#3B82F6" />
        <KPI label="Monthly Revenue" value="$36K"    change="+25%" up icon={TrendingUp} accent="#8B5CF6" />
      </div>

      <div className="grid grid-cols-2 gap-5">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-sm font-bold text-gray-700 mb-1">Revenue Growth</h3>
          <p className="text-xs text-gray-400 mb-4">Monthly Recurring Revenue</p>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={MONTHLY}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="m" tick={{ fontSize:11, fill:"#999" }} />
              <YAxis tick={{ fontSize:11, fill:"#999" }} tickFormatter={v => `$${v/1000}K`} />
              <Tooltip contentStyle={{ borderRadius:10, border:"none", boxShadow:"0 4px 20px rgba(0,0,0,0.1)", fontSize:12 }} formatter={v => [`$${v.toLocaleString()}`,"Revenue"]} />
              <Area type="monotone" dataKey="rev" stroke={BLUE} fill={BLUE+"20"} strokeWidth={2.5} name="Revenue" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-sm font-bold text-gray-700 mb-1">Leads by State</h3>
          <p className="text-xs text-gray-400 mb-4">Total pipeline across Australia</p>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={STATE_DATA}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="st" tick={{ fontSize:11, fill:"#999" }} />
              <YAxis tick={{ fontSize:11, fill:"#999" }} />
              <Tooltip contentStyle={{ borderRadius:10, border:"none", boxShadow:"0 4px 20px rgba(0,0,0,0.1)", fontSize:12 }} />
              <Bar dataKey="leads" fill={BLUE} radius={[6,6,0,0]} name="Leads" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-sm font-bold text-gray-700 mb-4">Conversion Funnel</h3>
          {[
            { label:"New Leads",     n:171, pct:100,  c:"#6B7280" },
            { label:"Contacted",     n:136, pct:79.5, c:"#3B82F6" },
            { label:"Interested",    n:82,  pct:47.9, c:"#F59E0B" },
            { label:"Demo Booked",   n:48,  pct:28.1, c:"#8B5CF6" },
            { label:"Proposal Sent", n:31,  pct:18.1, c:"#EC4899" },
            { label:"Closed Won",    n:21,  pct:12.3, c:"#10B981" },
          ].map((f,i) => (
            <div key={i} className="flex items-center gap-3 mb-3">
              <span className="text-xs text-gray-500 w-24 text-right font-medium">{f.label}</span>
              <div className="flex-1 h-8 bg-gray-50 rounded-lg overflow-hidden">
                <div className="h-full rounded-lg flex items-center px-3" style={{ width:`${f.pct}%`, backgroundColor: f.c+"20", borderLeft:`3px solid ${f.c}` }}>
                  <span className="text-xs font-bold" style={{ color: f.c }}>{f.n}</span>
                </div>
              </div>
              <span className="text-xs text-gray-400 w-10 text-right">{f.pct}%</span>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-sm font-bold text-gray-700 mb-4">Top Performing Industries</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={INDUSTRIES.slice(0,6).map((ind,i) => ({ name:ind.name, value:ind.count }))} innerRadius={55} outerRadius={85} dataKey="value" paddingAngle={2}>
                {INDUSTRIES.slice(0,6).map((_,i) => <Cell key={i} fill={COLORS[i]} />)}
              </Pie>
              <Tooltip contentStyle={{ borderRadius:10, border:"none", boxShadow:"0 4px 20px rgba(0,0,0,0.1)", fontSize:12 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-2 gap-2 mt-3">
            {INDUSTRIES.slice(0,6).map((ind,i) => (
              <div key={ind.name} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i] }} />
                <span className="text-xs text-gray-600 truncate">{ind.name}</span>
                <span className="text-xs font-bold text-gray-800 ml-auto">{ind.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="text-sm font-bold text-gray-700 mb-4">Sector Opportunity Map — Australia</h3>
        <div className="grid grid-cols-8 gap-3">
          {STATE_DATA.map(s => (
            <div key={s.st} className="text-center p-4 rounded-xl hover:shadow-md transition cursor-pointer" style={{ backgroundColor: BLUE+"12", border: `1px solid ${BLUE}30` }}>
              <p className="text-lg font-black" style={{ color: BLUE }}>{s.st}</p>
              <p className="text-xl font-black text-gray-900 mt-1">{s.leads}</p>
              <p className="text-xs text-gray-400">leads</p>
              <p className="text-sm font-bold mt-1" style={{ color: BLUE }}>${(s.val/1000).toFixed(0)}K</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── MAIN APP ──────────────────────────────────────────────
const NAV = [
  { id:"dashboard", label:"Dashboard",    icon: LayoutDashboard },
  { id:"pipeline",  label:"Pipeline",     icon: Users },
  { id:"scraper",   label:"Lead Scraper", icon: Search },
  { id:"outreach",  label:"Outreach",     icon: Send },
  { id:"analytics", label:"Analytics",    icon: BarChart3 },
];

export default function App() {
  const [page, setPage] = useState("dashboard");
  const [view, setView] = useState("board");
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex h-screen" style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", backgroundColor: "#f7f8fa" }}>

      {/* ─── SIDEBAR ─── */}
      <div className="flex flex-col flex-shrink-0 transition-all duration-300" style={{ width: collapsed ? 72 : 250, backgroundColor: DARK }}>
        <div className="px-4 py-5 flex items-center gap-3" style={{ borderBottom: "1px solid #2d4050" }}>
          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: BLUE }}>
            <MapPin size={18} className="text-white" />
          </div>
          {!collapsed && (
            <div>
              <p className="text-sm font-black text-white tracking-wide">TRACK<span style={{ color: BLUE }}>NOW</span></p>
              <p style={{ fontSize: 9, color: "#6b8299", letterSpacing: "0.08em" }}>TAKE CONTROL OF YOUR ASSETS</p>
            </div>
          )}
        </div>

        <nav className="flex-1 py-4 px-2.5 space-y-1">
          {NAV.map(n => {
            const active = page === n.id;
            return (
              <button key={n.id} onClick={() => setPage(n.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all"
                style={{
                  backgroundColor: active ? BLUE : "transparent",
                  color: active ? "#fff" : "#8a9bb5",
                }}>
                <n.icon size={18} />
                {!collapsed && <span>{n.label}</span>}
              </button>
            );
          })}
        </nav>

        {!collapsed && (
          <div className="px-4 py-3" style={{ borderTop: "1px solid #2d4050" }}>
            <p style={{ fontSize: 9, color: "#5a7389", letterSpacing: "0.1em", marginBottom: 8 }}>PRODUCTS</p>
            {["OBD 2 Tracker","Hardwired GPS","Custom Solutions","Self Powered"].map(p => (
              <p key={p} style={{ fontSize: 11, color: "#7a95ad", marginBottom: 4 }}>{p}</p>
            ))}
          </div>
        )}

        <div className="px-3 py-3" style={{ borderTop: "1px solid #2d4050" }}>
          <div className="flex items-center gap-2.5 mb-2.5">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ backgroundColor: BLUE }}>MS</div>
            {!collapsed && (
              <div>
                <p className="text-xs font-semibold text-white">Mark Speelmeyer</p>
                <p style={{ fontSize: 10, color: "#6b8299" }}>Managing Director</p>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ backgroundColor: TEAL }}>JG</div>
            {!collapsed && (
              <div>
                <p className="text-xs font-semibold text-white">James</p>
                <p style={{ fontSize: 10, color: "#6b8299" }}>Partner</p>
              </div>
            )}
          </div>
        </div>

        <button onClick={() => setCollapsed(!collapsed)} className="py-3 flex items-center justify-center transition" style={{ borderTop: "1px solid #2d4050", color: "#6b8299" }}>
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {/* ─── MAIN ─── */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200 flex-shrink-0">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Search leads, companies, contacts..." className="pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg w-96 bg-gray-50 focus:bg-white focus:border-blue-300 focus:outline-none transition" />
          </div>
          <div className="flex items-center gap-4">
            <a href="https://www.tracknow.com.au" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs font-medium hover:underline" style={{ color: BLUE }}>
              <Globe size={13} /> tracknow.com.au <ExternalLink size={10} />
            </a>
            <div className="relative">
              <AlertCircle size={18} className="text-gray-400" />
              <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full" style={{ backgroundColor: BLUE }} />
            </div>
            <span className="text-xs text-gray-400">31 Mar 2026</span>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {page === "dashboard" && <Dashboard />}
          {page === "pipeline"  && <Pipeline view={view} setView={setView} />}
          {page === "scraper"   && <Scraper />}
          {page === "outreach"  && <Outreach />}
          {page === "analytics" && <Analytics />}
        </div>
      </div>
    </div>
  );
}
