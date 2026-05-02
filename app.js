// ════════════════════════════════════════════
//  STATE
// ════════════════════════════════════════════
let allData = [];
let filtered = [];
let showExpired = false;
let srcFilter = 'all';
let sortCol = null, sortDir = 1;
let page = 1, perPage = 100;
let trackData = {};
let selectedTrackRow = null;
let dataLoaded = false;

const TODAY = new Date().toISOString().slice(0, 10);

// Column definitions
const COLS = [
  { key: 'STT',        label: 'STT',           w: 45,  show: true,  fixed: true },
  { key: 'QDTT',       label: 'QĐTT',          w: 135, show: true },
  { key: 'NoiBanHanh', label: 'Nguồn',         w: 70,  show: true },
  { key: 'TenThuoc',   label: 'Tên thuốc',     w: 210, show: true,  cls: 'td-name' },
  { key: 'TenHoatChat',label: 'Hoạt chất',     w: 160, show: true },
  { key: 'NongDo',     label: 'Nồng độ/HL',    w: 110, show: true },
  { key: 'DangBaoChe', label: 'Dạng BC',       w: 150, show: true },
  { key: 'DuongDung',  label: 'Đường dùng',    w: 90,  show: false },
  { key: 'QuyCach',    label: 'Quy cách',      w: 160, show: false },
  { key: 'DonViTinh',  label: 'ĐVT',           w: 60,  show: true },
  { key: 'DonGia',     label: 'Đơn giá',       w: 95,  show: true,  cls: 'td-num', fmt: 'money' },
  { key: 'SLPhanBo',   label: 'SL phân bổ',   w: 100, show: true,  cls: 'td-num', fmt: 'num' },
  { key: 'SLPhanBoBHYT', label: 'SL BHYT',    w: 90,  show: false, cls: 'td-num', fmt: 'num' },
  { key: 'SLTuyChon',  label: 'SL tuỳ chọn',  w: 95,  show: false, cls: 'td-num', fmt: 'num' },
  { key: 'NgayBatDau', label: 'Ngày BĐ',      w: 90,  show: true,  fmt: 'date' },
  { key: 'NgayHetHieu',label: 'Hết HH',       w: 90,  show: true,  fmt: 'date' },
  { key: '_status',    label: 'Trạng thái',    w: 115, show: true,  nosort: true },
  { key: 'NhaThau',    label: 'Nhà thầu',      w: 200, show: false },
  { key: 'HangSanXuat',label: 'Hãng SX',      w: 180, show: false },
  { key: 'NuocSanXuat',label: 'Nước SX',      w: 80,  show: false },
  { key: 'HanDung',    label: 'Hạn dùng',     w: 80,  show: false },
  { key: 'SDK',        label: 'SĐK',           w: 145, show: false },
  { key: 'GoiNhom',    label: 'Gói nhóm',     w: 80,  show: false },
  { key: 'DieuTiet',   label: 'Điều tiết',    w: 80,  show: false, cls: 'td-num' },
  { key: 'LuuY',       label: 'Lưu ý',        w: 180, show: false },
  { key: '_detail',    label: 'Chi tiết',      w: 70,  show: true,  nosort: true },
];

// ════════════════════════════════════════════
//  INIT — load data chunks
// ════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('today-badge').textContent = '📅 ' + fmtDate(TODAY);
  document.getElementById('ti-month').value = TODAY.slice(0, 7);
  initColToggles();
  tryLoadTrackLS();
  await loadDataChunks();
  tryLoadDataLS();
  applyFilters();
});

async function loadDataChunks() {
  try {
    const manifestRes = await fetch('manifest.json');
    const manifest = await manifestRes.json();
    const total = manifest.chunks;

    for (let i = 0; i < total; i++) {
      const pct = Math.round((i / total) * 100);
      document.getElementById('loading-text').textContent = `Đang tải dữ liệu… ${pct}% (chunk ${i + 1}/${total})`;
      const res = await fetch(`data_${i}.json`);
      const chunk = await res.json();
      allData.push(...chunk);
    }

    document.getElementById('loading-text').textContent = `Đã tải xong ${allData.length} mục thuốc!`;
    document.getElementById('loaded-count').textContent = allData.length.toLocaleString('vi');
    dataLoaded = true;

    // Show table
    setTimeout(() => {
      document.getElementById('loading-screen').style.display = 'none';
      document.getElementById('tbl-wrap').style.display = '';
    }, 300);

  } catch (err) {
    document.getElementById('loading-text').textContent = '❌ Lỗi tải dữ liệu: ' + err.message;
    console.error(err);
  }
}

