import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import Calc from './Calc'
import { AgendaViz, CallViz, DashboardViz, FlowViz, PipelineViz, RingViz, RoutineViz, SequenceViz, WhatsViz } from './Visuals'
import { COPY, type Lang } from './copy'

/**
 * Página pública de recrutamento: /equipe (pt) · /equipe/en · /equipe/es
 * Visual da home (public/nova): fundo escuro, violeta, cartões de vidro. Texto em ./copy.ts.
 * Link vai nos e-mails de recrutamento (src/lib/recruit-agents.ts).
 */
const WA = 'https://wa.me/17867442126'
const isLang = (s: string): s is Lang => s === 'pt' || s === 'en' || s === 'es'
const langOf = (seg?: string[]): Lang | null => (!seg || seg.length === 0 ? 'pt' : seg.length === 1 && isLang(seg[0]) && seg[0] !== 'pt' ? (seg[0] as Lang) : null)
const LOCALE: Record<Lang, string> = { pt: 'pt-BR', en: 'en-US', es: 'es-US' }

export const dynamicParams = false
export function generateStaticParams() { return [{ lang: [] }, { lang: ['en'] }, { lang: ['es'] }] }

export async function generateMetadata({ params }: { params: Promise<{ lang?: string[] }> }): Promise<Metadata> {
  const l = langOf((await params).lang)
  if (!l) return { title: 'Lead4Pro', robots: { index: false, follow: false } }
  return { title: `${COPY[l].title} — Lead4Pro`, description: COPY[l].desc, robots: { index: false, follow: false }, openGraph: { title: `${COPY[l].title} — Lead4Pro`, description: COPY[l].desc, type: 'website' } }
}

