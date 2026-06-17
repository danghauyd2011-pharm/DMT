#!/usr/bin/env python3
import os,json,glob,hashlib,shutil,sys
from datetime import datetime
import pandas as pd

CHUNK_SIZE=400
OUT="docs"
os.makedirs(OUT,exist_ok=True)

def parse_date(val):
    if val is None: return ''
    s=str(val).strip()
    if not s or s.lower() in('nan','none','nat',''): return ''
    if hasattr(val,'strftime'): return val.strftime('%Y-%m-%d')
    if len(s)>=10 and s[4]=='-': return s[:10]
    for fmt in('%d/%m/%Y','%Y-%m-%d','%m/%d/%Y','%d-%m-%Y'):
        try: return datetime.strptime(s[:10],fmt).strftime('%Y-%m-%d')
        except: pass
    return ''

def clean(v):
    if v is None: return ''
    s=str(v).strip().replace('\n',' ').replace('\r','')
    return '' if s.lower() in('nan','none') else s

def guess_nbh(q):
    if not q: return ''
    u=q.upper()
    if any(k in u for k in('BVĐN','BVDN','QĐ-BV','TB-BV')): return 'BVĐN'
    if 'TTMS' in u: return 'TTMS'
    if 'SYT' in u: return 'SYT'
    if 'BYT' in u: return 'BYT'
    return 'BVĐN'

def detect_fmt(hr):
    if not hr: return 'old'
    h=[str(v or '').lower().strip() for v in hr]
    if len(h)>3 and 'tên thuốc' in h[3]: return 'new'
    return 'new' if sum(1 for v in h if v)<=22 else 'old'

def safe_int(v):
    try:
        f=float(v)
        return None if f!=f else int(f)
    except: return None

def tt20_sort_key(v):
    """Sắp xếp theo TT20 tăng dần: số hợp lệ trước (theo giá trị số),
    chuỗi không phải số sau, trống/blank xếp cuối cùng."""
    s=str(v or '').strip()
    if not s: return (2,0,'')
    m=''
    for ch in s:
        if ch.isdigit(): m+=ch
        else: break
    if m: return (0,int(m),s)
    return (1,0,s)

def parse_row(row,fmt,idx,fname):
    # Cột STT (cột A) không còn bắt buộc — không dùng để loại dòng nữa.
    # STT hiển thị sẽ được tự đánh số lại (1..hết) sau khi sắp xếp theo TT20.
    def g(i): return clean(row[i]) if i<len(row) else ''
    def d(i): return parse_date(row[i]) if i<len(row) else ''
    if fmt=='new':
        qdtt=g(17)
        ten_thuoc=g(3)
        if not ten_thuoc: return None
        return{'id':f"{fname}_{idx}",'STT':'','TT20':g(1),'GoiNhom':g(2),
            'TenThuoc':ten_thuoc,'TenHoatChat':g(4),'NongDo':g(5),'DuongDung':g(6),'DangBaoChe':g(7),
            'QuyCach':g(8),'HanDung':g(9),'SDK':g(10),'HangSanXuat':g(11),'NuocSanXuat':g(12),
            'DonViTinh':g(13),'DonGia':g(14),'SLPhanBo':g(15),'SLPhanBoBHYT':'','SLTuyChon':g(16),
            'DieuTiet':'','LuuY':g(18),'NhaThau':g(21) if len(row)>21 else '',
            'QDTT':qdtt,
            'NgayBatDau':d(23),'NgayHetHieu':d(24),
            'NoiBanHanh':g(25) if len(row)>25 and g(25) else guess_nbh(qdtt),
            'MaPhanLoai':g(22) if len(row)>22 else ''}
    else:
        ten_thuoc=g(4)
        if not ten_thuoc: return None
        return{'id':f"{fname}_{idx}",'STT':'','TT20':g(1),'GoiNhom':g(2),
            'TenThuoc':ten_thuoc,'TenHoatChat':g(5),'NongDo':g(6),'DuongDung':g(7),'DangBaoChe':g(8),
            'QuyCach':g(9),'HanDung':g(10),'SDK':g(11),'HangSanXuat':g(12),'NuocSanXuat':g(13),
            'DonViTinh':g(14),'DonGia':g(15),'SLPhanBo':g(16),'SLPhanBoBHYT':g(17),'SLTuyChon':g(18),
            'DieuTiet':g(19),'LuuY':g(20),'NhaThau':g(21),'QDTT':g(22),
            'NgayBatDau':d(23),'NgayHetHieu':d(24),
            'NoiBanHanh':g(25) if len(row)>25 else '',
            'MaPhanLoai':g(26) if len(row)>26 else ''}