function tryLoadDataLS() {
  try {
    const s = localStorage.getItem('bvdn_extra');
    if (!s) return;
    const extra = JSON.parse(s);
    if (!extra.length) return;
    // Merge extra rows (uploaded by user) into allData
    let added = 0;
    extra.forEach(nr => {
      const ex = allData.find(r => r.QDTT === nr.QDTT && r.STT === nr.STT);
      if (ex) Object.assign(ex, nr);
      else { allData.push(nr); added++; }
    });
    if (added) logMain(`🔄 Khôi phục ${added} mục bổ sung từ trình duyệt`);
  } catch (e) {}
}

function tryLoadTrackLS() {
  try {
    const t = localStorage.getItem('bvdn_track');
    if (t) trackData = JSON.parse(t);
  } catch (e) {}
}

// ════════════════════════════════════════════
//  STATUS
// ════════════════════════════════════════════
function getStatus(row) {
  if (!row.NgayHetHieu) return 'unknown';
  if (row.NgayHetHieu < TODAY) return 'expired';
  if (!row.NgayBatDau || row.NgayBatDau <= TODAY) return 'active';
  return 'future';
}

function statusBadge(st, endDate) {
  if (st === 'expired') return `<span class="badge badge-exp">⏰ Hết HH</span>`;
  if (st === 'future')  return `<span class="badge badge-fut">⏳ Chưa BĐ</span>`;
  if (st === 'active') {
    const days = Math.ceil((new Date(endDate) - new Date(TODAY)) / 86400000);
    if (days <= 90) return `<span class="badge badge-fut" title="Còn ${days} ngày">⚠️ Còn ${days}n</span>`;
    return `<span class="badge badge-active">✅ Còn HH</span>`;
  }
  return `<span class="badge" style="background:#f5f5f5;color:#999;border-color:#ddd">❓ N/A</span>`;
}

// ════════════════════════════════════════════
//  FILTERS
// ════════════════════════════════════════════
function applyFilters() {
  if (!dataLoaded) return;
  const q1 = (document.getElementById('s-qdtt').value || '').toLowerCase().trim();
  const q2 = (document.getElementById('s-thuoc').value || '').toLowerCase().trim();
  const q3 = (document.getElementById('s-hoat').value || '').toLowerCase().trim();

  filtered = allData.filter(r => {
    const st = getStatus(r);
    if (!showExpired && st === 'expired') return false;
    if (srcFilter === 'SYT' && !(r.NoiBanHanh || '').toUpperCase().includes('SYT')) return false;
    if (srcFilter === 'BVĐN' && !(r.NoiBanHanh || '').toUpperCase().includes('BV')) return false;
    if (q1 && !(r.QDTT || '').toLowerCase().includes(q1)) return false;
    if (q2 && !(r.TenThuoc || '').toLowerCase().includes(q2)) return false;
    if (q3 && !(r.TenHoatChat || '').toLowerCase().includes(q3)) return false;
    return true;
  });

  if (sortCol) {
    filtered.sort((a, b) => {
      let va = a[sortCol] || '', vb = b[sortCol] || '';
      const na = parseFloat(va), nb = parseFloat(vb);
      if (!isNaN(na) && !isNaN(nb)) return (na - nb) * sortDir;
      return va.localeCompare(vb, 'vi') * sortDir;
    });
  }

  page = 1;
  updateStats();
  renderTable();
}

function clearFilters() {
  document.getElementById('s-qdtt').value = '';
  document.getElementById('s-thuoc').value = '';
  document.getElementById('s-hoat').value = '';
  srcFilter = 'all';
  updateChips();
  applyFilters();
}

function setSrc(v) { srcFilter = v; updateChips(); applyFilters(); }

function updateChips() {
  document.getElementById('chip-all').classList.toggle('on', srcFilter === 'all');
  document.getElementById('chip-syt').classList.toggle('on', srcFilter === 'SYT');
  document.getElementById('chip-bvdn').classList.toggle('on', srcFilter === 'BVĐN');
}

