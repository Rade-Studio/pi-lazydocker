# Demo recording for the README. Requires https://github.com/charmbracelet/vhs,
# lazydocker, a running Docker engine with a few containers, and Pi with this
# package installed (`pi -e .` from the repository root also works).
#
#   vhs assets/demo.tape

Output assets/demo.gif

Set Shell "bash"
Set FontSize 15
Set Width 1400
Set Height 820
Set Padding 16
Set Theme "Catppuccin Mocha"

Hide
Type "pi -e ." Enter
Sleep 4s
Show

Sleep 1s
Alt+l
Sleep 4s
Down
Sleep 1s
Down
Sleep 2s
Ctrl+f
Sleep 4s
Type "q"
Sleep 2s
Type "/lazydocker --help" Enter
Sleep 3s