def parse_excel(path):
    fname=os.path.splitext(os.path.basename(path))[0]
    print(f" 📂 {os.path.basename(path)}")
    xl=pd.ExcelFile(path,engine='openpyxl')
    all_rows=[]
    for sn in xl.sheet_names:
        try: df=pd.read_excel(path,sheet_name=sn,header=None,engine='openpyxl')
        except Exception as e: print(f" ⚠️ Sheet '{sn}': {e}"); continue
        if df.shape[1]<4 or df.shape[0]<3: continue
        header_row=None; start_idx=None
        for i in range(min(len(df),12)):
            vals=[str(v or '').lower().strip() for v in df.iloc[i]]
            if 'tên thuốc' in'|'.join(vals) or vals[0]=='stt':
                header_row=list(df.iloc[i]); start_idx=i+1; break
        if start_idx is None:
            for i in range(min(len(df),15)):
                if safe_int(df.iloc[i,0]) is not None: start_idx=i; break
        if start_idx is None: continue
        fmt=detect_fmt(header_row); count=0
        for idx in range(start_idx,len(df)):
            row=list(df.iloc[idx])
            while len(row)<27: row.append(None)
            parsed=parse_row(row,fmt,idx,fname)
            if parsed and parsed['TenThuoc']: all_rows.append(parsed); count+=1
        if count>0: print(f"  Sheet '{sn}': fmt={fmt}, {count} dòng")
    return all_rows

def check_existing():
    existing=glob.glob(os.path.join(OUT,'data_*.json'))
    mp=os.path.join(OUT,'manifest.json')
    if existing and os.path.exists(mp):
        with open(mp) as f: m=json.load(f)
        return m.get('total',0)
    return 0

def write_chunks(data):
    for old in glob.glob(os.path.join(OUT,'data_*.json')): os.remove(old)
    chunks=[data[i:i+CHUNK_SIZE] for i in range(0,len(data),CHUNK_SIZE)]
    for i,chunk in enumerate(chunks):
        content=json.dumps(chunk,ensure_ascii=False,separators=(',',':'))
        with open(os.path.join(OUT,f'data_{i}.json'),'w',encoding='utf-8') as f: f.write(content)
        print(f"  data_{i}.json: {len(chunk)} dòng, {len(content)//1024}KB")
    chk=hashlib.md5(json.dumps(data,ensure_ascii=False).encode()).hexdigest()[:8]
    manifest={'chunks':len(chunks),'total':len(data),'builtAt':datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),'checksum':chk}
    with open(os.path.join(OUT,'manifest.json'),'w') as f: json.dump(manifest,f,indent=2)
    print(f"  manifest: {len(chunks)} chunks, checksum={chk}")
    return manifest

def copy_static():
    for fname in['index.html','app.js','style.css']:
        if os.path.exists(fname): shutil.copy2(fname,os.path.join(OUT,fname))

def main():
    print("="*50)
    print(f"BUILD — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("="*50)
    excels=sorted([f for f in glob.glob('*.xlsx')+glob.glob('*.xls') if not f.startswith('~') and 'docs' not in f])
    if not excels:
        existing=check_existing()
        if existing>0:
            print(f"\n⚠️ Không có Excel mới — giữ nguyên {existing} mục đã có")
            copy_static()
            print("✅ Copy static files xong — không cần rebuild JSON")
            return
        else:
            print("❌ Không có Excel VÀ không có data trong docs/")
            sys.exit(1)
    print(f"\n📁 {len(excels)} file Excel: {excels}")
    all_rows=[]
    for f in excels:
        try: all_rows.extend(parse_excel(f))
        except Exception as e: print(f" ⚠️ Lỗi {f}: {e}")
    if not all_rows: print("❌ Không đọc được dữ liệu!"); sys.exit(1)
    # Khoá định danh dòng: không dùng STT (cột này không còn bắt buộc / không ổn định).
    # Chỉ coi 2 dòng là "trùng" khi chúng đến từ 2 FILE KHÁC NHAU (tức là file mới
    # đang cập nhật lại đúng dòng đó của file cũ) — khi đó GHI ĐÈ bằng dòng mới nhất.
    # Nếu 2 dòng giống nhau nhưng nằm NGAY TRONG CÙNG 1 FILE thì đó là 2 dòng thực sự
    # khác nhau (ví dụ cùng thuốc nhưng được liệt kê 2 dòng riêng trong cùng quyết định)
    # → giữ lại CẢ HAI, không gộp.
    seen={}
    data=[]
    for r in all_rows:
        key=f"{r['QDTT']}|{r['TenThuoc'][:25]}|{r['NongDo']}|{r['QuyCach']}|{r['SDK']}|{r['SLPhanBo']}"
        fname=r['id'].rsplit('_',1)[0]
        if key in seen:
            prev_fname,prev_pos=seen[key]
            if prev_fname==fname:
                data.append(r); seen[key]=(fname,len(data)-1)
            else:
                data[prev_pos]=r; seen[key]=(fname,prev_pos)
        else:
            data.append(r); seen[key]=(fname,len(data)-1)
    # Sắp xếp theo TT20 tăng dần, rồi tự đánh số lại cột STT từ 1 → hết
    # (cột STT trong file Excel không còn quan trọng / không bắt buộc phải có)
    data.sort(key=lambda r: tt20_sort_key(r['TT20']))
    for i,r in enumerate(data,start=1): r['STT']=str(i)
    print(f"\n  Tổng sau loại trùng: {len(data)} mục")
    write_chunks(data)
    copy_static()
    print(f"\n✅ BUILD XONG! {len(data):,} mục")

if __name__=='__main__': main()