function toggleExpired() {
  showExpired = !showExpired;
  const btn = document.getElementById('btn-exp');
  btn.classList.toggle('on', showExpired);
  btn.textContent = showExpired ? '🙈 Ẩn hết HH' : '👁 Hiện hết HH';
  applyFilters();
}

// ════════════════════════════════════════════
//  STATS
// ════════════════════════════════════════════
function updateStats() {
  const total   = allData.length;
  const active  = allData.filter(r => getStatus(r) === 'active').length;
  const exp     = allData.filter(r => getStatus(r) === 'expired').length;
  const syt     = allData.filter(r => (r.NoiBanHanh || '').toUpperCase().includes('SYT')).length;
  const bvdn    = allData.filter(r => (r.NoiBanHanh || '').toUpperCase().includes('BV')).length;
  document.getElementById('s-total').textContent  = total.toLocaleString('vi');
  document.getElementById('s-active').textContent = active.toLocaleString('vi');
  document.getElementById('s-exp').textContent    = exp.toLocaleString('vi');
  document.getElementById('s-syt').textContent    = syt.toLocaleString('vi');
  document.getElementById('s-bvdn').textContent   = bvdn.toLocaleString('vi');
  document.getElementById('total-badge').textContent = '📋 ' + total.toLocaleString('vi') + ' mục';
}

// ════════════════════════════════════════════
//  COLUMN TOGGLES
// ════════════════════════════════════════════
function initColToggles() {
  const list = document.getElementById('col-list');
  COLS.filter(c => !c.fixed).forEach(col => {
    const el = document.createElement('div');
    el.className = 'col-item' + (col.show ? '' : ' hidden');
    el.innerHTML = (col.show ? '✅ ' : '🚫 ') + col.label;
    el.onclick = () => {
      col.show = !col.show;
      el.className = 'col-item' + (col.show ? '' : ' hidden');
      el.innerHTML = (col.show ? '✅ ' : '🚫 ') + col.label;
      renderTable();
    };
    list.appendChild(el);
  });
}

function toggleColPanel() {
  document.getElementById('col-panel').classList.toggle('show');
}

// ════════════════════════════════════════════
//  TABLE RENDER
// ════════════════════════════════════════════
function renderTable() {
  const visibleCols = COLS.filter(c => c.show);
  const head = document.getElementById('tbl-head');

  head.innerHTML = visibleCols.map(col => {
    let cls = sortCol === col.key ? (sortDir > 0 ? ' sort-asc' : ' sort-desc') : '';
    const clickAttr = col.nosort ? '' : `onclick="doSort('${col.key}')"`;
    return `<th style="min-width:${col.w}px" class="${cls}" ${clickAttr}>
      ${col.label}${col.nosort ? '' : '<span class="arr"></span>'}
    </th>`;
  }).join('');

  const start = (page - 1) * perPage;
  const pageRows = filtered.slice(start, start + perPage);
  const q1 = (document.getElementById('s-qdtt').value || '').toLowerCase().trim();
  const q2 = (document.getElementById('s-thuoc').value || '').toLowerCase().trim();
  const q3 = (document.getElementById('s-hoat').value || '').toLowerCase().trim();

  const body = document.getElementById('tbl-body');

  if (!pageRows.length) {
    body.innerHTML = `<tr><td colspan="${visibleCols.length}" class="no-data">
      <div style="font-size:32px;margin-bottom:8px">🔍</div>
      <div>Không có dữ liệu phù hợp</div>
      <div style="font-size:11px;margin-top:4px;color:var(--text3)">Thử thay đổi bộ lọc hoặc bật "Hiện hết HH"</div>
    </td></tr>`;
    renderPag(); return;
  }

  body.innerHTML = pageRows.map(row => {
    const st = getStatus(row);
    const trCls = st === 'expired' ? 'row-exp' : (st === 'future' ? 'row-fut' : '');

    const cells = visibleCols.map(col => {
      if (col.key === '_status') return `<td class="td-c">${statusBadge(st, row.NgayHetHieu)}</td>`;
      if (col.key === '_detail') return `<td class="td-c"><button class="btn btn-ghost btn-sm" onclick="showDetail('${row.id}')">🔍</button></td>`;

      let val = row[col.key] || '';

      if (col.key === 'NoiBanHanh') {
        const nb = (val || '').toUpperCase();
        val = nb.includes('SYT') ? `<span class="badge badge-syt">🏛️ SYT</span>`
            : nb.includes('BV')  ? `<span class="badge badge-bvdn">🏥 BVĐN</span>`
            : `<span style="font-size:11px">${val}</span>`;
      } else if (col.fmt === 'money') { val = fmtMoney(val);
      } else if (col.fmt === 'num')   { val = fmtNum(val);
      } else if (col.fmt === 'date')  { val = fmtDate(val);
      } else {
        const q = col.key === 'QDTT' ? q1 : col.key === 'TenThuoc' ? q2 : col.key === 'TenHoatChat' ? q3 : '';
        if (q && val) val = highlight(String(val), q);
      }

      const cls = col.cls ? ` class="${col.cls}"` : '';
      const rawVal = row[col.key] || '';
      const titleAttr = (typeof rawVal === 'string' && rawVal.length > 20 && !col.cls?.includes('td-num'))
        ? ` title="${rawVal.replace(/"/g, "'")}"` : '';
      return `<td${cls}${titleAttr}>${val}</td>`;
    }).join('');

    return `<tr class="${trCls}">${cells}</tr>`;
  }).join('');

  renderPag();
}

