/* Standalone interactions for the exported public pages; no auth or CMS data. */
(() => {
  'use strict';
  const toggle = document.querySelector('.menu-toggle');
  const navigation = document.querySelector('#main-navigation');
  if (toggle && navigation) {
    const setOpen = (open) => {
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
      navigation.classList.toggle('is-open', open);
    };
    toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
    navigation.addEventListener('click', (event) => { if (event.target.closest('a')) setOpen(false); });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') { setOpen(false); toggle.focus(); }
    });
    document.addEventListener('click', (event) => { if (!event.target.closest('.site-header')) setOpen(false); });
    document.addEventListener('focusin', (event) => { if (!event.target.closest('.site-header')) setOpen(false); });
    window.addEventListener('resize', () => { if (getComputedStyle(toggle).display === 'none') setOpen(false); });
  }
  document.querySelectorAll('.catalog').forEach((catalog) => {
    const grid = catalog.querySelector('.catalog-grid');
    const search = catalog.querySelector('input[type="search"]');
    if (!grid || !search) return;
    const cards = Array.from(grid.children).filter((card) => card.matches('article, details'));
    const category = catalog.querySelector('select[id^="catalog-category-"]');
    const region = catalog.querySelector('#catalog-region');
    const meta = catalog.querySelector('.catalog-meta');
    const count = meta && meta.querySelector('[aria-live]');
    const reset = document.createElement('button');
    reset.type = 'button'; reset.className = 'text-link'; reset.textContent = 'Сбросить фильтры'; reset.hidden = true;
    if (meta) meta.appendChild(reset);
    const empty = document.createElement('div');
    empty.className = 'catalog-empty'; empty.hidden = true;
    const heading = document.createElement('h2'); heading.textContent = 'Ничего не найдено';
    const hint = document.createElement('p'); hint.textContent = 'Попробуйте другое название или сбросьте фильтры.';
    const showAll = document.createElement('button'); showAll.type = 'button'; showAll.className = 'btn btn-primary'; showAll.textContent = 'Показать всё';
    empty.append(heading, hint, showAll); grid.after(empty);
    const normalize = (value) => value.trim().toLocaleLowerCase('ru-RU');
    const records = cards.map((card) => ({ card, text: normalize(card.textContent || ''), category: card.dataset.category || '', region: card.dataset.region || '' }));
    function update() {
      const needle = normalize(search.value);
      let visible = 0;
      records.forEach((entry) => {
        const match = (!needle || entry.text.includes(needle)) && (!category || !category.value || entry.category === category.value) && (!region || !region.value || entry.region === region.value);
        entry.card.hidden = !match; if (match) visible += 1;
      });
      if (count) count.textContent = `Найдено: ${visible}`;
      reset.hidden = !(search.value || (category && category.value) || (region && region.value));
      empty.hidden = visible > 0; grid.hidden = visible === 0;
    }
    function clear() { search.value = ''; if (category) category.value = ''; if (region) region.value = ''; update(); search.focus(); }
    search.addEventListener('input', update);
    if (category) category.addEventListener('change', update);
    if (region) region.addEventListener('change', update);
    reset.addEventListener('click', clear); showAll.addEventListener('click', clear);
    update();
  });
})();
