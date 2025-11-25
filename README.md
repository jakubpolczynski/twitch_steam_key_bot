### Twitch Steam Key Bot

Bot for scaping twitch chats for steam keys and redeem them.

install node modules

```
npm install
```

Create .env file with 3 main keys

```
channels=streamerchannelname
highlightNickNames=username;
doNotDispalyNickNames=username;
```

In .env enter the names of channels you wish to read the chat of.

```
channels=nick1,nick2,nick3
```

In .env enter the names of user you wish to highlight in chat.

```
highlightNickNames=nick1,nick2,nick3;
```

In .env enter the names of user you wish to do not display in chat.

```
doNotDispalyNickNames=nick1,nick2,nick3;
```

Run with

```
node bot.js
```

Go to steam and open code redeem window, click on text input and wait.