const CSS = `
.eq{--bg:#04060c;--card:rgba(30,34,52,.62);--line:rgba(255,255,255,.085);--txt:#eef1f8;--mut:#b3bdd3;--vio:#7c3aed;--vio2:#8b5cf6;--vio3:#a78bfa;--ok:#10b981;--ok2:#34d399;--bad:#f43f5e;
 background:var(--bg);color:var(--txt);min-height:100vh;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;overflow-x:hidden;position:relative;line-height:1.5}
.eq *{box-sizing:border-box}
.eq a{color:inherit}
.eq::before{content:"";position:absolute;inset:0 0 auto 0;height:900px;background:radial-gradient(60% 55% at 50% 0%,rgba(124,58,237,.34),transparent 70%),radial-gradient(40% 40% at 90% 12%,rgba(14,165,233,.14),transparent 70%);pointer-events:none}
.eq-wrap{max-width:1080px;margin:0 auto;padding:0 20px;position:relative}
.eq-nav{display:flex;align-items:center;justify-content:space-between;padding:22px 0}
.eq-logo{font-weight:800;font-size:21px;letter-spacing:-.3px}.eq-logo span{color:var(--vio3)}
.eq-nav-r{display:flex;align-items:center;gap:16px;font-size:13px;color:var(--mut)}
.eq-nav-r a{text-decoration:none}.eq-nav-r a:hover{color:#fff}
.eq-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;background:linear-gradient(100deg,#6d28d9,#7c3aed 55%,#8b5cf6);color:#fff!important;font-weight:700;font-size:17px;padding:15px 30px;border-radius:14px;text-decoration:none;box-shadow:0 10px 36px -8px rgba(124,58,237,.7);transition:transform .15s,box-shadow .15s}
.eq-btn:hover{transform:translateY(-2px);box-shadow:0 14px 42px -8px rgba(139,92,246,.85)}
.eq-btn-sm{font-size:13px;padding:9px 16px;border-radius:10px;box-shadow:none}
.eq-hero{padding:46px 0 30px;text-align:center}
.eq-kick{display:inline-block;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;letter-spacing:1.6px;font-weight:700;color:var(--vio3);border:1px solid rgba(167,139,250,.35);background:rgba(124,58,237,.12);padding:6px 14px;border-radius:999px}
.eq h1,.eq h2{text-wrap:balance}
.eq h1{font-size:clamp(34px,6.4vw,62px);line-height:1.04;letter-spacing:-1.5px;font-weight:800;margin:20px auto 18px;max-width:900px}
.eq-grad{background:linear-gradient(100deg,#c4b5fd,#a78bfa 55%,#8b5cf6);-webkit-background-clip:text;background-clip:text;color:transparent;display:block}
.eq-sub{color:var(--mut);font-size:clamp(16px,2.2vw,20px);max-width:720px;margin:0 auto 28px}
.eq-chips{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:22px}
.eq-chip{font-size:14px;font-weight:600;padding:7px 13px;border-radius:999px;background:rgba(255,255,255,.05);border:1px solid var(--line);color:#d8def0}
.eq-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:38px 0 10px}
.eq-stat{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px 14px;text-align:center}
.eq-stat b{display:block;font-size:30px;letter-spacing:-.8px;background:linear-gradient(100deg,#c4b5fd,#8b5cf6);-webkit-background-clip:text;background-clip:text;color:transparent}
.eq-stat span{font-size:13.5px;color:var(--mut)}
.eq-sec{padding:64px 0 10px;text-align:center}
.eq-sec .eq-lead{margin-left:auto;margin-right:auto}
.eq-sec h2,.eq-final h2,.eq-20k h2{font-size:clamp(26px,4.4vw,40px);line-height:1.1;letter-spacing:-1px;font-weight:800;margin:14px auto 12px;max-width:820px}
.eq-sec-c{text-align:center}.eq-sec-c h2,.eq-sec-c .eq-lead{margin-left:auto;margin-right:auto}
.eq-lead{color:var(--mut);font-size:17px;max-width:720px;margin:0 0 28px}
.eq-feat,.eq-card,.eq-step,.eq-mock,.eq-ai,.eq-calc,.eq-pane{text-align:left}
.eq-cmp{display:grid;grid-template-columns:1fr 1.15fr;gap:16px;margin-top:8px}
.eq-pane{border-radius:20px;padding:26px;border:1px solid var(--line);background:var(--card)}
.eq-pane h3{margin:0 0 6px;font-size:15px;letter-spacing:.4px;text-transform:uppercase;color:var(--mut)}
.eq-pane .eq-num{font-size:68px;font-weight:800;letter-spacing:-2px;line-height:1}
.eq-pane p{margin:4px 0 16px;color:var(--mut)}
.eq-pane-o{display:flex;flex-direction:column}.eq-pane ul{list-style:none;padding:0;margin:0;display:grid;gap:10px;font-size:15px}
.eq-pane li{display:flex;gap:10px;align-items:flex-start}
.eq-pane-o .eq-num{color:#8a96b0}
.eq-pane-o li{color:#c3cadc}.eq-pane-o li::before{content:"–";color:#6b7690}
.eq-pane-u{border-color:rgba(139,92,246,.6);background:linear-gradient(160deg,rgba(124,58,237,.22),rgba(30,34,52,.62) 60%);box-shadow:0 0 0 1px rgba(139,92,246,.25),0 24px 60px -24px rgba(124,58,237,.6)}
.eq-pane-u .eq-num{background:linear-gradient(100deg,#c4b5fd,#8b5cf6);-webkit-background-clip:text;background-clip:text;color:transparent}
.eq-pane-u li::before{content:"✔";color:var(--ok2);font-weight:800}
.eq-calc{margin-top:16px;border-radius:20px;border:1px solid var(--line);background:var(--card);padding:26px}
.eq-calc h3{margin:0 0 4px;font-size:22px}.eq-mut{color:var(--mut);margin:0 0 18px}
.eq-lbl{display:block;font-size:13px;color:var(--mut)}
.eq-big-num{font-size:40px;font-weight:800;letter-spacing:-1px;margin:4px 0 8px}
.eq-range{width:100%;height:28px;cursor:pointer;-webkit-appearance:none;appearance:none;background:transparent}
.eq-range::-webkit-slider-runnable-track{height:8px;border-radius:99px;background:rgba(255,255,255,.12)}
.eq-range::-moz-range-track{height:8px;border-radius:99px;background:rgba(255,255,255,.12)}
.eq-range::-webkit-slider-thumb{-webkit-appearance:none;width:24px;height:24px;margin-top:-8px;border-radius:50%;background:#a78bfa;border:3px solid #fff;box-shadow:0 2px 10px rgba(124,58,237,.7)}
.eq-range::-moz-range-thumb{width:20px;height:20px;border-radius:50%;background:#a78bfa;border:3px solid #fff}
.eq-bars{display:grid;gap:12px;margin:18px 0}
.eq-bar-row{display:grid;grid-template-columns:150px 1fr 90px;gap:12px;align-items:center;font-size:14px}
.eq-bar-row b{text-align:right}
.eq-track{height:14px;border-radius:99px;background:rgba(255,255,255,.07);overflow:hidden}
.eq-fill{height:100%;border-radius:99px;transition:width .25s}
.eq-fill-o{background:#5d6880}.eq-fill-u{background:linear-gradient(90deg,#7c3aed,#a78bfa)}
.eq-diff{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.eq-diff>div{background:rgba(16,185,129,.1);border:1px solid rgba(52,211,153,.35);border-radius:14px;padding:14px;text-align:center}
.eq-diff>div{min-width:0}
.eq-diff strong{display:block;font-size:clamp(20px,6.4vw,28px);color:var(--ok2);letter-spacing:-.5px}.eq-diff span{font-size:13px;color:var(--mut)}
.eq-tiny{font-size:13px;color:#97a2bb;margin:14px 0 0}
.eq-feats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:26px}
.eq-feat{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px;transition:transform .15s,border-color .15s}
.eq-feat:hover{transform:translateY(-3px);border-color:rgba(167,139,250,.5)}
.eq-feat i{font-style:normal;font-size:26px;display:block;margin-bottom:8px;line-height:1.2}
.eq-feat h4{margin:0 0 4px;font-size:16px}.eq-feat p{margin:0;font-size:14px;color:var(--mut)}
.eq-duo{display:grid;grid-template-columns:1.2fr 1fr;gap:16px;margin-top:22px;align-items:stretch}
.eq-mock{border-radius:20px;border:1px solid var(--line);background:#0a0e1a;padding:16px;overflow:hidden}
.eq-mock-top{display:flex;gap:6px;align-items:center;margin-bottom:12px;font-size:12px;color:var(--mut)}
.eq-dot{width:9px;height:9px;border-radius:50%;background:#2a3350}
.eq-cols{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.eq-col{background:rgba(255,255,255,.03);border-radius:12px;padding:8px;min-height:120px}
.eq-col h5{margin:0 0 8px;font-size:11.5px;letter-spacing:.5px;text-transform:uppercase;color:var(--vio3)}
.eq-kc{background:rgba(124,58,237,.16);border:1px solid rgba(167,139,250,.25);border-radius:9px;padding:8px 9px;margin-bottom:6px;font-size:13px}
.eq-kc small{display:block;color:var(--mut);font-size:11.5px}
.eq-kc-ok{background:rgba(16,185,129,.16);border-color:rgba(52,211,153,.35)}
.eq-ill{font-size:12px;color:#97a2bb;margin:10px 0 0;text-align:right}
.eq-ai{border-radius:20px;border:1px solid rgba(139,92,246,.45);background:linear-gradient(160deg,rgba(124,58,237,.2),rgba(10,14,26,.9));padding:22px;display:flex;flex-direction:column;gap:12px}
.eq-ai h3{margin:0;font-size:20px;line-height:1.2}.eq-ai>p{margin:0;color:var(--mut);font-size:14px}
.eq-bub{border-radius:12px;padding:11px 13px;font-size:13.5px}
.eq-bub-c{background:rgba(255,255,255,.06)}.eq-bub-c b{display:block;font-size:11px;color:var(--mut);margin-bottom:2px;text-transform:uppercase;letter-spacing:.5px}
.eq-bub-a{background:rgba(16,185,129,.13);border:1px solid rgba(52,211,153,.35);color:#d5f7e8}
.eq-4{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:6px}
.eq-card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:22px}
.eq-card i{font-style:normal;font-size:30px;display:block;margin-bottom:10px}
.eq-card h4{margin:0 0 6px;font-size:17px}.eq-card p{margin:0;color:var(--mut);font-size:14px}
.eq-20k{margin-top:64px;border-radius:26px;padding:clamp(26px,5vw,52px);text-align:center;border:1px solid rgba(167,139,250,.5);background:radial-gradient(70% 90% at 50% 0%,rgba(124,58,237,.42),rgba(10,14,26,.95) 70%);box-shadow:0 30px 80px -30px rgba(124,58,237,.7)}
.eq-20k .eq-k20{font-size:clamp(72px,16vw,150px);font-weight:900;letter-spacing:-5px;line-height:.95;background:linear-gradient(100deg,#e9e0ff,#a78bfa 50%,#7c3aed);-webkit-background-clip:text;background-clip:text;color:transparent}
.eq-20k h2{font-size:clamp(24px,4vw,36px);max-width:760px}
.eq-formula{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;align-items:center;margin:26px 0 6px}
.eq-fx{padding:10px 16px;border-radius:12px;background:rgba(255,255,255,.07);border:1px solid var(--line);font-weight:600;font-size:15px}
.eq-fx-last{background:linear-gradient(100deg,#7c3aed,#a78bfa);border-color:transparent;color:#fff}
.eq-op{color:var(--vio3);font-weight:800;font-size:20px}
.eq-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:6px;counter-reset:s}
.eq-sec h2+.eq-steps{margin-top:26px}
.eq-step{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:22px;counter-increment:s}
.eq-step::before{content:counter(s);display:flex;width:34px;height:34px;border-radius:50%;align-items:center;justify-content:center;background:linear-gradient(100deg,#7c3aed,#a78bfa);font-weight:800;margin-bottom:10px}
.eq-final{text-align:center;padding:70px 0 10px}
.eq-final h2{font-size:clamp(28px,5vw,46px);letter-spacing:-1.2px}
.eq-foot{border-top:1px solid var(--line);margin-top:24px;padding:22px 0 100px;font-size:13px;color:#9aa5bd;text-align:center}
.eq-foot p{max-width:760px;margin:0 auto 8px}
.eq-sticky{display:none}
@media (max-width:860px){
 .eq-stats,.eq-feats,.eq-4{grid-template-columns:repeat(2,1fr)}
 .eq-cmp,.eq-duo,.eq-steps{grid-template-columns:1fr}
 .eq-bar-row{grid-template-columns:1fr 70px;grid-template-areas:"a b" "c c"}
 .eq-bar-row span{grid-area:a}.eq-bar-row b{grid-area:b}.eq-bar-row .eq-track{grid-area:c}
 .eq-nav-r .eq-btn-sm{display:none}
 .eq-sticky{display:block;position:fixed;left:0;right:0;bottom:0;padding:10px 14px calc(10px + env(safe-area-inset-bottom));background:rgba(4,6,12,.92);backdrop-filter:blur(10px);border-top:1px solid var(--line);z-index:50}
 .eq-sticky .eq-btn{width:100%;padding:13px}
}
@media (max-width:520px){.eq-calc{padding:20px 16px}.eq-big-num{font-size:34px}.eq-feats,.eq-4{grid-template-columns:1fr}.eq-cols{grid-template-columns:repeat(2,1fr)}.eq-pane .eq-num{font-size:56px}}

.eq-g2{display:grid;grid-template-columns:1.35fr 1fr;gap:14px;margin-top:22px;text-align:left;align-items:stretch}
.eq-wide{margin-top:14px;text-align:left}
.eq-g3{display:grid;grid-template-columns:1fr 1.3fr;gap:14px;margin-top:14px;text-align:left;align-items:start}
.eq-stack{display:grid;gap:14px}
.vz-frame{border-radius:18px;border:1px solid var(--line);background:#0a0e1a;overflow:hidden;box-shadow:0 20px 50px -28px rgba(124,58,237,.55)}
.vz-bar{display:flex;align-items:center;gap:6px;padding:10px 12px;border-bottom:1px solid var(--line);font-size:12px;color:var(--mut)}
.vz-bar i{width:9px;height:9px;border-radius:50%;background:#2a3350}.vz-bar span{margin-left:8px;font-weight:600;color:#d8def0}.vz-bar em{margin-left:auto;font-style:normal;color:#f87171;font-weight:700;font-size:11px}
.vz-body{padding:12px}
.vz-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px}
.vz-kpi{background:rgba(255,255,255,.04);border-radius:10px;padding:8px}.vz-kpi small,.vz-card small{display:block;font-size:12px;color:var(--mut)}.vz-kpi b{font-size:22px;letter-spacing:-.5px}
.vz-row2{display:grid;grid-template-columns:1.6fr 1fr;gap:8px;margin-bottom:8px}
.vz-card{background:rgba(255,255,255,.04);border-radius:12px;padding:10px}
.vz-svg{width:100%;height:auto;display:block;margin-top:4px}.vz-svg-s{width:92px;display:block;margin:6px auto 0}.vz-donut{text-align:center}
.vz-fun{display:grid;gap:7px;margin-top:8px}.vz-fun-r{display:grid;grid-template-columns:78px 1fr 26px;gap:8px;align-items:center;font-size:12px;color:var(--mut)}.vz-fun-r b{color:#fff;text-align:right}
.vz-fun-r div{height:10px;border-radius:99px;background:rgba(255,255,255,.07);overflow:hidden}.vz-fun-r u{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#7c3aed,#a78bfa)}
.vz-cols{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.vz-col{background:rgba(255,255,255,.03);border-radius:12px;padding:10px;min-height:190px;border-top:2px solid var(--cc)}
.vz-col h5{display:flex;align-items:center;gap:5px;margin:0 0 8px;font-size:11px;letter-spacing:.3px;text-transform:uppercase;color:#d8def0}.vz-col h5 i{width:7px;height:7px;border-radius:50%;background:var(--cc)}.vz-col h5 b{margin-left:auto;background:rgba(255,255,255,.08);border-radius:99px;padding:0 7px;font-size:11px}
.vz-kc{display:grid;grid-template-columns:auto 1fr;gap:6px 7px;align-items:center;background:rgba(255,255,255,.05);border:1px solid var(--line);border-radius:10px;padding:7px;margin-bottom:7px;font-size:12px}
.vz-kc strong{display:block;font-size:13px;white-space:nowrap}.vz-kc small{display:block;font-size:11.5px;color:var(--mut);white-space:nowrap}.vz-kc>div:nth-child(2){min-width:0;overflow:hidden}
.vz-kc em{grid-column:1/-1;font-style:normal;font-size:9.5px;font-weight:800;color:#1c1300;background:#fbbf24;border-radius:6px;padding:1px 6px;justify-self:start}.vz-kc>span{grid-column:1/-1;font-size:11.5px;color:var(--mut)}
.vz-av{width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#a78bfa);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;flex:none}.vz-av-g{background:linear-gradient(135deg,#059669,#34d399);width:34px;height:34px;font-size:14px}
.vz-phone{display:flex;flex-direction:column;border-radius:30px;border:6px solid #1b2240;background:#0b1220;overflow:hidden;box-shadow:0 24px 60px -26px rgba(16,185,129,.4)}
.vz-ph-top{display:flex;align-items:center;gap:9px;padding:10px;background:#0f2a24;font-size:13px}.vz-ph-top small{display:block;color:#6ee7b7;font-size:11px}.vz-ph-top span{margin-left:auto}
.vz-chat{flex:1;padding:12px 10px;display:grid;align-content:start;gap:8px;min-height:240px;background:#0b1220}
.vz-b{max-width:88%;border-radius:12px;padding:8px 10px;font-size:12.5px;line-height:1.35}.vz-b small{display:block;font-size:11px;color:rgba(255,255,255,.65);margin-top:3px;text-align:right}
.vz-b-o{background:#0e5a45;justify-self:end;border-top-right-radius:3px}.vz-b-i{background:#1c2540;justify-self:start;border-top-left-radius:3px}
.vz-ph-in{display:flex;justify-content:space-between;margin:8px;padding:9px 12px;border-radius:99px;background:#1c2540;color:var(--mut);font-size:12px}.vz-ph-in span{color:#34d399}
.vz-call{display:grid;gap:10px}.vz-call-top{display:flex;align-items:center;gap:9px;font-size:13px}.vz-call-top small{display:block;color:var(--mut);font-size:11px}.vz-call-top b{margin-left:auto;font-size:20px;font-variant-numeric:tabular-nums;color:#f87171}
.vz-wave{width:100%;height:44px}
.vz-steps{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;font-size:11.5px;color:#c3cadc;text-align:center}.vz-steps div{display:grid;gap:3px;justify-items:center}
.vz-steps i{width:20px;height:20px;border-radius:50%;background:rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;font-style:normal;font-size:10px;font-weight:800}.vz-steps .done i{background:#10b981;color:#04120c}.vz-steps .now i{background:#8b5cf6;color:#fff;box-shadow:0 0 0 4px rgba(139,92,246,.3)}.vz-steps .now{color:#fff}
.vz-cli{font-size:12px;color:#d8def0;background:rgba(255,255,255,.06);border-radius:10px;padding:8px 10px}
.vz-aisug{font-size:12.5px;background:rgba(16,185,129,.13);border:1px solid rgba(52,211,153,.4);border-radius:10px;padding:9px 11px;color:#d5f7e8}.vz-aisug b{display:block;font-size:11px;margin-bottom:3px;color:#6ee7b7}
.vz-seq{position:relative;display:grid;grid-template-columns:repeat(5,1fr);gap:4px;text-align:center;padding:6px 0 2px}.vz-seq-line{position:absolute;left:10%;right:10%;top:25px;height:2px;background:linear-gradient(90deg,#34d399,#60a5fa,#a78bfa,#fbbf24,#34d399);opacity:.6}
.vz-seq-n{position:relative;display:grid;gap:2px;justify-items:center;font-size:11px}.vz-seq-n small{color:var(--mut);font-size:11.5px}.vz-seq-i{width:38px;height:38px;border-radius:50%;background:#0a0e1a;border:2px solid var(--cc);display:flex;align-items:center;justify-content:center;font-size:16px;margin-bottom:3px}
.vz-note{margin:8px 0 0;font-size:12px;color:#6ee7b7;text-align:center}
.vz-cal{display:grid;grid-template-columns:repeat(5,1fr);gap:5px;min-height:110px}.vz-cal-c{background:rgba(255,255,255,.03);border-radius:8px;padding:5px;min-width:0}.vz-cal-c small{display:block;font-size:10px;color:var(--mut);text-align:center;margin-bottom:3px}
.vz-ev{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:rgba(124,58,237,.3);border-left:3px solid #a78bfa;border-radius:5px;padding:4px 5px;font-size:11px;line-height:1.25}.vz-ev em{font-style:normal;color:#6ee7b7;font-weight:800}
.vz-pol{display:grid;gap:5px;margin-top:8px}.vz-pol-r{display:flex;align-items:center;gap:7px;font-size:12px;background:rgba(255,255,255,.04);border-radius:8px;padding:6px 8px}.vz-pol-r em{margin-left:auto;font-style:normal;font-size:10.5px}.vz-pol-r em.ok{color:#6ee7b7}.vz-pol-r em.warn{color:#fbbf24}
.vz-dot{width:8px;height:8px;border-radius:50%}.vz-dot.ok{background:#34d399}.vz-dot.warn{background:#fbbf24}
.vz-flow{display:grid;grid-template-columns:repeat(3,1fr);gap:56px;margin:6px 0 18px}
.vz-flow-s{position:relative;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:20px 12px;display:grid;gap:3px;justify-items:center;text-align:center}.vz-flow-s small{color:var(--mut);font-size:13px}
.vz-flow-i{width:56px;height:56px;border-radius:16px;background:linear-gradient(135deg,rgba(124,58,237,.5),rgba(167,139,250,.2));display:flex;align-items:center;justify-content:center;font-size:28px;margin-bottom:6px}
.vz-arrow{position:absolute;right:-45px;top:50%;width:34px;transform:translateY(-50%)}
.vz-routine{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:16px;margin:6px 0 18px}.vz-routine small{display:block;color:var(--mut);font-size:13px;margin-bottom:10px}
.vz-routine>div{display:grid;grid-template-columns:repeat(4,1fr);gap:30px}.vz-rt{position:relative;display:grid;justify-items:center;gap:4px;background:rgba(255,255,255,.04);border-radius:14px;padding:14px 6px}.vz-rt i{font-style:normal;font-size:26px}.vz-rt b{font-size:14px}.vz-rt span{position:absolute;right:-24px;top:50%;transform:translateY(-50%);color:var(--vio3);font-weight:800;font-size:20px;width:18px;text-align:center}
.vz-ring{width:min(340px,86vw);height:auto;display:block;margin:0 auto}
.eq-founders{display:grid;grid-template-columns:380px 1fr;gap:44px;align-items:center;text-align:left;max-width:900px;margin:0 auto}
.eq-ph{width:100%;height:auto;border-radius:24px;border:1px solid rgba(167,139,250,.5);box-shadow:0 30px 70px -30px rgba(124,58,237,.8)}
.eq-ph-cap{margin:14px 0 0;font-size:13px;color:var(--mut);font-weight:600}
@media (max-width:980px){.eq-g2,.eq-g3{grid-template-columns:1fr}.vz-phone{max-width:340px;margin:0 auto}}
@media (max-width:860px){.eq-founders{grid-template-columns:1fr;gap:24px;text-align:center}.eq-founders h2{text-align:center!important}.eq-ph{max-width:300px;margin:0 auto;display:block}.vz-flow{grid-template-columns:1fr;gap:30px}.vz-arrow{right:auto;left:50%;top:auto;bottom:-27px;transform:translateX(-50%) rotate(90deg)}.vz-routine>div{grid-template-columns:repeat(2,1fr);gap:10px}.vz-rt span{display:none}.vz-phone{max-width:340px;margin:0 auto}}
@media (max-width:520px){.vz-cols{grid-template-columns:repeat(2,1fr)}.vz-col{min-height:0}.vz-kpis{grid-template-columns:repeat(2,1fr)}.vz-row2{grid-template-columns:1fr}}
`

