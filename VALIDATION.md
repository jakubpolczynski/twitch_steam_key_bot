# Walidacja refaktoru Twitch Steam Key Bot

Data: 31 października 2026 r.

Źródło: [jakubpolczynski/twitch_steam_key_bot](https://github.com/jakubpolczynski/twitch_steam_key_bot).
Commit bazowy: `606ea46b70de873847bacd04192b34ec4f3d2d3f`.
Zmiany przygotowano lokalnie na gałęzi `refactor/safe-key-preview`.
Publikację gałęzi oraz utworzenie pull requesta zlecono osobno po zakończeniu
walidacji. Gałąź główna repozytorium nazywa się `main`.

## Wyniki

Środowisko: Linux, Node.js 24.22.1, npm 11.9.0.

| Sprawdzenie | Wynik |
| --- | --- |
| npm ci --ignore-scripts --no-audit --no-fund | PASS, instalacja z lockfile |
| node --check dla bot.js, src i test | PASS |
| npm test / npm run test:coverage | 50/50 testów PASS, 0 pominiętych |
| Pokrycie linii modułów src | 100% dla każdego z czterech modułów |
| Pokrycie linii wszystkich plików produkcyjnych | 95,35% |
| Pokrycie gałęzi wszystkich plików produkcyjnych | 96,12% |
| npm audit --omit=dev | 0 zgłoszonych podatności w chwili sprawdzenia |
| node bot.js --demo | PASS, tryb preview, wykluczony autor niewidoczny |
| Nieobsługiwany argument i brak kanałów | Oczekiwany kod wyjścia 1 przed połączeniem |
| Prawdziwy parser .env i pierwszeństwo środowiska | PASS, osobne procesy Node.js w katalogu tymczasowym |
| Prawdziwy konstruktor tmi.js i jego obsługa zdarzeń | PASS, connect/disconnect zastąpione lokalnie; bez sieci |

## Zakres testów

- Odrzucenie własnych wiadomości i wykluczonych autorów przed logowaniem
  oraz kopiowaniem; porównanie loginu i nazwy wyświetlanej bez rozróżniania
  wielkości liter.
- Podgląd bez wywołania wstrzykniętego schowka; brak ładowania i wywołań
  mocków bibliotek klawiatury również podczas sukcesu i błędu kopiowania.
- Zachowanie dawnych formatów kandydatów, odrzucanie częściowych dopasowań
  oraz znaków specjalnych dopuszczanych wcześniej przez zakres A-z.
- Adapter schowka z mockiem procesu dla Windows, macOS i Linux:
  dane przez stdin, shell=false, brak programu, EPIPE, niezerowy kod wyjścia,
  zakończenie sygnałem, timeout i błędy synchroniczne.
- Obsługa równoległych wiadomości w kolejności, duplikatów w trakcie
  kopiowania i po sukcesie, ponowienie po błędzie, limit kolejki i pamięci.
- Anulowanie oczekujących kopii przez programowe stop().
- Rejestracja listenerów przed connect(), utrzymanie ich po pierwszym
  nieudanym połączeniu, obsługa odrzuceń asynchronicznego handlera.
- Wczytanie konfiguracji bez dotenv, stara nazwa doNotDispalyNickNames,
  łączenie list i walidacja trybu przed połączeniem.

## Granice walidacji

Nie łączono się z rzeczywistym czatem Twitch i nie aktywowano żadnych kluczy.
Nie wykonano operacji na rzeczywistym schowku Windows, macOS ani Linux;
adaptery sprawdzono z mockami procesów. Nie symulowano pełnego protokołu
sieciowego ponowień tmi.js.

100% pokrycia linii dotyczy src; nie oznacza pełnej weryfikacji CLI, systemów
operacyjnych ani wszystkich zachowań Twitch. Wynik npm audit odnosi się do
listy zgłoszeń dostępnej w chwili uruchomienia.

## Zastosowanie patcha w istniejącym repozytorium

Paczka ZIP zawiera pełny kod, testy i konfigurację przykładową. Patch zawiera
te same zmiany względem wskazanego commita bazowego.

W katalogu własnego repozytorium, w PowerShell:

```powershell
git status --short
git switch -c refactor/safe-key-preview
git apply --check ..\twitch_steam_key_bot_refactor.patch
git apply ..\twitch_steam_key_bot_refactor.patch
npm ci --ignore-scripts
npm test
npm run demo
git diff --check
```

Dostosuj ścieżkę patcha do miejsca pobrania. Jeśli git apply --check zgłosi
konflikt, zatrzymaj aplikowanie i porównaj własne zmiany z patchem.
Polecenia nie wykonują commita ani pusha. Istniejący plik .env pozostaje
poza patchem. Instrukcję konfiguracji czatu zawiera README.md.
