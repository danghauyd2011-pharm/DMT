#!/usr/bin/env python3
"""
Build script cho GitHub Actions.
- Tìm tất cả file Excel (.xlsx/.xls) ở ROOT của repo
- Hỗ trợ 2 format: file gốc 26 cột và file bổ sung 22 cột
- Xuất ra docs/data_*.json + docs/manifest.json
"""

import os, json, glob, hashlib, shutil
from datetime import datetime
import pandas as pd

CHUNK_SIZE = 400
OUT = "docs"
os.makedirs(OUT, exist_ok=True)

def parse_date(val):
    if val is None: return ''
    s = str(val).strip()
    if not s or s.lower() in ('nan','none','nat',''): return ''
    if hasattr(val, 'strftime'): return val.strftime('%Y-%m-%d')
    if len(s) >= 10 and s[4] == '-': return s[:10]
    for fmt in ('%d/%m/%Y','%Y-%m-%d','%m/%d/%Y','%d-%m-%Y'):
        try:
            return datetime.strptime(s[:10], fmt).strftime('%Y-%m-%d')
        except: pass
    return ''

def clean(v):
    if v is None: return ''
    s = str(v).strip().replace('\n',' ').replace('\r','')
    return '' if s.lower() in ('nan','none') else s

def guess_noi_ban_hanh(qdtt):
    """Đoán nguồn ban hành từ mã QĐTT"""
    if not qdtt: return ''
    q = qdtt.upper()
    if 'BVĐN' in q or 'BVDN' in q or 'QĐ-BV' in q or 'TB-BV' in q or 'TTMS' in q:
        return 'BVĐN'
    if 'SYT' in q or 'QĐ-SYT' in q:
        return 'SYT'
    return 'BVĐN'  # default

def detect_format(header_row):
    """Phát hiện format: 'new' (22 cột, TenThuoc col 3) hoặc 'old' (26 cột, TenThuoc col 4)"""
    if not header_row: return 'old'
    h = [str(v or '').lower() for v in header_row]
    if len(h) > 3 and 'tên thuốc' in h[3]: return 'new'
    non_empty = sum(1 for v in h if v.strip())
    if non_empty <= 22: return 'new'
    return 'old'

def parse_row_old(row, idx, fname):
    """Parse dòng theo format cũ (file gốc 26 cột)"""
    try:
        stt_f = float(row[0])
        if stt_f != stt_f: return None  # NaN check
        stt_i = int(stt_f)
    except: return None
    return {
        'id':           f"{fname}_{idx}",
        'STT':          str(stt_i),
        'TT20':         clean(row[1]),
        'GoiNhom':      clean(row[2]),
        'TenThuoc':     clean(row[4]),      # col 4
        'TenHoatChat':  clean(row[5]),
        'NongDo':       clean(row[6]),
        'DuongDung':    clean(row[7]),
        'DangBaoChe':   clean(row[8]),
        'QuyCach':      clean(row[9]),
        'HanDung':      clean(row[10]),
        'SDK':          clean(row[11]),
        'HangSanXuat':  clean(row[12]),
        'NuocSanXuat':  clean(row[13]),
        'DonViTinh':    clean(row[14]),
        'DonGia':       clean(row[15]),
        'SLPhanBo':     clean(row[16]),
        'SLPhanBoBHYT': clean(row[17]),
        'SLTuyChon':    clean(row[18]),
        'DieuTiet':     clean(row[19]),
        'LuuY':         clean(row[20]),
        'NhaThau':      clean(row[21]),
        'QDTT':         clean(row[22]),
        'NgayBatDau':   parse_date(row[23]),
        'NgayHetHieu':  parse_date(row[24]),
        'NoiBanHanh':   clean(row[25]),
    }

def parse_row_new(row, idx, fname):
    """Parse dòng theo format mới (file bổ sung 22 cột)"""
    try:
        stt_f = float(row[0])
        if stt_f != stt_f: return None  # NaN check
        stt_i = int(stt_f)
    except: return None
    qdtt = clean(row[17])
    return {
        'id':           f"{fname}_{idx}",
        'STT':          str(stt_i),
        'TT20':         clean(row[1]),
        'GoiNhom':      clean(row[2]),
        'TenThuoc':     clean(row[3]),      # col 3 (khác format cũ)
        'TenHoatChat':  clean(row[4]),
        'NongDo':       clean(row[5]),
        'DuongDung':    clean(row[6]),
        'DangBaoChe':   clean(row[7]),
        'QuyCach':      clean(row[8]),
        'HanDung':      clean(row[9]),
        'SDK':          clean(row[10]),
        'HangSanXuat':  clean(row[11]),
        'NuocSanXuat':  clean(row[12]),
        'DonViTinh':    clean(row[13]),
        'DonGia':       clean(row[14]),
        'SLPhanBo':     clean(row[15]),
        'SLPhanBoBHYT': '',
        'SLTuyChon':    clean(row[16]),
        'DieuTiet':     '',
        'LuuY':         clean(row[18]),
        'NhaThau':      clean(row[21]) if len(row) > 21 else '',
        'QDTT':         qdtt,
        'NgayBatDau':   '',
        'NgayHetHieu':  '',
        'NoiBanHanh':   guess_noi_ban_hanh(qdtt),
    }

