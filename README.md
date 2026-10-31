# Twitch Steam Key Bot

Bot Node.js do odczytu czatu Twitch i wykrywania kandydatów na klucze.
Domyślnie tylko pokazuje znaleziony kod. Nie steruje klawiaturą i nie aktywuje
kluczy w Steam. Wklejenie i zatwierdzenie wykonuje użytkownik.

## Wymagania i instalacja

Node.js 22 lub nowszy; walidacja tej zmiany: Node.js 24.22.1.
Po rozpakowaniu paczki przejdź do katalogu z `package.json`:

```powershell
npm ci --ignore-scripts
npm test
npm run demo
```

Testy i demo działają również bez instalowania zależności: korzystają z modułów
wbudowanych w Node.js. Demo nie łączy się z Twitch, nie odczytuje pliku `.env`
i nie zmienia schowka.

Przykładowy wynik demo:

```text
Mode: preview. Keyboard automation is disabled.
viewer : Example: ABCDE-12345-FGHIJ
[PREVIEW] Key detected: ABCDE-12345-FGHIJ
```

To sztuczny przykład formatu, a nie klucz przeznaczony do aktywacji.
Druga wiadomość demo pochodzi od wykluczonego autora i nie jest wyświetlana.

## Konfiguracja i podgląd czatu

W PowerShell utwórz konfigurację, zachowując istniejący plik:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
notepad .env
```

Ustaw rzeczywiste nazwy kanałów bez adresów URL:

```dotenv
BOT_MODE=preview
channels=kanal1,kanal2
highlightNickNames=wyrozniony1,wyrozniony2
IGNORE_USERS=ignorowany1,ignorowany2
doNotDispalyNickNames=
```

`doNotDispalyNickNames` zachowuje zgodność ze starą konfiguracją mimo literówki.
Obie listy ignorowanych autorów są łączone. Listy przyjmują przecinki i średniki,
usuwają puste wpisy oraz normalizują wielkość liter i opcjonalny prefiks `#`.
Brak list autorów jest dozwolony; brak prawidłowych kanałów przerywa start.

Bot korzysta z wbudowanego `process.loadEnvFile()`. Zmienne ustawione wcześniej
w środowisku procesu mają pierwszeństwo przed plikiem `.env`.
Jeżeli wartość w `.env` zaczyna się od `#`, obejmij ją cudzysłowem, np.
`channels="#kanal1,kanal2"`; poza cudzysłowem `#` rozpoczyna komentarz.

Uruchomienie podglądu:

```powershell
npm run preview
```

Ten skrypt wymusza `preview` również wtedy, gdy konfiguracja zawiera
`BOT_MODE=clipboard`. Po utracie połączenia ponowienia obsługuje `tmi.js`.
Zatrzymanie: Ctrl+C, z domyślną obsługą sygnału przez Node.js; zakończenie
procesu usuwa również oczekujące timery ponowień biblioteki.

## Tryby działania

| Ustawienie | Zachowanie |
| --- | --- |
| Brak BOT_MODE lub preview | Wyświetlanie czatu i rozpoznanych kandydatów; bez dostępu do schowka |
| clipboard | Kopiowanie pierwszego kandydata z wiadomości; bez wklejania i naciskania Enter |
| Inna wartość, np. paste | Błąd konfiguracji przed połączeniem |

Aby świadomie włączyć kopiowanie, ustaw `BOT_MODE=clipboard` i uruchom:

```powershell
npm start
```

Windows używa `clip.exe`, macOS `pbcopy`, a Linux `xclip -selection clipboard`.
Linux wymaga zainstalowanego `xclip` i działającego schowka X11.
W środowisku bez schowka korzystaj z podglądu.

Tryb kopiowania nadpisuje bieżący schowek. Różne kody mogą kolejno zastąpić jego
zawartość; w schowku pozostaje ostatni pomyślnie skopiowany kod. Wszystkie
zaakceptowane wiadomości nadal są widoczne w konsoli.

## Zabezpieczenia i zachowana funkcjonalność

