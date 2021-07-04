# UnitsCalc

A dimensional calculator.

The is intended to be a self-documenting
[Progressive Web App](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps)
so for more information just [run it](https://sjswitzer.github.io/UnitsCalc/).

It started as a quick and dirty tool to do simple but tedious calculations with feet and inches
but one thing led to another and it eventually grew into a full-blown dimensional calculator.

A number of interesting subproblems came up along the way and these led to the opportunity to do a deep dive
on relatively recent developments in JavaScript and Web App technology:

* Modern JavaScript syntax and class definitions
* BigInt for implementing rational arithmetic
* Service Workers for use offline and saving to mobile phone homescreens
* Lots of arcana about developing web apps for the phone. There's a lot of out-of-date information out there!
* [Async functions for implementing service workers](https://github.com/sjswitzer/UnitsCalc/blob/main/service-worker.js). If you're interested in implementing Service Workers you should definitely take a look.
* [Custom HTML elements](https://github.com/sjswitzer/UnitsCalc/blob/main/box.html) for implementing various X-style buttons. With transitions and animations because why not? [Try it](https://sjswitzer.github.io/UnitsCalc/box.html)!

Oh, and learning about the history of measurement and units systems has been fascinating.
Did you know that "horsepower" was invented by James Watt to help 
[sell his steam engines](https://en.wikipedia.org/wiki/Horsepower#History)
to people still using horses to run machinery?
Or that [cranberries](https://www.google.com/search?&q=NIST+units+barrel+cranberry&btnI)
are measured differently than other fruits and vegetables?
It just goes on and on.

There's more information in the app's built-in help system. Check it out.

Enjoy!
