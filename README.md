### Twitch Steam Key Bot
Bot for scaping twitch chats for steam keys and redeem them.

install node modules
```
npm install
```

Enter the names of channels you wish to read the chat of.
```
const client = new tmi.client({
  channels:['#channel']
})
```

Enter the names of user you wish to highlight in chat.
```
const highlightNickNames = ["#nickname"];
```

Enter the names of user you wish to do not display in chat.
```
const doNotDispalyNickNames = ["#nickname"];
```

Run with
```
node bot.js
```