function doSort(key) {
  if (sortCol === key) sortDir = -sortDir;
  else { sortCol = key; sortDir = 1; }
  applyFilters();
}

// ════════════════════════════════════════════
//  PAGINATION
// ════════════════════════════════════════════
function renderPag() {
  const el = document.getElementById('pag');
  el.style.display = '';
  const total = filtered.length;
  const pages = Math.ceil(total / perPage) || 1;
  const s = (page - 1) * perPage + 1;
  const e = Math.min(page * perPage, total);

  let btns = '';
  const lo = Math.max(1, page - 3), hi = Math.min(pages, lo + 6);
  if (lo > 1) btns += `<button class="pb" onclick="goPage(1)">1</button>${lo > 2 ? '<span style="padding:0 4px;color:var(--text3)">…</span>' : ''}`;
  for (let i = lo; i <= hi; i++) btns += `<button class="pb${i === page ? ' on' : ''}" onclick="goPage(${i})">${i}</button>`;
  if (hi < pages) btns += `${hi < pages - 1 ? '<span style="padding:0 4px;color:var(--text3)">…</span>' : ''}<button class="pb" onclick="goPage(${pages})">${pages}</button>`;

  el.innerHTML = `
    <span>${s.toLocaleString('vi')}–${e.toLocaleString('vi')} / <strong>${total.toLocaleString('vi')}</strong> kết quả</span>
    <div class="pag-ctrl">
      <button class="pb" onclick="goPage(${page - 1})" ${page <= 1 ? 'disabled' : ''}>‹</button>
      ${btns}
      <button class="pb" onclick="goPage(${page + 1})" ${page >= pages ? 'disabled' : ''}>›</button>
      <select class="perpage" onchange="changePerPage(this.value)">
        ${[50, 100, 200, 500].map(n => `<option value="${n}"${n === perPage ? ' selected' : ''}>${n}/trang</option>`).join('')}
      </select>
    </div>`;
}

function goPage(p) {
  const pages = Math.ceil(filtered.length / perPage);
  page = Math.max(1, Math.min(pages, p));
  renderTable();
  document.getElementById('tbl-wrap').scrollTop = 0;
}

function changePerPage(v) { perPage = parseInt(v); page = 1; renderTable(); }

