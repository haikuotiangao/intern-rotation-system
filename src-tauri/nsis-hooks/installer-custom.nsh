; NSIS 钩子 - 用于 Tauri 2
; 只做一件事:强制创建桌面快捷方式(默认模板只创建开始菜单快捷方式)

!macro NSIS_HOOK_POSTINSTALL
  SetShellVarContext all
  !define SHORTCUT_PATH "$DESKTOP\${PRODUCTNAME}.lnk"
  !define SHORTCUT_TARGET "$INSTDIR\${MAIN_APP_EXE}"
  !define SHORTCUT_ICON   "$INSTDIR\${MAIN_APP_EXE},0"
  Delete "${SHORTCUT_PATH}"
  CreateShortcut "${SHORTCUT_PATH}" "${SHORTCUT_TARGET}" "" "${SHORTCUT_ICON}" 0 SW_SHOWNORMAL ""
  !undef SHORTCUT_PATH
  !undef SHORTCUT_TARGET
  !undef SHORTCUT_ICON
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  SetShellVarContext all
  Delete "$DESKTOP\${PRODUCTNAME}.lnk"
!macroend
