# DiscordFix

Написал свой фикс для Discord без скачивания лишних программ и т.п

Нажимаете WIN + R и вставляете команду должна открыться папка
```cmd /c "for /d %i in (%LOCALAPPDATA%\Discord\app-*) do start explorer %i\resources"```

Там будет файл app.asar либо _app.asar , вам нужно переименовать его в app.asar.back

Скачиваете app.asar по ссылке - https://github.com/FlimixST/DiscordFix/releases/download/release/app.asar

Далее запускаете дискорд, в 1 запуск может долго загружаться, и когда появится Checking for updates выйдет окно с подтверждением прав администратора, подтверждаете и вуаля, всё работает

(Подтверждать права администратора надо будет каждый раз при запуске дискорда)

Если вы боитесь что это вирус, можете  посмотреть исходник, он находится в публичном доступе - https://github.com/FlimixST/DiscordFix


Написан на исходниках OpenAsar, который улучшает производительность дискорда (https://openasar.dev/)
