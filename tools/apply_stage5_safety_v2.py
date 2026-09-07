from pathlib import Path

src=Path('tools/apply_stage5_safety.py').read_text(encoding='utf-8')
old='''# wallet clear safety: local snapshot + forced full file download before irreversible delete
needle=''' + "'''" + '''    const previous=clone(walletState);\n    walletBusy=true;\n''' + "'''" + '''
replacement=''' + "'''" + '''    createDataBackup("Перед очисткой истории кошельков",true,false);\n    downloadFullBackup("MA_Grafik_before_wallet_clear");\n    const previous=clone(walletState);\n    walletBusy=true;\n''' + "'''" + '''
app=replace_once(app,needle,replacement,'wallet clear backup')
'''
new='''# wallet clear safety: patch only the destructive clear function
clear_start,clear_end=function_bounds(app,'clearWalletHistoryAndBalances')
clear_fn=app[clear_start:clear_end]
needle=''' + "'''" + '''    const previous=clone(walletState);\n    walletBusy=true;\n''' + "'''" + '''
replacement=''' + "'''" + '''    createDataBackup("Перед очисткой истории кошельков",true,false);\n    downloadFullBackup("MA_Grafik_before_wallet_clear");\n    const previous=clone(walletState);\n    walletBusy=true;\n''' + "'''" + '''
clear_fn=replace_once(clear_fn,needle,replacement,'wallet clear backup')
app=app[:clear_start]+clear_fn+app[clear_end:]
'''
if old not in src:
    raise SystemExit('stage5 v2 patch target not found')
src=src.replace(old,new,1)
exec(compile(src,'tools/apply_stage5_safety.py','exec'))