def parse_excel(path):
    fname = os.path.basename(path).replace('.xlsx','').replace('.xls','')
    print(f"  📂 {fname}")
    xl = pd.ExcelFile(path, engine='openpyxl')
    all_rows = []

    for sheet_name in xl.sheet_names:
        df = pd.read_excel(path, sheet_name=sheet_name, header=None, engine='openpyxl')
        if df.shape[1] < 5: continue  # Sheet quá ít cột → bỏ qua

        # Tìm header row và start row
        header_row = None
        start_idx = None
        for i, row in df.iterrows():
            vals = [str(v or '').lower().strip() for v in row]
            joined = '|'.join(vals)
            if 'tên thuốc' in joined or 'ten thuoc' in joined or vals[0] == 'stt':
                header_row = list(row)
                start_idx = i + 1
                break
            # Nếu không có header, tìm dòng đầu tiên có STT=1
        if start_idx is None:
            for i, row in df.iterrows():
                try:
                    if float(row.iloc[0]) >= 1: start_idx = i; break
                except: pass
        if start_idx is None: continue

        fmt = detect_format(header_row)
        print(f"     Sheet '{sheet_name}': format={fmt}, start_row={start_idx}")

        count = 0
        for idx in range(start_idx, len(df)):
            row = list(df.iloc[idx])
            # Padding nếu row ít cột hơn
            while len(row) < 26: row.append(None)
            parsed = parse_row_new(row, idx, fname) if fmt == 'new' else parse_row_old(row, idx, fname)
            if parsed and parsed['TenThuoc']:
                all_rows.append(parsed)
                count += 1

        print(f"     → {count} dòng")

    return all_rows

def main():
    print("=" * 55)
    print("BUILD — Danh Muc Thuoc BVDN")
    print(datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
    print("=" * 55)

    # Tìm Excel ở root (không tính trong docs/)
    excels = [f for f in sorted(glob.glob('*.xlsx') + glob.glob('*.xls'))
              if 'docs' not in f and not f.startswith('.')]

    if not excels:
        print("❌ Không tìm thấy file Excel nào ở root repo!")
        print("   Upload file .xlsx vào root của repo rồi commit lại.")
        exit(1)

    print(f"\n📁 Tìm thấy {len(excels)} file Excel:")
    for f in excels:
        print(f"   • {f} ({os.path.getsize(f)//1024}KB)")

    # Đọc tất cả
    print("\n📖 Đang đọc...")
    all_rows = []
    for f in excels:
        try: all_rows.extend(parse_excel(f))
        except Exception as e: print(f"  ⚠️ Lỗi {f}: {e}")

    print(f"\n  Tổng: {len(all_rows)} dòng trước loại trùng")

    # Loại trùng - key = QDTT|STT, file tên sau (sort alphabetically) ghi đè trước
    seen = {}
    for r in all_rows:
        key = f"{r['QDTT']}|{r['STT']}|{r['TenThuoc'][:10]}"
        seen[key] = r
    data = list(seen.values())
    print(f"  Sau loại trùng: {len(data)} mục")

    # Xoá chunk cũ
    for old in glob.glob(f'{OUT}/data_*.json'): os.remove(old)

    # Xuất chunks
    print(f"\n💾 Xuất chunks vào {OUT}/")
    chunks = [data[i:i+CHUNK_SIZE] for i in range(0, len(data), CHUNK_SIZE)]
    total_size = 0
    for i, chunk in enumerate(chunks):
        content = json.dumps(chunk, ensure_ascii=False, separators=(',',':'))
        with open(f'{OUT}/data_{i}.json', 'w', encoding='utf-8') as f:
            f.write(content)
        total_size += len(content.encode())
        print(f"  data_{i}.json: {len(chunk)} dòng, {len(content)//1024}KB")

    # manifest.json
    chk = hashlib.md5(json.dumps(data, ensure_ascii=False).encode()).hexdigest()[:8]
    manifest = {
        'chunks':   len(chunks),
        'total':    len(data),
        'builtAt':  datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
        'checksum': chk,
    }
    with open(f'{OUT}/manifest.json', 'w') as f:
        json.dump(manifest, f, indent=2)
    print(f"\n  manifest.json: {len(chunks)} chunks, checksum={chk}")

    # Copy static files vào docs/
    for fname in ['index.html', 'app.js', 'style.css']:
        if os.path.exists(fname):
            shutil.copy2(fname, f'{OUT}/{fname}')
            print(f"  Copied {fname} → {OUT}/")

    print(f"\n{'='*55}")
    print(f"✅ BUILD XONG!")
    print(f"   Tổng mục thuốc : {len(data):,}")
    print(f"   Số chunks JSON : {len(chunks)}")
    print(f"   Tổng dung lượng: {total_size//1024}KB")
    print(f"{'='*55}")

if __name__ == '__main__':
    main()
