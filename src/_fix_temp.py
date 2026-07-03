import re

p = r'src/pages/RotationOverview.tsx'
with open(p, 'r', encoding='utf-8') as f:
    txt = f.read()

# 1) 科室列加 text-center
old_dept_pat = r'({/\* 科室 \*/}\s+<div className="min-w-0">\s+<div className={.*?}>{rotation\.department_name}</div>\s+</div>)'
m = re.search(old_dept_pat, txt, flags=re.DOTALL)
if m:
    old_block = m.group(1)
    new_block = '''{/* 科室 — text-center 对齐表头 */}
                  <div className="min-w-0 text-center">
                    <div className={`text-[14px] font-extrabold truncate tracking-tight ${color.text}`}>{rotation.department_name}</div>
                  </div>'''
    txt = txt.replace(old_block, new_block, 1)
    print('dept: replaced')
else:
    print('dept: NOT FOUND')

# 2) 实习生列拉近 — 把 justify-between gap-2 改为 gap-1.5 (普通平铺)、并去掉 min-w-0 冗余
old_name_pat = r'(px-3 py-3 border-r border-slate-200/50 flex items-center justify-between gap-2 min-w-0)'
m2 = re.search(old_name_pat, txt)
if m2:
    txt = txt.replace(m2.group(1), 'px-3 py-3 border-r border-slate-200/50 flex items-center gap-1.5 min-w-0', 1)
    # also reduce gap-1 to gap-0.5 for the right side
    txt = txt.replace('flex flex-col items-center gap-1 flex-shrink-0', 'flex flex-col items-center gap-0.5 flex-shrink-0 ml-1', 1)
    print('name: replaced')
else:
    print('name: NOT FOUND')

# 3) 顶条合并一行 — 把区间和 metric 合并
old_top_pat = r'(<span className="text-\[12px\] font-medium text-slate-500 whitespace-nowrap ml-auto">\s+区间.*?</span>\s+</div>\s+<!-- 把起始科室.*?-->\s+<div className="flex items-center gap-4 text-\[13px\] font-bold text-slate-700 flex-wrap ml-auto">)'
m3 = re.search(old_top_pat, txt, flags=re.DOTALL)
if m3:
    old_block2 = m3.group(1)
    new_block2 = '<span className="text-[12px] font-medium text-slate-500 whitespace-nowrap">\n              区间 {viewMonthKeys[0]} ~ {viewMonthKeys[viewMonthKeys.length - 1]}\n            </span>\n            <span className="text-slate-400 text-[13px] mx-1">|</span>'
    txt = txt.replace(old_block2, new_block2, 1)
    print('top: replaced')
else:
    print('top: NOT FOUND')
    # dump region
    idx = txt.find('区间 {viewMonthKeys')
    if idx >= 0:
        print('region around interval:', repr(txt[idx-30:idx+200]))

with open(p, 'w', encoding='utf-8') as f:
    f.write(txt)
print('done')