// ════════════════════════════════════════════
//  DETAIL MODAL
// ════════════════════════════════════════════
function showDetail(id) {
  const row = allData.find(r => r.id === id);
  if (!row) return;
  const st = getStatus(row);
  document.getElementById('modal-title').innerHTML = `💊 ${row.TenThuoc} &nbsp;${statusBadge(st, row.NgayHetHieu)}`;
  const fields = [
    ['QĐTT', row.QDTT], ['Nguồn ban hành', (row.NoiBanHanh||'').toUpperCase().includes('SYT') ? '🏛️ Sở Y Tế' : '🏥 BV Đà Nẵng'],
    ['Tên thuốc', row.TenThuoc], ['Hoạt chất', row.TenHoatChat],
    ['Nồng độ/HL', row.NongDo], ['Dạng bào chế', row.DangBaoChe],
    ['Đường dùng', row.DuongDung], ['Quy cách đóng gói', row.QuyCach],
    ['Hạn dùng', row.HanDung ? row.HanDung + ' tháng' : ''], ['SĐK', row.SDK],
    ['Hãng sản xuất', row.HangSanXuat], ['Nước sản xuất', row.NuocSanXuat],
    ['Đơn vị tính', row.DonViTinh], ['Đơn giá', row.DonGia ? fmtMoney(row.DonGia) + ' đ' : ''],
    ['SL phân bổ', fmtNum(row.SLPhanBo)], ['SL BHYT', fmtNum(row.SLPhanBoBHYT)],
    ['SL tuỳ chọn', fmtNum(row.SLTuyChon)], ['Điều tiết', row.DieuTiet],
    ['Nhà thầu', row.NhaThau], ['Ngày bắt đầu HH', fmtDate(row.NgayBatDau)],
    ['Ngày hết HH', fmtDate(row.NgayHetHieu)], ['Lưu ý kê đơn', row.LuuY],
    ['Gói nhóm', row.GoiNhom], ['TT20', row.TT20],
  ];
  document.getElementById('modal-body').innerHTML =
    `<div class="detail-grid">${fields.filter(([,v]) => v).map(([l, v]) =>
      `<div class="detail-item"><label>${l}</label><p>${v}</p></div>`).join('')}</div>`;
  document.getElementById('modal-overlay').classList.add('show');
}
function closeModal() { document.getElementById('modal-overlay').classList.remove('show'); }

// ════════════════════════════════════════════
//  TRACKING
// ════════════════════════════════════════════
let trackSearchRows = [];

function showTrackSearch() {
  const q = (document.getElementById('ti-search').value || '').toLowerCase().trim();
  const dd = document.getElementById('ti-dropdown');
  if (!q || q.length < 2) { dd.classList.remove('show'); return; }

  const matches = allData.filter(r =>
    getStatus(r) !== 'expired' &&
    ((r.QDTT || '').toLowerCase().includes(q) || (r.TenThuoc || '').toLowerCase().includes(q))
  ).slice(0, 15);

  if (!matches.length) { dd.classList.remove('show'); return; }
  trackSearchRows = matches;
  dd.classList.add('show');
  dd.innerHTML = matches.map((r, i) => `
    <div class="ti-dd-item" onclick="selectTrackRow(${i})">
      <div class="di-name">${r.TenThuoc}</div>
      <div class="di-sub">${r.QDTT} &nbsp;|&nbsp; ${r.TenHoatChat} &nbsp;|&nbsp; SL: ${fmtNum(r.SLPhanBo)} ${r.DonViTinh}</div>
    </div>`).join('');
}

function selectTrackRow(i) {
  selectedTrackRow = trackSearchRows[i];
  document.getElementById('ti-search').value = `${selectedTrackRow.TenThuoc} — ${selectedTrackRow.QDTT}`;
  document.getElementById('ti-dropdown').classList.remove('show');
  document.getElementById('ti-qty').focus();
}

document.addEventListener('click', e => {
  if (!e.target.closest('#ti-search') && !e.target.closest('#ti-dropdown'))
    document.getElementById('ti-dropdown')?.classList.remove('show');
});

function addEntry() {
  if (!selectedTrackRow) { alert('Vui lòng chọn thuốc từ danh sách gợi ý!'); return; }
  const month = document.getElementById('ti-month').value;
  const qty = parseInt(document.getElementById('ti-qty').value) || 0;
  if (!month || qty <= 0) { alert('Vui lòng nhập tháng và số lượng hợp lệ!'); return; }

  const id = selectedTrackRow.id;
  if (!trackData[id]) trackData[id] = { drug: selectedTrackRow, entries: [] };
  const ex = trackData[id].entries.find(e => e.month === month);
  if (ex) ex.qty += qty;
  else trackData[id].entries.push({ month, qty });
  trackData[id].entries.sort((a, b) => a.month.localeCompare(b.month));

  document.getElementById('ti-qty').value = '';
  document.getElementById('ti-search').value = '';
  selectedTrackRow = null;

  logTrack(`✅ Thêm ${qty.toLocaleString('vi')} ${trackData[id].drug.DonViTinh} — ${trackData[id].drug.TenThuoc} (${month})`);
  saveTrackLS();
  renderTracking();
}

