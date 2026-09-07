from pathlib import Path

src=Path('tools/apply_stage5_safety.py').read_text(encoding='utf-8')

old_wallet='''# wallet clear safety: local snapshot + forced full file download before irreversible delete
needle=''' + "'''" + '''    const previous=clone(walletState);\n    walletBusy=true;\n''' + "'''" + '''
replacement=''' + "'''" + '''    createDataBackup("Перед очисткой истории кошельков",true,false);\n    downloadFullBackup("MA_Grafik_before_wallet_clear");\n    const previous=clone(walletState);\n    walletBusy=true;\n''' + "'''" + '''
app=replace_once(app,needle,replacement,'wallet clear backup')
'''
new_wallet='''# wallet clear safety: patch only the destructive clear function
clear_start,clear_end=function_bounds(app,'clearWalletHistoryAndBalances')
clear_fn=app[clear_start:clear_end]
needle=''' + "'''" + '''    const previous=clone(walletState);\n    walletBusy=true;\n''' + "'''" + '''
replacement=''' + "'''" + '''    createDataBackup("Перед очисткой истории кошельков",true,false);\n    downloadFullBackup("MA_Grafik_before_wallet_clear");\n    const previous=clone(walletState);\n    walletBusy=true;\n''' + "'''" + '''
clear_fn=replace_once(clear_fn,needle,replacement,'wallet clear backup')
app=app[:clear_start]+clear_fn+app[clear_end:]
'''

old_pop='''# populate backup status
app=replace_once(app,'    renderErrorLog();\\n    updateSettingsSystemStatus();','    renderErrorLog();\\n    renderBackupStatus();\\n    updateSettingsSystemStatus();','populate backup status')
'''
new_pop='''# populate backup status only inside populateSettings
pop_start,pop_end=function_bounds(app,'populateSettings')
pop_fn=app[pop_start:pop_end]
pop_fn=replace_once(pop_fn,'    renderErrorLog();\\n    updateSettingsSystemStatus();','    renderErrorLog();\\n    renderBackupStatus();\\n    updateSettingsSystemStatus();','populate backup status')
app=app[:pop_start]+pop_fn+app[pop_end:]
'''

for old,new,label in [(old_wallet,new_wallet,'wallet'),(old_pop,new_pop,'populate')]:
    if old not in src:
        raise SystemExit(f'stage5 v3 {label} patch target not found')
    src=src.replace(old,new,1)

exec(compile(src,'tools/apply_stage5_safety.py','exec'))