- Wiadomości własne oraz autorzy ignorowani według loginu lub nazwy wyświetlanej
  są odrzucani przed logowaniem, wyszukiwaniem kodu i kopiowaniem.
- Zachowane są odczyt wielu kanałów, wyświetlanie czatu, wyróżnianie autorów
  oraz dawne formaty kandydatów: trzy grupy po 4–5 znaków lub pięć po 4–6.
  Dozwolone są litery ASCII i cyfry. Dopasowanie nie obejmuje fragmentów dłuższych
  ciągów. Wybierany jest pierwszy kompletny kandydat w wiadomości.
- Rozpoznanie formatu nie potwierdza, że kod jest ważnym kluczem Steam.
- Automatyczne wklejanie, Enter i fallback `robot` zostały usunięte.
  Nie ma zależności od bibliotek klawiatury ani skryptu pobierającego Node.js.
- Błąd procesu schowka, błąd stdin, niezerowy kod wyjścia i timeout 3 s
  kończą kopiowanie bez działania zastępczego. Kolejne wiadomości mogą być
  przetwarzane; nieudany kod można ponowić w następnej wiadomości.
- Kopiowanie jest kolejkowane; limit to 50 oczekujących lub wykonywanych kodów.
  Nadmiar jest pomijany z ostrzeżeniem i może zostać ponowiony.
- Ostatnie 1000 pomyślnie obsłużonych kandydatów jest zapamiętywane w RAM,
  niezależnie od autora i kanału. Duplikaty są ignorowane także podczas
  wykonywania operacji. Restart czyści pamięć; najstarsze wpisy są usuwane
  po przekroczeniu limitu.
- Programowe `stop()` anuluje oczekujące kopie i czeka na rozpoczęte kopiowanie
  do timeoutu adaptera. Ctrl+C kończy proces bez czekania; uruchomione wcześniej
  narzędzie systemowego schowka może zdążyć zakończyć swoją operację.
- Znaki sterujące z czatu są usuwane przed wyświetleniem w terminalu.
  Kandydaci są widoczni w konsoli — przekierowanie wyjścia zapisze je w logu.
- Import `bot.js` nie uruchamia połączenia. Listener jest rejestrowany przed
  połączeniem, a odrzucenia asynchronicznego handlera są obsługiwane.
- `package-lock.json` jest wersjonowany; `.env` pozostaje ignorowany przez Git.

## Jak sprawdzić zmianę

```powershell
npm ci --ignore-scripts
npm test
npm run test:coverage
npm run demo
npm audit --omit=dev
git diff --check
```

Testy nie otwierają prawdziwego połączenia ani schowka. Mocki procesu schowka
obejmują Windows, macOS i Linux, ENOENT, EPIPE, timeout i błędy wyjścia.
Mocki bibliotek klawiatury pilnują, że nie są nawet ładowane ani wywoływane
w podglądzie, przy udanym kopiowaniu ani po błędzie schowka.

Pozostałe testy obejmują konfigurację, filtrowanie, formaty kandydatów,
duplikaty, kolejność równoległych wiadomości, limity, zatrzymanie i zachowanie
listenerów po nieudanym pierwszym połączeniu. Szczegóły walidacji zawiera
`VALIDATION.md`.

Opcjonalny test ręczny z własnym kanałem: uruchom `npm run preview`,
a następnie z drugiego konta wpisz przykładowy kod do czatu. Sprawdź wpis
`[PREVIEW]` i niezmieniony schowek. Dodaj ten login do `IGNORE_USERS`,
uruchom bota ponownie i sprawdź, że jego wiadomość nie jest wyświetlana.
Nie trzeba uruchamiać Steam.

## Pliki

| Plik | Odpowiedzialność |
| --- | --- |
| bot.js | Uruchomienie, podgląd offline, połączenie Twitch i zatrzymanie |
| src/config.js | Walidacja i normalizacja konfiguracji |
| src/keys.js | Rozpoznawanie kandydatów |
| src/message-handler.js | Filtrowanie, logowanie, kolejka i duplikaty |
| src/clipboard.js | Adapter procesów schowka, bez powłoki i klawiatury |
| test/*.test.js | Testy jednostkowe z mockami |
