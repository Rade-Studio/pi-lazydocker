# Security policy

## Supported versions

Only the latest published version receives fixes.

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Report them privately through [GitHub Security Advisories](https://github.com/Rade-Studio/pi-lazydocker/security/advisories/new). You should get a response within a week.

## Scope

pi-lazydocker runs inside the Pi process with your user's permissions. It starts the `lazydocker` binary it finds on your `PATH` (or `PI_LAZYDOCKER_COMMAND`) in Pi's working directory, and passes along only the arguments you type after `/lazydocker`. It makes no network requests and stores no data.
