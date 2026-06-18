/* ============== ColorMe Cozy — shared app logic (EN/PT/ES) ============== */
const STORE = "https://funnycolor-2.myshopify.com";
const LANG = (document.documentElement.lang || "en").slice(0, 2);

/* Design names stay in English to match the Shopify variant titles the
   customer receives at checkout; only the little tag is localized. */
const DESIGNS = [
  {id:"48385664647338", name:"Mushroom",      soldOut:true, img:"https://cdn.shopify.com/s/files/1/0711/0511/8378/files/Sc5ad68911c914127bade544aaeb7eb972.webp?v=1780944966", tag:{en:"Mushrooms & wildflowers", pt:"Cogumelos e flores",  es:"Hongos y flores"}},
  {id:"48385664680106", name:"Flower",        img:"https://cdn.shopify.com/s/files/1/0711/0511/8378/files/S9a54d8b92204461b865905bdd9faa2732.webp?v=1780944967", tag:{en:"Roses in full bloom",    pt:"Rosas em flor",      es:"Rosas en flor"}},
  {id:"48385664712874", name:"Cattle",        img:"https://cdn.shopify.com/s/files/1/0711/0511/8378/files/S6cd168d42d954c9abb0bae66c4d9f4a0B.webp?v=1780944966", tag:{en:"Teacups & sweet treats", pt:"Xícaras e doces",    es:"Tacitas y dulces"}},
  {id:"48385664745642", name:"Monster",       img:"https://cdn.shopify.com/s/files/1/0711/0511/8378/files/S52c6efcae6fd4c72a158d97b2bf0220cn.webp?v=1780944966", tag:{en:"Silly little monsters",  pt:"Monstrinhos fofos",  es:"Monstruitos divertidos"}},
  {id:"48385664778410", name:"Small animals", img:"https://cdn.shopify.com/s/files/1/0711/0511/8378/files/Sb6fe90b3ca06437eb35da7d6f5ba07e4p.webp?v=1780944967", tag:{en:"Cats, pups & rainbows",  pt:"Gatos, cães e arco-íris", es:"Gatos, perritos y arcoíris"}}
];
const tagOf = (d) => (d.tag[LANG] || d.tag.en);
const SOLD = ({ en: "Sold out", pt: "Esgotado", es: "Agotado" })[LANG] || "Sold out";

// default selection = first design that is NOT sold out
let selected = DESIGNS.find((d) => !d.soldOut) || DESIGNS[0];

/* ---------- build swatches ---------- */
const swWrap = document.getElementById("swatches");
if (swWrap) {
  DESIGNS.forEach((d) => {
    const b = document.createElement("button");
    b.className = "swatch" + (d === selected ? " active" : "") + (d.soldOut ? " sold" : "");
    b.dataset.id = d.id;
    if (d.soldOut) b.setAttribute("aria-disabled", "true");
    b.innerHTML = `
      <img class="thumb" loading="lazy" decoding="async" src="${d.img}" alt="${d.name}"/>
      <span class="sinfo"><b>${d.name}</b><span>${d.soldOut ? SOLD : tagOf(d)}</span></span>
      <span class="chk"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#16130F" stroke-width="3.4"><path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
    if (!d.soldOut) b.addEventListener("click", () => select(d, b));
    swWrap.appendChild(b);
  });
}

/* ---------- select a design ---------- */
function select(d, btn) {
  selected = d;
  document.querySelectorAll(".swatch").forEach((s) => s.classList.remove("active"));
  if (btn) btn.classList.add("active");
  const fade = (id) => { const el = document.getElementById(id); if (!el) return; el.style.opacity = 0; setTimeout(() => { el.src = d.img; el.style.opacity = 1; }, 160); };
  fade("pickImg");
  const bb = document.getElementById("bbImg"); if (bb) bb.src = d.img;
  const pl = document.getElementById("pickLabel"); if (pl) pl.textContent = d.name;
  const n2 = document.getElementById("pickName2"); if (n2) n2.textContent = d.name;
  updateBuyLinks();
}

/* ---------- buy links -> Shopify cart permalink ---------- */
function updateBuyLinks() {
  const url = `${STORE}/cart/${selected.id}:1`;
  document.querySelectorAll("a.js-buy").forEach((a) => a.setAttribute("href", url));
}
updateBuyLinks();

/* sync picker preview + sticky bar to the default (first available) design */
(function initSelection() {
  const set = (id, fn) => { const el = document.getElementById(id); if (el) fn(el); };
  set("pickImg", (el) => (el.src = selected.img));
  set("bbImg", (el) => (el.src = selected.img));
  set("pickLabel", (el) => (el.textContent = selected.name));
  set("pickName2", (el) => (el.textContent = selected.name));
})();

/* ---------- scroll reveal ---------- */
const io = new IntersectionObserver((entries) => {
  entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
}, { threshold: 0.14, rootMargin: "0px 0px -40px 0px" });
document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

/* ---------- sticky buy bar ---------- */
const buybar = document.getElementById("buybar");
const heroSentinel = document.querySelector(".hero");
if (buybar && heroSentinel) {
  const io2 = new IntersectionObserver((entries) => {
    entries.forEach((e) => buybar.classList.toggle("show", !e.isIntersecting));
  }, { threshold: 0 });
  io2.observe(heroSentinel);
}

/* ---------- hero marker cursor (desktop) ---------- */
const dot = document.getElementById("cursorDot");
const heroArea = document.querySelector(".hero");
if (dot && heroArea && window.matchMedia("(pointer:fine)").matches) {
  heroArea.addEventListener("mousemove", (e) => { dot.style.display = "block"; dot.style.left = e.clientX + "px"; dot.style.top = e.clientY + "px"; });
  heroArea.addEventListener("mouseleave", () => { dot.style.display = "none"; });
}

/* ---------- Meta Pixel: funnel events (Purchase fires on Shopify checkout) ---------- */
if (typeof fbq === "function") {
  fbq("track", "ViewContent", { content_name: "ColorMe Cozy Blanket", content_type: "product", value: 39.97, currency: "USD" });
}
document.querySelectorAll("a.js-buy").forEach((a) => {
  a.addEventListener("click", () => {
    if (typeof fbq === "function") {
      fbq("track", "AddToCart", { content_name: selected.name, content_type: "product", value: 39.97, currency: "USD" });
    }
  });
});