function renderTracking() {
  const rows = Object.values(trackData);
  const body = document.getElementById('track-body');
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="11" class="no-data">
      <div style="font-size:28px">📊</div>
      <div>Chưa có dữ liệu theo dõi phân bổ</div>
    </td></tr>`;
    return;
  }
  body.innerHTML = rows.map((td, i) => {
    const drug = td.drug;
    const allocated = parseFloat(drug.SLPhanBo) || 0;
    const totalIn = td.entries.reduce((s, e) => s + e.qty, 0);
    const remaining = allocated - totalIn;
    const pct = allocated > 0 ? Math.min(100, Math.round(totalIn / allocated * 100)) : 0;
    const remCls = remaining <= 0 ? 'rem-zero' : pct >= 80 ? 'rem-low' : 'rem-ok';
    const progCls = pct >= 100 ? 'danger' : pct >= 80 ? 'warn' : '';

    const detail = td.entries.map(e =>
      `<span style="display:inline-block;margin:2px 3px;padding:1px 6px;background:var(--surface2);border-radius:4px;font-size:11px;border:1px solid var(--border)"><b>${e.month}:</b> ${e.qty.toLocaleString('vi')}</span>`
    ).join('') || '—';

    return `<tr>
      <td class="td-num">${i + 1}</td>
      <td><span class="badge ${(drug.NoiBanHanh||'').includes('SYT') ? 'badge-syt' : 'badge-bvdn'}">${drug.QDTT}</span></td>
      <td class="td-name" title="${drug.TenThuoc}">${drug.TenThuoc}</td>
      <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${drug.TenHoatChat}">${drug.TenHoatChat}</td>
      <td class="td-c">${drug.DonViTinh}</td>
      <td class="td-num">${fmtNum(allocated)}</td>
      <td class="td-num">${totalIn.toLocaleString('vi')}</td>
      <td class="td-c"><span class="${remCls}">${remaining.toLocaleString('vi')}</span></td>
      <td class="td-c" style="white-space:nowrap">
        <span class="prog-bar"><span class="prog-fill ${progCls}" style="width:${pct}%"></span></span>
        <span style="font-size:11px;font-family:var(--mono)">${pct}%</span>
      </td>
      <td style="white-space:normal;min-width:180px">${detail}</td>
      <td class="td-c"><button class="btn btn-ghost btn-sm" onclick="delTrack('${drug.id}')">🗑</button></td>
    </tr>`;
  }).join('');
}

function delTrack(id) {
  if (!confirm('Xoá dữ liệu theo dõi thuốc này?')) return;
  delete trackData[id];
  saveTrackLS();
  renderTracking();
}

function clearTrack() {
  if (!confirm('Xoá TOÀN BỘ dữ liệu nhập kho?')) return;
  trackData = {};
  saveTrackLS();
  renderTracking();
  logTrack('🗑 Đã xoá toàn bộ dữ liệu theo dõi');
}

function saveTrackLS() {
  try { localStorage.setItem('bvdn_track', JSON.stringify(trackData)); } catch (e) {}
}

function logTrack(msg) {
  const el = document.getElementById('track-log');
  el.classList.add('show');
  el.innerHTML = `<p>${new Date().toLocaleTimeString('vi')} — ${msg}</p>` + el.innerHTML;
}

// ════════════════════════════════════════════
//  LOAD TRACK FILES
// ════════════════════════════════════════════
function loadTrackFile(event) {
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
      let added = 0;
      rows.slice(1).forEach(row => {
        const qdtt  = String(row[0] || '').trim();
        const ten   = String(row[1] || '').trim().toLowerCase();
        const qty   = parseInt(row[2]) || 0;
        const month = String(row[3] || '').trim();
        if (!qty || !month) return;
        const drug = allData.find(r =>
          r.QDTT === qdtt || (r.TenThuoc || '').toLowerCase() === ten
        );
        if (!drug) return;
        if (!trackData[drug.id]) trackData[drug.id] = { drug, entries: [] };
        const ex = trackData[drug.id].entries.find(e => e.month === month);
        if (ex) ex.qty += qty; else trackData[drug.id].entries.push({ month, qty });
        trackData[drug.id].entries.sort((a, b) => a.month.localeCompare(b.month));
        added++;
      });
      logTrack(`📑 Nạp file nhập kho: ${added} bản ghi từ ${file.name}`);
      saveTrackLS(); renderTracking();
    } catch (err) { logTrack(`❌ Lỗi: ${err.message}`); }
  };
  reader.readAsArrayBuffer(file);
  event.target.value = '';
}

function loadSavedTrack(event) {
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
      const header = rows[0] || [];
      const months = header.slice(5); // col 5+ are month columns
      let loaded = 0;
      rows.slice(1).forEach(row => {
        const qdtt = String(row[0] || '').trim();
        const drug = allData.find(r => r.QDTT === qdtt);
        if (!drug) return;
        if (!trackData[drug.id]) trackData[drug.id] = { drug, entries: [] };
        months.forEach((m, i) => {
          if (!m) return;
          const qty = parseInt(row[5 + i]) || 0;
          if (qty <= 0) return;
          const ex = trackData[drug.id].entries.find(e => e.month === String(m));
          if (ex) ex.qty = qty; else trackData[drug.id].entries.push({ month: String(m), qty });
        });
        trackData[drug.id].entries.sort((a, b) => a.month.localeCompare(b.month));
        loaded++;
      });
      logTrack(`💾 Nạp file đã lưu: ${loaded} thuốc từ ${file.name}`);
      saveTrackLS(); renderTracking();
    } catch (err) { logTrack(`❌ Lỗi: ${err.message}`); }
  };
  reader.readAsArrayBuffer(file);
  event.target.value = '';
}

function exportTrackExcel() {
  const rows = Object.values(trackData);
  if (!rows.length) { alert('Chưa có dữ liệu để xuất!'); return; }
  const allMonths = [...new Set(rows.flatMap(td => td.entries.map(e => e.month)))].sort();
  const header = ['QĐTT', 'Tên thuốc', 'Hoạt chất', 'ĐVT', 'SL phân bổ', ...allMonths, 'Tổng nhập', 'Còn lại', '% Nhập'];
  const data = [header, ...rows.map(td => {
    const alloc = parseFloat(td.drug.SLPhanBo) || 0;
    const mqs = allMonths.map(m => (td.entries.find(e => e.month === m) || {}).qty || 0);
    const tot = mqs.reduce((a, b) => a + b, 0);
    const rem = alloc - tot;
    return [td.drug.QDTT, td.drug.TenThuoc, td.drug.TenHoatChat, td.drug.DonViTinh, alloc, ...mqs, tot, rem, alloc > 0 ? Math.round(tot / alloc * 100) + '%' : '0%'];
  })];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Theo dõi phân bổ');
  XLSX.writeFile(wb, `PhanBo_${TODAY}.xlsx`);
}

// ════════════════════════════════════════════
//  MAIN FILE UPLOAD (add more data)
// ════════════════════════════════════════════
function loadMainFile(event) {
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
      const sheetName = wb.SheetNames.find(n => n.toLowerCase().includes('tân dược')) || wb.SheetNames[0];
      const rawData = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: false });
      const newRows = [];
      rawData.slice(6).forEach((row, idx) => {
        if (!row[0] || isNaN(parseFloat(row[0]))) return;
        newRows.push({
          id: 'u_' + Date.now() + '_' + idx,
          STT: String(parseInt(parseFloat(row[0]))),
          TT20: String(row[1] || ''), GoiNhom: String(row[2] || ''),
          TenThuoc: String(row[4] || ''), TenHoatChat: String(row[5] || ''),
          NongDo: String(row[6] || ''), DuongDung: String(row[7] || ''),
          DangBaoChe: String(row[8] || ''), QuyCach: String(row[9] || ''),
          HanDung: String(row[10] || ''), SDK: String(row[11] || '').replace(/\n/g, ' '),
          HangSanXuat: String(row[12] || ''), NuocSanXuat: String(row[13] || ''),
          DonViTinh: String(row[14] || ''), DonGia: String(row[15] || ''),
          SLPhanBo: String(row[16] || ''), SLPhanBoBHYT: String(row[17] || ''),
          SLTuyChon: String(row[18] || ''), DieuTiet: String(row[19] || ''),
          LuuY: String(row[20] || ''), NhaThau: String(row[21] || ''),
          QDTT: String(row[22] || ''),
          NgayBatDau: parseDateCell(row[23]),
          NgayHetHieu: parseDateCell(row[24]),
          NoiBanHanh: String(row[25] || ''),
        });
      });
      let added = 0, updated = 0;
      newRows.forEach(nr => {
        const ex = allData.find(r => r.QDTT === nr.QDTT && r.STT === nr.STT);
        if (ex) { Object.assign(ex, { ...nr, id: ex.id }); updated++; }
        else { allData.push(nr); added++; }
      });
      // Save extra rows to localStorage
      const extra = allData.filter(r => r.id.startsWith('u_'));
      try { localStorage.setItem('bvdn_extra', JSON.stringify(extra)); } catch (e) {}
      logMain(`📂 ${file.name} — Thêm mới: ${added}, Cập nhật: ${updated}`);
      applyFilters();
    } catch (err) { logMain(`❌ Lỗi: ${err.message}`); }
  };
  reader.readAsArrayBuffer(file);
  event.target.value = '';
}

function parseDateCell(v) {
  if (!v) return '';
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  try { const d = new Date(v); if (!isNaN(d)) return d.toISOString().slice(0, 10); } catch (e) {}
  return '';
}

// ════════════════════════════════════════════
//  EXPORT VISIBLE
// ════════════════════════════════════════════
function exportVisibleExcel() {
  const visibleCols = COLS.filter(c => c.show && !['_status', '_detail'].includes(c.key));
  const header = visibleCols.map(c => c.label);
  const data = [header, ...filtered.map(row => visibleCols.map(col => row[col.key] || ''))];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Danh mục');
  XLSX.writeFile(wb, `DanhMuc_${TODAY}.xlsx`);
}

// ════════════════════════════════════════════
//  LOCAL STORAGE
// ════════════════════════════════════════════
function saveLS() {
  try {
    const extra = allData.filter(r => r.id.startsWith('u_'));
    localStorage.setItem('bvdn_extra', JSON.stringify(extra));
    localStorage.setItem('bvdn_track', JSON.stringify(trackData));
    alert(`✅ Đã lưu ${extra.length} mục bổ sung + dữ liệu phân bổ vào trình duyệt!`);
  } catch (e) { alert('Lỗi lưu: ' + e.message); }
}

function loadLS() {
  tryLoadDataLS();
  tryLoadTrackLS();
  applyFilters();
  renderTracking();
  alert('✅ Đã khôi phục dữ liệu!');
}

function exportJSON() {
  const payload = { data: allData.filter(r => r.id.startsWith('u_')), track: trackData };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Backup_${TODAY}.json`;
  a.click();
}