export default async function EquipePage({ params }: { params: Promise<{ lang?: string[] }> }) {
  const lang = langOf((await params).lang)
  if (!lang) notFound()
  const t = COPY[lang]
  const link = `${WA}?text=${encodeURIComponent(t.wa)}`
  return (
    <main className="eq" lang={LOCALE[lang]}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="eq-wrap">
        <nav className="eq-nav">
          <div className="eq-logo">Lead<span>4Pro</span></div>
          <div className="eq-nav-r">
            {t.other.map(o => <a key={o.href} href={o.href}>{o.label}</a>)}
            <a className="eq-btn eq-btn-sm" href={link}>{t.navCta}</a>
          </div>
        </nav>

        <header className="eq-hero">
          <span className="eq-kick">{t.kicker}</span>
          <h1>{t.h1a}<span className="eq-grad">{t.h1b}</span></h1>
          <p className="eq-sub">{t.sub}</p>
          <a className="eq-btn" href={link}>{t.cta} →</a>
          <div className="eq-chips">{t.chips.map(c => <span key={c} className="eq-chip">{c}</span>)}</div>
          <div className="eq-stats">{t.stats.map(s => <div key={s.l} className="eq-stat"><b>{s.n}</b><span>{s.l}</span></div>)}</div>
        </header>

        <section className="eq-sec eq-sec-c">
          <span className="eq-kick">{t.cmpK}</span>
          <h2>{t.cmpH}</h2>
          <p className="eq-lead">{t.cmpSub}</p>
          <div className="eq-cmp" style={{ textAlign: 'left' }}>
            <div className="eq-pane eq-pane-o">
              <h3>{t.othersT}</h3>
              <div className="eq-num">{t.othersBig}</div>
              <p>{t.othersP}</p>
              <ul>{t.othersList.map(x => <li key={x}>{x}</li>)}</ul>
            </div>
            <div className="eq-pane eq-pane-u">
              <h3>{t.usT}</h3>
              <div className="eq-num">{t.usBig}</div>
              <p>{t.usP}</p>
              <ul>{t.usList.map(x => <li key={x}>{x}</li>)}</ul>
            </div>
          </div>
          <div style={{ textAlign: 'left' }}><Calc t={t.calc} locale={LOCALE[lang]} /></div>
        </section>

        <section className="eq-sec">
          <span className="eq-kick">{t.crmK}</span>
          <h2>{t.crmH}</h2>
          <p className="eq-lead">{t.crmSub}</p>
          <div className="eq-g2"><DashboardViz lang={lang} /><WhatsViz lang={lang} /></div>
          <div className="eq-wide"><PipelineViz lang={lang} /></div>
          <div className="eq-g3"><CallViz lang={lang} /><div className="eq-stack"><SequenceViz lang={lang} /><AgendaViz lang={lang} /></div></div>
          <p className="eq-ill" style={{ textAlign: 'center' }}>{t.mock.ill}</p>
          <div className="eq-feats">{t.feats.map(f => <div key={f.h} className="eq-feat"><i>{f.i}</i><h4>{f.h}</h4><p>{f.p}</p></div>)}</div>
        </section>

        <section className="eq-sec">
          <span className="eq-kick">{t.leadsK}</span>
          <h2>{t.leadsH}</h2>
          <p className="eq-lead">{t.leadsSub}</p>
          <FlowViz lang={lang} />
          <div className="eq-4">{t.leads.map(c => <div key={c.h} className="eq-card"><i>{c.i}</i><h4>{c.h}</h4><p>{c.p}</p></div>)}</div>
        </section>

        <section className="eq-sec">
          <span className="eq-kick">{t.trK}</span>
          <h2>{t.trH}</h2>
          <p className="eq-lead">{t.trSub}</p>
          <RoutineViz lang={lang} />
          <div className="eq-4">{t.tr.map(c => <div key={c.h} className="eq-card"><i>{c.i}</i><h4>{c.h}</h4><p>{c.p}</p></div>)}</div>
        </section>

        <section className="eq-20k">
          <span className="eq-kick">{t.mK}</span>
          <RingViz lang={lang} />
          <h2>{t.mH}</h2>
          <p className="eq-lead" style={{ margin: '0 auto' }}>{t.mSub}</p>
          <div className="eq-formula">
            {t.formula.map((x, i) => (
              <span key={x} style={{ display: 'contents' }}>
                {i > 0 && <span className="eq-op">{i === t.formula.length - 1 ? '=' : '+'}</span>}
                <span className={`eq-fx${i === t.formula.length - 1 ? ' eq-fx-last' : ''}`}>{x}</span>
              </span>
            ))}
          </div>
          <p className="eq-tiny" style={{ marginTop: 16 }}>{t.mDisc}</p>
        </section>

        <section className="eq-sec">
          <div className="eq-founders">
            <Image src="/quem-somos.jpg" alt="Leandro & Regiane — Lead4Pro" width={840} height={1260} sizes="(max-width:860px) 80vw, 380px" className="eq-ph" priority />
            <div>
              <span className="eq-kick">{t.fK}</span>
              <h2 style={{ textAlign: 'left', margin: '14px 0 12px' }}>{t.fH}</h2>
              <p className="eq-lead" style={{ margin: '0 0 22px' }}>{t.fP}</p>
              <a className="eq-btn" href={link}>{t.cta} →</a>
              <p className="eq-ph-cap">Leandro &amp; Regiane · Lead4Pro</p>
            </div>
          </div>
        </section>

        <section className="eq-sec">
          <h2>{t.howH}</h2>
          <div className="eq-steps">{t.how.map(x => <div key={x} className="eq-step">{x}</div>)}</div>
        </section>

        <section className="eq-final">
          <h2>{t.finalH}</h2>
          <p className="eq-lead" style={{ margin: '0 auto 24px' }}>{t.finalSub}</p>
          <a className="eq-btn" href={link}>{t.cta} →</a>
          <p className="eq-tiny" style={{ marginTop: 14 }}>{t.note}</p>
        </section>

        <footer className="eq-foot">
          <p>{t.disc}</p>
          <p>© Lead4Pro · <a href="/privacy">{t.privacy}</a></p>
        </footer>
      </div>
      <div className="eq-sticky"><a className="eq-btn" href={link}>{t.cta} →</a></div>
    </main>
  )
}
