/*
 * La Carrera más Linda de Boyacá · Resultados y diplomas
 * Lee el PDF oficial de clasificación en el navegador y muestra el diploma
 * correspondiente desde DIPLOMAS.pdf. Funciona sin servidor (file://).
 */
(function () {
  'use strict';

  var CATEGORY_ORDER = { '21K': 0, '10K': 1, '5K': 2, '1K': 3 };
  var GENDER_ORDER = { 'Damas': 0, 'Hombres': 1 };
  var FALLBACK = Array.isArray(window.ATHLETES_FALLBACK) ? window.ATHLETES_FALLBACK : [];

  /* PDF.js v3 extrae el texto de estos PDF con los bytes UTF-8 leídos como
     CP437 (por ejemplo "Marat├│n"). Este mapa reconstruye los bytes y los
     decodifica de nuevo como UTF-8. */
  var CP437_HIGH = [
    199, 252, 233, 226, 228, 224, 229, 231, 234, 235, 232, 239, 238, 236, 196, 197,
    201, 230, 198, 244, 246, 242, 251, 249, 255, 214, 220, 162, 163, 165, 8359, 402,
    225, 237, 243, 250, 241, 209, 170, 186, 191, 8976, 172, 189, 188, 161, 171, 187,
    9617, 9618, 9619, 9474, 9508, 9569, 9570, 9558, 9557, 9571, 9553, 9559, 9565, 9564, 9563, 9488,
    9492, 9524, 9516, 9500, 9472, 9532, 9566, 9567, 9562, 9556, 9577, 9574, 9568, 9552, 9580, 9575,
    9576, 9572, 9573, 9561, 9560, 9554, 9555, 9579, 9578, 9496, 9484, 9608, 9604, 9612, 9616, 9600,
    945, 223, 915, 960, 931, 963, 181, 964, 934, 920, 937, 948, 8734, 966, 949, 8745,
    8801, 177, 8805, 8804, 8992, 8993, 247, 8776, 176, 8729, 183, 8730, 8319, 178, 9632, 160
  ];
  var CP437_REVERSE = new Map();
  CP437_HIGH.forEach(function (code, i) { CP437_REVERSE.set(String.fromCharCode(code), 128 + i); });

  var state = {
    athletes: [],
    filtered: [],
    query: '',
    category: 'all',
    gender: 'all',
    sort: 'official',
    fromPdf: false,
    loading: false
  };

  var activeAthlete = null;
  var lastTrigger = null;
  var renderToken = 0;
  var diplomaScriptPromise = null;
  var diplomaDocPromise = null;
  var queryTimer = null;

  var els = {};

  function $(id) { return document.getElementById(id); }

  function cacheElements() {
    els.q = $('q');
    els.clearSearch = $('clearSearch');
    els.category = $('category');
    els.sort = $('sort');
    els.filters = $('filters');
    els.count = $('count');
    els.countLabel = $('countLabel');
    els.filterSummary = $('filterSummary');
    els.clearFilters = $('clearFilters');
    els.resultsList = $('resultsList');
    els.emptyState = $('emptyState');
    els.loadError = $('loadError');
    els.retryLoad = $('retryLoad');
    els.emptyClear = $('emptyClear');
    els.sourceNote = $('sourceNote');
    els.sourceBadge = $('sourceBadge');
    els.modal = $('modal');
    els.modalPanel = document.querySelector('.modal-panel');
    els.closeModal = $('closeModal');
    els.mRank = $('mRank');
    els.mCategory = $('mCategory');
    els.mName = $('mName');
    els.mGender = $('mGender');
    els.mChip = $('mChip');
    els.mCity = $('mCity');
    els.mStatus = $('mStatus');
    els.mTime = $('mTime');
    els.mDiff = $('mDiff');
    els.mSpeed = $('mSpeed');
    els.mPace = $('mPace');
    els.mPosGender = $('mPosGender');
    els.mPosCategory = $('mPosCategory');
    els.mPosGlobal = $('mPosGlobal');
    els.mDiplomaNote = $('mDiplomaNote');
    els.downloadDiploma = $('downloadDiploma');
    els.diplomaCanvas = $('diplomaCanvas');
    els.diplomaLoading = $('diplomaLoading');
    els.diplomaFrame = $('diplomaFrame');
  }

  /* ---------- Utilidades de texto ---------- */

  function normalizeSpace(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function repairMojibake(value) {
    var text = String(value == null ? '' : value);
    if (!/[\u251C\u252C]/.test(text)) return text;

    var bytes = [];
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      var code = text.charCodeAt(i);
      if (code < 128) {
        bytes.push(code);
      } else {
        var mapped = CP437_REVERSE.get(ch);
        if (mapped == null) return text;
        bytes.push(mapped);
      }
    }
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
    } catch (error) {
      return text;
    }
  }

  function cleanText(value) {
    return normalizeSpace(repairMojibake(value));
  }

  function fold(value) {
    return normalizeSpace(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function slugify(value) {
    return fold(value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
  }

  function detectCategoryShort(category) {
    var match = /^(\d+K)\b/i.exec(normalizeSpace(category));
    return match ? match[1].toUpperCase() : '';
  }

  function timeToSeconds(value) {
    var match = /^(\d+):(\d{1,2}):(\d{1,2})$/.exec(normalizeSpace(value));
    if (!match) return null;
    return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  }

  function splitMetric(value) {
    var match = /^([\d.,:]+)\s*(.*)$/.exec(normalizeSpace(value));
    if (!match) return { value: normalizeSpace(value) || '—', unit: '' };
    return { value: match[1], unit: match[2] };
  }

  function positionText(position) {
    if (!position || typeof position.pos !== 'number' || position.pos < 1) return '—';
    return position.pos + ' / ' + position.total;
  }

  /* ---------- Lectura del PDF de resultados ---------- */

  function base64ToBytes(base64) {
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function textItemsFrom(content) {
    var items = [];
    var source = content && content.items ? content.items : [];
    for (var i = 0; i < source.length; i++) {
      var item = source[i];
      if (!item || typeof item.str !== 'string' || !item.str.trim()) continue;
      var transform = item.transform || [1, 0, 0, 1, 0, 0];
      var size = Math.hypot(transform[2] || 0, transform[3] || 0) || item.height || 0;
      items.push({
        text: item.str,
        x: transform[4] || 0,
        y: transform[5] || 0,
        size: size
      });
    }
    return items;
  }

  function columnText(group, minX, maxX, separator) {
    var parts = group.filter(function (item) { return item.x >= minX && item.x < maxX; })
      .sort(function (a, b) { return a.x - b.x; });
    return parts.map(function (item) { return item.text; }).join(separator == null ? ' ' : separator);
  }

  function firstInColumn(group, minX, maxX) {
    var parts = group.filter(function (item) { return item.x >= minX && item.x < maxX; })
      .sort(function (a, b) { return a.x - b.x; });
    return parts.length ? parts[0].text : '';
  }

  function buildRow(group, category, gender, page) {
    var rank = normalizeSpace(firstInColumn(group, -100, 35)).replace(/\.$/, '');
    var chip = normalizeSpace(firstInColumn(group, 35, 60));
    var name = cleanText(columnText(group, 90, 250, ''));
    var city = cleanText(columnText(group, 250, 310));
    var time = normalizeSpace(columnText(group, 360, 408));
    var diff = normalizeSpace(columnText(group, 408, 445));
    var speed = normalizeSpace(columnText(group, 445, 510));
    var pace = normalizeSpace(columnText(group, 510, 610));

    if (!chip || !name) return null;
    if (!time && !/^DSQ$/i.test(rank)) return null;

    return {
      page: page,
      category: category,
      gender: gender,
      rank: rank,
      chip: chip,
      name: name,
      city: city,
      time: time || '--',
      diff: diff || '--',
      speed: speed || '--',
      pace: pace || '--'
    };
  }

  async function parseResultsPdf() {
    var pdfjs = window.pdfjsLib;
    if (!pdfjs) throw new Error('PDF.js no está disponible.');
    if (!window.FINAL_PDF_B64) throw new Error('No está disponible el PDF de resultados.');

    var loadingTask = pdfjs.getDocument({
      data: base64ToBytes(window.FINAL_PDF_B64),
      isEvalSupported: false
    });
    var doc = await loadingTask.promise;
    var rows = [];

    try {
      var category = '';
      var gender = '';

      for (var pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
        var page = await doc.getPage(pageNumber);
        var content = await page.getTextContent();
        var items = textItemsFrom(content);
        items.sort(function (a, b) {
          return (b.y - a.y) || (a.x - b.x);
        });

        var group = [];
        var groupY = null;

        var flush = function () {
          if (!group.length) return;
          var row = buildRow(group, category, gender, pageNumber);
          if (row) rows.push(row);
          group = [];
          groupY = null;
        };

        for (var i = 0; i < items.length; i++) {
          var item = items[i];
          if (item.size >= 11.5) {
            flush();
            var header = cleanText(item.text);
            if (/^(Damas|Hombres)$/i.test(header)) {
              gender = /^Damas$/i.test(header) ? 'Damas' : 'Hombres';
            } else {
              category = header;
              gender = '';
            }
            continue;
          }
          if (item.size < 8.5 || item.size > 9.5) continue;

          if (groupY !== null && Math.abs(item.y - groupY) <= 3) {
            group.push(item);
            groupY = Math.max(groupY, item.y);
          } else {
            flush();
            group.push(item);
            groupY = item.y;
          }
        }
        flush();
        page.cleanup();
      }
    } finally {
      if (doc.destroy) doc.destroy();
    }

    return rows;
  }

  /* ---------- Construcción del modelo ---------- */

  function fallbackAthletes() {
    return FALLBACK.map(function (athlete, index) {
      var short = athlete.categoryShort || detectCategoryShort(athlete.category);
      return {
        id: String(athlete.chip || athlete.id || index),
        chip: String(athlete.chip || athlete.id || ''),
        name: normalizeSpace(athlete.name),
        city: normalizeSpace(athlete.city),
        category: normalizeSpace(athlete.category),
        categoryShort: short,
        categorySlug: (athlete.categorySlug || short.toLowerCase()),
        gender: athlete.gender === 'Hombres' ? 'Hombres' : 'Damas',
        rank: typeof athlete.rank === 'number' ? athlete.rank : null,
        rankLabel: athlete.rankLabel != null ? String(athlete.rankLabel) : (athlete.rank == null ? '—' : String(athlete.rank)),
        time: normalizeSpace(athlete.time) || '--',
        diff: normalizeSpace(athlete.diff) || '--',
        speed: normalizeSpace(athlete.speed) || '--',
        pace: normalizeSpace(athlete.pace) || '--',
        status: athlete.status === 'dsq' || athlete.rank == null ? 'dsq' : 'ok',
        diplomaPage: athlete.diplomaPage || null,
        posGender: athlete.posGender || null,
        posCategory: athlete.posCategory || null,
        posGlobal: athlete.posGlobal || null,
        sortIndex: index
      };
    });
  }

  function hydrateParsedRows(rows) {
    var fallbackByChip = new Map();
    FALLBACK.forEach(function (athlete) {
      fallbackByChip.set(String(athlete.chip), athlete);
    });

    var chips = rows.map(function (row) { return String(row.chip); })
      .sort(function (a, b) { return Number(a) - Number(b); });
    var pageByChip = new Map();
    chips.forEach(function (chip, index) { pageByChip.set(chip, index + 1); });

    return rows.map(function (row, index) {
      var official = fallbackByChip.get(String(row.chip)) || null;
      var short = detectCategoryShort(row.category);
      /* El PDF a veces fusiona el nombre con el municipio cuando la fila es
         muy larga. El acta verificada actúa como fuente canónica para esos
         campos; los tiempos y puestos se usan tal como vienen del PDF. */
      var category = official ? normalizeSpace(official.category) : (cleanText(row.category) || short);
      var gender = row.gender === 'Hombres' ? 'Hombres' : (official && official.gender === 'Hombres' ? 'Hombres' : 'Damas');
      var rank = /^\d+$/.test(row.rank) ? Number(row.rank) : null;
      var name = official ? normalizeSpace(official.name) : row.name;
      var city = official ? normalizeSpace(official.city) : row.city;

      return {
        id: String(row.chip),
        chip: String(row.chip),
        name: name,
        city: city,
        category: category || short,
        categoryShort: short || (official ? official.categoryShort : ''),
        categorySlug: (short || (official ? official.categoryShort : '')).toLowerCase(),
        gender: gender,
        rank: rank,
        rankLabel: /^DSQ$/i.test(row.rank) ? 'DSQ' : (rank == null ? '—' : String(rank)),
        time: normalizeSpace(row.time) || '--',
        diff: normalizeSpace(row.diff) || '--',
        speed: normalizeSpace(row.speed) || '--',
        pace: normalizeSpace(row.pace) || '--',
        status: /^DSQ$/i.test(row.rank) || rank == null ? 'dsq' : 'ok',
        diplomaPage: official && official.diplomaPage ? official.diplomaPage : (pageByChip.get(String(row.chip)) || null),
        posGender: official ? official.posGender || null : null,
        posCategory: official ? official.posCategory || null : null,
        posGlobal: official ? official.posGlobal || null : null,
        sortIndex: index
      };
    });
  }

  function fillDerivedPositions(athletes) {
    var genderTotals = {};
    var categoryTotals = {};
    athletes.forEach(function (athlete) {
      if (!athlete.rank) return;
      var genderKey = athlete.categoryShort + '|' + athlete.gender;
      var categoryKey = athlete.categoryShort;
      genderTotals[genderKey] = (genderTotals[genderKey] || 0) + 1;
      categoryTotals[categoryKey] = (categoryTotals[categoryKey] || 0) + 1;
    });

    athletes.forEach(function (athlete) {
      if (!athlete.rank) return;
      var genderKey = athlete.categoryShort + '|' + athlete.gender;
      if (!athlete.posGender) {
        athlete.posGender = { pos: athlete.rank, total: genderTotals[genderKey] || athlete.rank };
      }
      if (!athlete.posCategory) {
        athlete.posCategory = { pos: athlete.rank, total: categoryTotals[athlete.categoryShort] || athlete.rank };
      }
    });

    if (athletes.some(function (athlete) { return athlete.posGlobal; })) return;

    var timed = athletes.filter(function (athlete) {
      return athlete.rank && timeToSeconds(athlete.time) != null;
    }).sort(function (a, b) {
      return (timeToSeconds(a.time) - timeToSeconds(b.time)) || (a.sortIndex - b.sortIndex);
    });
    timed.forEach(function (athlete, index) {
      athlete.posGlobal = { pos: index + 1, total: timed.length };
    });
  }

  /* ---------- Datos y estados ---------- */

  function setSourceNote(text, badgeText, badgeTitle) {
    els.sourceNote.textContent = text;
    if (badgeText) {
      var label = els.sourceBadge.querySelector('span:last-child');
      if (label) label.textContent = badgeText;
    }
    if (badgeTitle) els.sourceBadge.title = badgeTitle;
  }

  function showLoading() {
    els.resultsList.hidden = false;
    els.resultsList.setAttribute('aria-busy', 'true');
    els.resultsList.innerHTML = new Array(6).fill('<div class="skeleton-row"></div>').join('');
    els.emptyState.hidden = true;
    els.loadError.hidden = true;
    els.count.textContent = '—';
    els.countLabel.textContent = 'deportistas';
    els.filterSummary.hidden = true;
    setSourceNote('Leyendo el PDF oficial de clasificación…', 'PDF oficial', 'Procesando el PDF oficial');
  }

  function showLoadError() {
    els.resultsList.innerHTML = '';
    els.resultsList.hidden = true;
    els.resultsList.setAttribute('aria-busy', 'false');
    els.emptyState.hidden = true;
    els.loadError.hidden = false;
    els.count.textContent = '0';
    els.countLabel.textContent = 'deportistas';
    setSourceNote('No se pudo leer el PDF oficial de clasificación.', 'Sin datos', 'Error al leer el PDF');
  }

  async function loadResults() {
    if (state.loading) return;
    state.loading = true;
    showLoading();

    try {
      var rows = await parseResultsPdf();
      if (rows.length < 350 || rows.length > 500) {
        throw new Error('El PDF no contiene el número esperado de resultados.');
      }
      state.athletes = hydrateParsedRows(rows);
      fillDerivedPositions(state.athletes);
      state.fromPdf = true;
      setSourceNote(
        state.athletes.length + ' resultados extraídos del PDF oficial de clasificación · 10 páginas',
        'PDF oficial',
        'Resultados leídos directamente de FINAL X CATEGORIAS Y GENERO.pdf'
      );
    } catch (error) {
      if (FALLBACK.length) {
        state.athletes = fallbackAthletes();
        fillDerivedPositions(state.athletes);
        state.fromPdf = false;
        setSourceNote(
          state.athletes.length + ' resultados oficiales verificados · datos del PDF de clasificación',
          'Datos oficiales',
          'No se pudo procesar el PDF en este navegador; se muestra la copia oficial verificada.'
        );
        if (window.console && console.warn) console.warn('Lectura del PDF no disponible:', error);
      } else {
        showLoadError();
        state.loading = false;
        return;
      }
    }

    populateCategoryFilter();
    updateStats();
    applyFilters();
    state.loading = false;
  }

  function updateStats() {
    var total = state.athletes.length;
    var categories = new Set();
    var cities = new Set();
    state.athletes.forEach(function (athlete) {
      if (athlete.categoryShort) categories.add(athlete.categoryShort);
      if (athlete.city) cities.add(athlete.city.toLowerCase());
    });

    var values = {
      athletes: total,
      categories: categories.size,
      cities: cities.size,
      diplomas: total
    };
    Object.keys(values).forEach(function (key) {
      var target = document.querySelector('[data-stat="' + key + '"]');
      if (target) target.textContent = String(values[key]);
    });

    var heroFoot = document.querySelector('.hero-card-foot');
    if (heroFoot) {
      heroFoot.textContent = values.categories + ' categorías · ' + total + ' deportistas';
    }
  }

  function sortedCategories() {
    var map = new Map();
    state.athletes.forEach(function (athlete) {
      if (!athlete.categoryShort) return;
      if (!map.has(athlete.categoryShort)) {
        map.set(athlete.categoryShort, athlete.category);
      }
    });
    return Array.from(map.keys()).sort(function (a, b) {
      var orderA = CATEGORY_ORDER[a] == null ? 99 : CATEGORY_ORDER[a];
      var orderB = CATEGORY_ORDER[b] == null ? 99 : CATEGORY_ORDER[b];
      return orderA - orderB;
    }).map(function (short) {
      return { short: short, label: map.get(short) };
    });
  }

  function populateCategoryFilter() {
    var current = state.category;
    els.category.innerHTML = '<option value="all">Todas las categorías</option>';
    sortedCategories().forEach(function (category) {
      var option = document.createElement('option');
      option.value = category.short.toLowerCase();
      option.textContent = category.label || category.short;
      els.category.appendChild(option);
    });
    if (current !== 'all' && Array.from(els.category.options).some(function (option) { return option.value === current; })) {
      els.category.value = current;
    } else {
      state.category = 'all';
      els.category.value = 'all';
    }
  }

  /* ---------- Filtros y orden ---------- */

  function compareOfficial(a, b) {
    var catA = CATEGORY_ORDER[a.categoryShort] == null ? 99 : CATEGORY_ORDER[a.categoryShort];
    var catB = CATEGORY_ORDER[b.categoryShort] == null ? 99 : CATEGORY_ORDER[b.categoryShort];
    if (catA !== catB) return catA - catB;

    var genA = GENDER_ORDER[a.gender] == null ? 99 : GENDER_ORDER[a.gender];
    var genB = GENDER_ORDER[b.gender] == null ? 99 : GENDER_ORDER[b.gender];
    if (genA !== genB) return genA - genB;

    var rankA = a.rank == null ? Number.MAX_SAFE_INTEGER : a.rank;
    var rankB = b.rank == null ? Number.MAX_SAFE_INTEGER : b.rank;
    if (rankA !== rankB) return rankA - rankB;
    return a.sortIndex - b.sortIndex;
  }

  function compareTime(a, b) {
    var timeA = timeToSeconds(a.time);
    var timeB = timeToSeconds(b.time);
    if (timeA == null && timeB == null) return compareOfficial(a, b);
    if (timeA == null) return 1;
    if (timeB == null) return -1;
    return (timeA - timeB) || compareOfficial(a, b);
  }

  function compareName(a, b) {
    return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }) || compareOfficial(a, b);
  }

  function compareCity(a, b) {
    return a.city.localeCompare(b.city, 'es', { sensitivity: 'base' }) || compareName(a, b);
  }

  function matchesQuery(athlete, tokens) {
    if (!tokens.length) return true;
    var haystack = fold([
      athlete.name,
      athlete.chip,
      athlete.city,
      athlete.category,
      athlete.categoryShort,
      'dorsal ' + athlete.chip,
      '#' + athlete.chip
    ].join(' '));
    return tokens.every(function (token) { return haystack.indexOf(token) !== -1; });
  }

  function applyFilters() {
    var tokens = fold(state.query).split(' ').filter(Boolean);

    state.filtered = state.athletes.filter(function (athlete) {
      if (state.category !== 'all' && athlete.categorySlug !== state.category) return false;
      if (state.gender !== 'all' && athlete.gender !== state.gender) return false;
      return matchesQuery(athlete, tokens);
    });

    var comparator = compareOfficial;
    if (state.sort === 'name') comparator = compareName;
    else if (state.sort === 'time') comparator = compareTime;
    else if (state.sort === 'city') comparator = compareCity;
    state.filtered.sort(comparator);

    renderResults();
    updateToolbar(tokens);
  }

  function updateToolbar(tokens) {
    var count = state.filtered.length;
    els.count.textContent = String(count);
    els.countLabel.textContent = count === 1 ? 'deportista' : 'deportistas';

    var parts = [];
    if (state.category !== 'all') {
      var selected = els.category.options[els.category.selectedIndex];
      parts.push(selected ? selected.textContent : state.category.toUpperCase());
    }
    if (state.gender !== 'all') parts.push(state.gender);
    if (state.query.trim()) parts.push('“' + state.query.trim() + '”');

    if (parts.length) {
      els.filterSummary.textContent = parts.join(' · ');
      els.filterSummary.hidden = false;
    } else {
      els.filterSummary.textContent = '';
      els.filterSummary.hidden = true;
    }

    var hasFilters = state.category !== 'all' || state.gender !== 'all' || tokens.length > 0;
    els.clearFilters.hidden = !hasFilters;
    els.clearSearch.hidden = !els.q.value;
  }

  /* ---------- Listado ---------- */

  function createRow(athlete) {
    var row = document.createElement('div');
    row.className = 'result-row';
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.dataset.id = athlete.id;
    row.setAttribute('aria-label',
      athlete.name + ', ' + athlete.categoryShort + ', ' + athlete.gender +
      ', puesto ' + athlete.rankLabel + ', tiempo ' + athlete.time + '. Abrir ficha y diploma.');

    if (athlete.status === 'dsq') {
      row.classList.add('is-dsq');
    } else if (athlete.rank && athlete.rank <= 3) {
      row.classList.add('is-podium', 'is-podium-' + athlete.rank);
    }

    var rankClass = 'rank-badge';
    if (athlete.status === 'dsq') rankClass += ' is-dsq';
    else if (athlete.rank && athlete.rank <= 3) rankClass += ' rank-' + athlete.rank;

    var diffText = athlete.diff && athlete.diff !== '-' && athlete.diff !== '--' ? athlete.diff : '—';
    var diffClass = athlete.status === 'dsq' ? 'time-diff is-lap' : (athlete.diff && athlete.diff.charAt(0) === '+' ? 'time-diff is-positive' : 'time-diff');

    var speed = splitMetric(athlete.speed);
    var pace = splitMetric(athlete.pace);

    row.innerHTML =
      '<div class="col-rank"><span class="' + rankClass + '">' + escapeHtml(athlete.rankLabel) + '</span></div>' +
      '<div class="col-athlete">' +
        '<h3 class="athlete-name">' + escapeHtml(athlete.name) + '</h3>' +
        '<p class="athlete-sub">' +
          '<strong>Dorsal ' + escapeHtml(athlete.chip) + '</strong>' +
          '<span class="dot-sep" aria-hidden="true"></span>' +
          '<span>' + escapeHtml(athlete.city || 'Sin municipio') + '</span>' +
        '</p>' +
      '</div>' +
      '<div class="col-category">' +
        '<span class="category-pill cat-' + escapeHtml(athlete.categorySlug || '1k') + '">' + escapeHtml(athlete.categoryShort || '—') + '</span>' +
        '<span class="gender-label">' + escapeHtml(athlete.gender) + '</span>' +
      '</div>' +
      '<div class="col-time">' +
        '<span class="time-value">' + escapeHtml(athlete.time) + '</span>' +
        '<span class="' + diffClass + '">' + escapeHtml(diffText) + '</span>' +
      '</div>' +
      '<div class="col-metrics">' +
        '<span class="metric-line"><strong>' + escapeHtml(speed.value) + '</strong>' + (speed.unit ? ' ' + escapeHtml(speed.unit) : '') + '</span>' +
        '<span class="metric-line"><strong>' + escapeHtml(pace.value) + '</strong>' + (pace.unit ? ' ' + escapeHtml(pace.unit) : '') + '</span>' +
      '</div>' +
      '<div class="col-action">' +
        '<span class="btn-diploma" aria-hidden="true">' +
          'Diploma' +
          '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M11 4h5v5M16 4l-7 7M8 5H5v10h10v-3"/></svg>' +
        '</span>' +
      '</div>';

    return row;
  }

  function renderResults() {
    var fragment = document.createDocumentFragment();
    state.filtered.forEach(function (athlete) {
      fragment.appendChild(createRow(athlete));
    });

    els.resultsList.innerHTML = '';
    els.resultsList.appendChild(fragment);
    els.resultsList.hidden = state.filtered.length === 0;
    els.resultsList.setAttribute('aria-busy', 'false');
    els.emptyState.hidden = state.filtered.length !== 0;
    els.loadError.hidden = true;
  }

  function resetFilters() {
    state.query = '';
    state.category = 'all';
    state.gender = 'all';
    state.sort = 'official';
    els.q.value = '';
    els.category.value = 'all';
    els.sort.value = 'official';
    setGender('all');
    applyFilters();
    els.q.focus({ preventScroll: true });
  }

  function setGender(gender) {
    state.gender = gender;
    var buttons = els.filters.querySelectorAll('[data-gender]');
    Array.prototype.forEach.call(buttons, function (button) {
      var active = button.dataset.gender === gender;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  /* ---------- Modal ---------- */

  function openAthlete(id, trigger) {
    var athlete = null;
    for (var i = 0; i < state.athletes.length; i++) {
      if (state.athletes[i].id === id) { athlete = state.athletes[i]; break; }
    }
    if (!athlete) return;

    activeAthlete = athlete;
    lastTrigger = trigger || null;
    populateModal(athlete);

    els.modal.hidden = false;
    document.body.classList.add('modal-open');
    els.modalPanel.scrollTop = 0;

    window.requestAnimationFrame(function () {
      els.modalPanel.focus({ preventScroll: true });
    });

    loadDiploma(athlete);
  }

  function populateModal(athlete) {
    els.mRank.textContent = athlete.rankLabel;
    els.mRank.className = 'modal-rank';
    if (athlete.status === 'dsq') {
      els.mRank.classList.add('is-dsq');
    } else if (athlete.rank && athlete.rank <= 3) {
      els.mRank.classList.add('rank-' + athlete.rank);
    }

    els.mCategory.textContent = athlete.category;
    els.mName.textContent = athlete.name;
    els.mGender.textContent = athlete.gender;
    els.mChip.textContent = athlete.chip;
    els.mCity.textContent = athlete.city || '—';

    els.mStatus.textContent = athlete.status === 'dsq' ? 'Descalificado (DSQ)' : 'Finalizado';
    els.mStatus.classList.toggle('is-dsq', athlete.status === 'dsq');

    els.mTime.textContent = athlete.time || '—';
    els.mDiff.textContent = athlete.diff && athlete.diff !== '-' && athlete.diff !== '--' ? athlete.diff : '—';
    els.mSpeed.textContent = athlete.speed || '—';
    els.mPace.textContent = athlete.pace || '—';

    els.mPosGender.textContent = positionText(athlete.posGender);
    els.mPosCategory.textContent = positionText(athlete.posCategory);
    els.mPosGlobal.textContent = positionText(athlete.posGlobal);

    els.mDiplomaNote.classList.toggle('is-warning', athlete.status === 'dsq');
    els.mDiplomaNote.textContent = athlete.status === 'dsq'
      ? 'El acta oficial marca DSQ. El diploma se emitió como constancia de participación, sin posición válida.'
      : 'Posiciones de género, categoría y general tomadas del diploma oficial.';

    els.diplomaCanvas.hidden = true;
    els.diplomaLoading.hidden = false;
    els.downloadDiploma.disabled = true;
    els.downloadDiploma.title = '';
    var oldFallback = els.diplomaFrame.querySelector('.certificate-fallback');
    if (oldFallback) oldFallback.remove();
    els.diplomaLoading.querySelector('p').textContent = 'Preparando el diploma oficial…';
  }

  function closeModal() {
    if (els.modal.hidden) return;
    els.modal.hidden = true;
    document.body.classList.remove('modal-open');
    renderToken++;
    activeAthlete = null;
    if (lastTrigger && document.body.contains(lastTrigger)) {
      lastTrigger.focus({ preventScroll: true });
    }
    lastTrigger = null;
  }

  function trapFocus(event) {
    if (event.key !== 'Tab' || els.modal.hidden) return;
    var focusable = els.modalPanel.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    var visible = Array.prototype.filter.call(focusable, function (element) {
      return element.offsetParent !== null;
    });
    if (!visible.length) return;
    var first = visible[0];
    var last = visible[visible.length - 1];

    if (document.activeElement === els.modalPanel) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /* ---------- Diploma ---------- */

  function loadDiplomaScript() {
    if (window.DIPLOMAS_PDF_B64) return Promise.resolve();
    if (diplomaScriptPromise) return diplomaScriptPromise;

    diplomaScriptPromise = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = 'data/diplomas.b64.js';
      script.async = true;
      script.onload = function () {
        if (window.DIPLOMAS_PDF_B64) resolve();
        else reject(new Error('El archivo de diplomas no contiene datos.'));
      };
      script.onerror = function () {
        diplomaScriptPromise = null;
        reject(new Error('No se pudo cargar DIPLOMAS.pdf.'));
      };
      document.head.appendChild(script);
    });
    return diplomaScriptPromise;
  }

  function getDiplomaDocument() {
    if (diplomaDocPromise) return diplomaDocPromise;

    diplomaDocPromise = loadDiplomaScript().then(function () {
      if (!window.pdfjsLib) throw new Error('PDF.js no está disponible.');
      return window.pdfjsLib.getDocument({
        data: base64ToBytes(window.DIPLOMAS_PDF_B64),
        isEvalSupported: false
      }).promise;
    }).catch(function (error) {
      diplomaDocPromise = null;
      throw error;
    });

    return diplomaDocPromise;
  }

  async function loadDiploma(athlete) {
    var token = ++renderToken;
    if (!athlete.diplomaPage) {
      showDiplomaFallback(athlete, 'El diploma no tiene una página asociada en el archivo oficial.');
      return;
    }

    try {
      var doc = await getDiplomaDocument();
      if (token !== renderToken) return;

      var page = await doc.getPage(athlete.diplomaPage);
      if (token !== renderToken) return;

      var baseViewport = page.getViewport({ scale: 1 });
      var available = Math.max(260, els.diplomaFrame.clientWidth - 24);
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var viewport = page.getViewport({ scale: (available / baseViewport.width) * dpr });
      var canvas = els.diplomaCanvas;
      var context = canvas.getContext('2d', { alpha: false });

      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvasContext: context, viewport: viewport }).promise;
      if (token !== renderToken) return;

      els.diplomaLoading.hidden = true;
      canvas.hidden = false;
      els.downloadDiploma.disabled = false;
      els.downloadDiploma.title = 'Descargar el diploma en imagen PNG';
    } catch (error) {
      if (token !== renderToken) return;
      if (window.console && console.warn) console.warn('No se pudo preparar el diploma:', error);
      showDiplomaFallback(athlete, 'No se pudo preparar la imagen del PDF en este navegador. Intenta abrir la aplicación en Chrome o Edge.');
    }
  }

  function showDiplomaFallback(athlete, message) {
    els.diplomaLoading.hidden = true;
    els.diplomaCanvas.hidden = true;
    els.downloadDiploma.disabled = true;

    var oldFallback = els.diplomaFrame.querySelector('.certificate-fallback');
    if (oldFallback) oldFallback.remove();

    var fallback = document.createElement('div');
    fallback.className = 'certificate-fallback';
    fallback.innerHTML =
      '<img src="assets/logo-tct.png" alt="TCT">' +
      '<p class="certificate-kicker">Diploma oficial de participación</p>' +
      '<h3>' + escapeHtml(athlete.name) + '</h3>' +
      '<p class="certificate-category">' + escapeHtml(athlete.category) + '</p>' +
      '<div class="certificate-data">' +
        '<div><span>Dorsal</span><strong>' + escapeHtml(athlete.chip) + '</strong></div>' +
        '<div><span>Tiempo</span><strong>' + escapeHtml(athlete.time) + '</strong></div>' +
        '<div><span>Categoría</span><strong>' + escapeHtml(athlete.categoryShort) + '</strong></div>' +
      '</div>' +
      '<p>' + escapeHtml(message) + '</p>' +
      '<small>Chiquinquirá · Boyacá · 25 de octubre de 2026</small>';
    els.diplomaFrame.appendChild(fallback);

    if (activeAthlete === athlete) {
      els.mDiplomaNote.classList.add('is-warning');
      els.mDiplomaNote.textContent = 'Vista previa no disponible en este navegador.';
    }
  }

  function downloadDiploma() {
    if (!activeAthlete || els.diplomaCanvas.hidden || els.downloadDiploma.disabled) return;
    var canvas = els.diplomaCanvas;

    canvas.toBlob(function (blob) {
      if (!blob) return;
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      var name = slugify(activeAthlete.name) || 'deportista';
      link.href = url;
      link.download = 'diploma-' + activeAthlete.chip + '-' + name + '.png';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    }, 'image/png');
  }

  /* ---------- Eventos ---------- */

  function bindEvents() {
    els.filters.addEventListener('submit', function (event) { event.preventDefault(); });

    els.q.addEventListener('input', function () {
      state.query = els.q.value;
      els.clearSearch.hidden = !state.query;
      window.clearTimeout(queryTimer);
      queryTimer = window.setTimeout(applyFilters, 90);
    });

    els.clearSearch.addEventListener('click', function () {
      els.q.value = '';
      state.query = '';
      els.clearSearch.hidden = true;
      applyFilters();
      els.q.focus({ preventScroll: true });
    });

    els.category.addEventListener('change', function () {
      state.category = els.category.value;
      applyFilters();
    });

    els.sort.addEventListener('change', function () {
      state.sort = els.sort.value;
      applyFilters();
    });

    els.filters.addEventListener('click', function (event) {
      var button = event.target.closest('[data-gender]');
      if (!button) return;
      setGender(button.dataset.gender);
      applyFilters();
    });

    els.clearFilters.addEventListener('click', resetFilters);
    els.emptyClear.addEventListener('click', resetFilters);

    els.retryLoad.addEventListener('click', function () {
      state.loading = false;
      loadResults();
    });

    els.resultsList.addEventListener('click', function (event) {
      var row = event.target.closest('.result-row');
      if (row) openAthlete(row.dataset.id, row);
    });

    els.resultsList.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      var row = event.target.closest('.result-row');
      if (!row) return;
      event.preventDefault();
      openAthlete(row.dataset.id, row);
    });

    els.closeModal.addEventListener('click', closeModal);
    els.modal.addEventListener('click', function (event) {
      if (event.target.closest('[data-close-modal]')) closeModal();
    });
    els.modalPanel.addEventListener('keydown', trapFocus);

    els.downloadDiploma.addEventListener('click', downloadDiploma);

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !els.modal.hidden) {
        event.preventDefault();
        closeModal();
      }
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-focus-search]'), function (button) {
      button.addEventListener('click', function () {
        var target = document.getElementById('resultados');
        if (target) {
          var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
        }
        window.setTimeout(function () { els.q.focus({ preventScroll: true }); }, 260);
      });
    });
  }

  function init() {
    cacheElements();
    bindEvents();
    setGender('all');
    loadResults();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
