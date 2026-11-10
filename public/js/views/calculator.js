import { state, esc, pageHead, barCalc, packagePrice, list, money, byId } from '../core.js';

let v = { guests: 100, hours: 4, liquor: 50, wine: 30, beer: 20, drinkers: 85, packageId: '' };

export function render(el, route) {
  if (route.query.get('guests')) v.guests = Number(route.query.get('guests')) || v.guests;
  if (route.query.get('hours')) v.hours = Number(route.query.get('hours')) || v.hours;
  el.innerHTML = `
    ${pageHead('Bar Calculator', 'Estimate drinks, alcohol, ice & staffing for any event — and price it.')}
    <div class="grid-2">
      <form class="card" id="calcForm">
        <div class="form-grid">
          <div class="field"><label>Guests</label><input type="number" name="guests" min="0" value="${v.guests}" inputmode="numeric"></div>
          <div class="field"><label>Hours of service</label><input type="number" name="hours" min="0" step="0.5" value="${v.hours}" inputmode="decimal"></div>
          <div class="field full"><label>% of guests drinking alcohol: <b id="dl">${v.drinkers}%</b></label><input type="range" name="drinkers" min="0" max="100" step="5" value="${v.drinkers}"></div>
          <h4 class="form-section full">Drink mix (should total 100%)</h4>
          <div class="field"><label>Liquor / cocktails %</label><input type="number" name="liquor" min="0" max="100" value="${v.liquor}"></div>
          <div class="field"><label>Wine %</label><input type="number" name="wine" min="0" max="100" value="${v.wine}"></div>
          <div class="field"><label>Beer %</label><input type="number" name="beer" min="0" max="100" value="${v.beer}"></div>
          <div class="field"><label>Price with package</label><select name="packageId"><option value="">—</option>${list('packages').filter((p) => p.active !== false).map((p) => `<option value="${p.id}" ${p.id === v.packageId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
        </div>
        <p class="muted small">Rule of thumb: ${state.settings.drinksFirstHour || 2} drinks per guest the first hour, ${state.settings.drinksPerHourAfter || 1} per hour after (change in Settings). 750ml ≈ 16 pours of 1.5oz; a wine bottle ≈ 5 glasses.</p>
      </form>
      <section class="card" id="calcOut"></section>
    </div>`;
  const form = el.querySelector('#calcForm');
  const out = el.querySelector('#calcOut');
  const draw = () => {
    const f = Object.fromEntries(new FormData(form));
    v = { guests: Number(f.guests) || 0, hours: Number(f.hours) || 0, liquor: Number(f.liquor) || 0, wine: Number(f.wine) || 0, beer: Number(f.beer) || 0, drinkers: Number(f.drinkers) || 0, packageId: f.packageId };
    el.querySelector('#dl').textContent = v.drinkers + '%';
    const mixTotal = v.liquor + v.wine + v.beer;
    const c = barCalc({ guests: v.guests, hours: v.hours, drinkers: v.drinkers, mix: { liquor: v.liquor, wine: v.wine, beer: v.beer } });
    const pkg = byId('packages', v.packageId);
    const liq = Math.ceil(c.liquorBottles750);
    out.innerHTML = `
      <div class="card-head"><h3>≈ ${c.totalDrinks.toLocaleString()} drinks</h3></div>
      ${mixTotal !== 100 ? `<div class="alert alert-warn">Drink mix adds up to ${mixTotal}% — adjust to 100%.</div>` : ''}
      <h4>Alcohol</h4>
      <ul class="kv">
        <li><span>Liquor — 750ml bottles</span><b>${liq}</b></li>
        <li><span>&nbsp;&nbsp;or 1.75L handles</span><b>${c.liquor175L}</b></li>
        <li><span>&nbsp;&nbsp;suggested split</span><b class="small">${Math.ceil(liq * 0.4)} vodka · ${Math.ceil(liq * 0.2)} tequila · ${Math.ceil(liq * 0.2)} whiskey · ${Math.ceil(liq * 0.1)} rum · ${Math.ceil(liq * 0.1)} gin</b></li>
        <li><span>Wine — 750ml bottles</span><b>${c.wineBottles}</b></li>
        <li><span>&nbsp;&nbsp;suggested split</span><b class="small">${Math.ceil(c.wineBottles * 0.5)} white/rosé · ${Math.floor(c.wineBottles * 0.5)} red</b></li>
        <li><span>Beer — cans/bottles</span><b>${c.beerCans} (${c.beerCases} cases)</b></li>
      </ul>
      <h4>Supplies</h4>
      <ul class="kv">
        <li><span>Mixers & juices (liters)</span><b>${c.mixersLiters}</b></li>
        <li><span>Ice (lbs)</span><b>${c.iceLbs}</b></li>
        <li><span>Cups</span><b>${c.cups}</b></li>
        <li><span>Cocktail napkins</span><b>${c.napkins}</b></li>
        <li><span>Water / soft drinks for non-drinkers (cans)</span><b>${Math.ceil(v.guests * (1 - v.drinkers / 100) * v.hours * 1.2 + v.guests * 0.5)}</b></li>
      </ul>
      <h4>Staffing</h4>
      <ul class="kv">
        <li><span>Bartenders (≈1 per 75 guests)</span><b>${c.bartenders}</b></li>
        <li><span>Barbacks</span><b>${c.barbacks}</b></li>
      </ul>
      ${pkg ? `<h4>Pricing</h4><ul class="kv"><li><span>${esc(pkg.name)}</span><b>${money(packagePrice(pkg, v.guests, v.hours))}</b></li><li><span>Per guest</span><b>${money(v.guests ? packagePrice(pkg, v.guests, v.hours) / v.guests : 0)}</b></li></ul>` : ''}
      <button class="btn btn-sm" type="button" id="copyList">Copy shopping list</button>`;
    out.querySelector('#copyList').onclick = () => {
      const txt = `Shopping list — ${v.guests} guests, ${v.hours} hrs\nLiquor: ${liq} × 750ml\nWine: ${c.wineBottles} bottles\nBeer: ${c.beerCans} (${c.beerCases} cases)\nMixers: ${c.mixersLiters} L\nIce: ${c.iceLbs} lbs\nCups: ${c.cups}\nNapkins: ${c.napkins}`;
      navigator.clipboard?.writeText(txt).then(() => alert('Copied!'), () => prompt('Copy:', txt));
    };
  };
  form.addEventListener('input', draw);
  form.addEventListener('submit', (e) => e.preventDefault());
  draw();
}