function importJSON(event) {
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const p = JSON.parse(e.target.result);
      if (p.data) {
        p.data.forEach(nr => {
          const ex = allData.find(r => r.QDTT === nr.QDTT && r.STT === nr.STT);
          if (ex) Object.assign(ex, { ...nr, id: ex.id });
          else allData.push(nr);
        });
      }
      if (p.track) trackData = { ...trackData, ...p.track };
      saveTrackLS();
      applyFilters(); renderTracking();
      logMain(`📥 Nạp JSON: ${(p.data || []).length} mục bổ sung`);
    } catch (err) { alert('Lỗi: ' + err.message); }
  };
  reader.readAsText(file);
  event.target.value = '';
}

function logMain(msg) {
  const el = document.getElementById('main-log');
  el.classList.add('show');
  el.innerHTML = `<p>${new Date().toLocaleTimeString('vi')} — ${msg}</p>` + el.innerHTML;
  document.getElementById('loaded-count').textContent = allData.length.toLocaleString('vi');
}

// ════════════════════════════════════════════
//  TABS
// ════════════════════════════════════════════
function switchTab(name) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('panel-' + name).classList.add('active');
  document.getElementById('tab-' + name).classList.add('active');
  if (name === 'tracking') renderTracking();
}

// ════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════
function fmtDate(s) {
  if (!s || s.length < 10) return s || '';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}
function fmtMoney(v) {
  const n = parseFloat(String(v).replace(/[^0-9.]/g, ''));
  return isNaN(n) ? (v || '') : n.toLocaleString('vi-VN');
}
function fmtNum(v) {
  const n = parseFloat(String(v).replace(/[^0-9.]/g, ''));
  return (isNaN(n) || n === 0) ? '—' : n.toLocaleString('vi-VN');
}
function highlight(text, q) {
  if (!q || !text) return text;
  return text.replace(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<mark>$1</mark>');
}
