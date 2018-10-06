'use strict';

const _ = require('lodash');

module.exports.enableTelegramControllers = function (services, config) {
    const controllers = config.controllers;
    const checkUser = config.checkUser(services);
    const checkRole = config.checkRole(services);

    const bot = services.bot;
    const telegramConfig = services.telegramConfig;
    // const lastKeyboardUpdate = new Date(2018, 7, 30, 5, 33);

    const handleResponse = function (msg) {
        return function (responses) {
            if (!responses) {
                return;
            }

            const runResponse = function (chatId, messageId, options, response) {
                switch (response.type) {
                    case 'message':
                        chatId = msg.from.id;
                        options = {};
                        options.parse_mode = response.parse_mode;
                        options.reply_markup = response.reply_markup;

                        bot.sendMessage(chatId, response.text, options);
                        break;

                    case 'photo':
                        chatId = msg.from.id;
                        options = {};

                        bot.sendPhoto(chatId, response.image, response.data);
                        break;

                    case 'deleteMessage':
                        chatId = msg.from.id;
                        messageId = msg.message.message_id;

                        bot.deleteMessage(chatId, messageId);
                        break;

                    case 'invoice':
                        chatId = msg.message ? msg.message.chat.id : msg.chat.id;
                        options = {};

                        const prices = [];
                        var total = 0;
                        _.map(response.prices, function (priceData) {
                            total += priceData.price;
                            prices.push({label: priceData.caption, amount: parseInt(priceData.price) * 100});
                        });

                        if (response.photo_url) {
                            options.photo_url = response.photo_url;
                        }

                        bot.sendInvoice(
                            chatId,
                            response.title,
                            response.description,
                            response.payload,
                            telegramConfig.tokenPay,
                            'start123',
                            'RUB',
                            prices,
                            options
                        );
                        break;

                    case 'editMessageText':
                        chatId = msg.message.chat.id;
                        messageId = msg.message.message_id;

                        bot.editMessageText(response.text, {
                            chat_id: msg.message.chat.id,
                            message_id: msg.message.message_id,
                            parse_mode: response.parse_mode,
                            reply_markup: response.reply_markup,
                        });
                        break;

                    case 'editMessageReplyMarkup':
                        chatId = msg.message.chat.id;
                        messageId = msg.message.message_id;

                        bot.editMessageReplyMarkup(response.reply_markup, {
                            chat_id: msg.message.chat.id,
                            message_id: msg.message.message_id,
                        });
                        break;
                }
            };

            _.map(responses, function (response) {
                var chatId, messageId, options;

                if (response.timeout && response.timeout > 0) {
                    setTimeout(function () {
                        runResponse(chatId, messageId, options, response);
                    }, response.timeout);
                } else {
                    runResponse(chatId, messageId, options, response);
                }
            });
        }
    };

    const serviceQueries = {
        contact: [],
        text: [],
        photo: [],
    };
    const callbackQueries = {};

    _.map(controllers, function (controller) {
        const controllerActions = controller(services);

        _.map(controllerActions, function (action) {
            switch (action.type) {
                case 'command':
                    bot.onText(action.pattern, function (msg) {
                        console.log('debug command', msg);

                        checkUser(msg.from)
                            .then(function (user) {
                                if (action.role && !checkRole(user, action.role)) {
                                    return;
                                }

                                // updateKeyboard(user, msg, lastKeyboardUpdate, handleResponse);

                                return action.handler({user: user, msg: msg});
                            })
                            .then(handleResponse(msg))
                        ;
                    });
                    break;
                case 'callback':
                    callbackQueries[action.pattern] = action;

                    break;

                case 'successful_payment':
                    callbackQueries['successful_payment'] = action;

                    break;

                case 'contact':
                    serviceQueries.contact.push(action);

                    break;

                case 'text':
                    serviceQueries.text.push(action);

                    break;

                case 'photo':
                    serviceQueries.photo.push(action);

                    break;
            }
        });
    });

    bot.on('callback_query', function (msg) {
        console.log('debug callback_query', msg);

        checkUser(msg.from)
            .then(function (user) {
                const queryData = msg.data;
                const parts = queryData.split(':');

                const action = callbackQueries[parts[0]];
                if (!action) {
                    return;
                }

                if (action.role && !checkRole(user, action.role)) {
                    return;
                }

                // updateKeyboard(user, msg, lastKeyboardUpdate, handleResponse);

                return action.handler({user: user, msg: msg, parts: parts});
            })
            .then(handleResponse(msg))
        ;

        bot.answerCallbackQuery(msg.id);
    });

    bot.on('pre_checkout_query', function (msg) {
        console.log('debug pre_checkout_query', msg);

        bot.answerPreCheckoutQuery(msg.id, true);
    });

    bot.on('successful_payment', function (msg) {
        console.log('debug successful_payment', msg);

        checkUser(msg.from)
            .then(function (user) {
                const payment = msg.successful_payment;

                const action = callbackQueries['successful_payment'];
                if (!action) {
                    return;
                }

                if (action.role && !checkRole(user, action.role)) {
                    return;
                }

                return action.handler({user: user, msg: msg, payment: payment});
            })
            .then(handleResponse(msg))
        ;
    });

    bot.on('contact', function (msg) {
        console.log('debug contact', msg);

        checkUser(msg.from)
            .then(function (user) {
                const contact = msg.contact;

                const promises = _.map(serviceQueries.contact, function (action) {
                    if (action.role && !checkRole(user, action.role)) {

                        return new Promise(function (resolve) {
                            resolve()
                        });
                    }

                    return action.handler({user: user, msg: msg, contact: contact});
                });

                return Promise.all(promises);
            })
            .then(function (handlersResults) {
                _.map(handlersResults, function (responses) {
                    return handleResponse(msg)(responses);
                });
            })
        ;
    });

    bot.on('text', function (msg) {
        console.log('debug text', msg);

        checkUser(msg.from)
            .then(function (user) {
                const text = msg.text;

                const promises = _.map(serviceQueries.text, function (action) {
                    if (action.role && !checkRole(user, action.role)) {
                        return new Promise(function (resolve) {
                            resolve()
                        });
                    }

                    return action.handler({user: user, msg: msg, text: text});
                });

                return Promise.all(promises);
            })
            .then(function (handlersResults) {
                _.map(handlersResults, function (responses) {
                    handleResponse(msg)(responses)
                });
            })
        ;
    });

    bot.on('photo', function (msg) {
        console.log('debug photo', msg);

        checkUser(msg.from)
            .then(function (user) {
                const photo = msg.photo;

                const promises = _.map(serviceQueries.photo, function (action) {
                    if (action.role && !checkRole(user, action.role)) {
                        return new Promise(function (resolve) {
                            resolve();
                        });
                    }

                    return action.handler({user: user, msg: msg, photo: photo});
                });

                return Promise.all(promises);
            })
            .then(function (handlersResults) {
                _.map(handlersResults, function (responses) {
                    return handleResponse(msg)(responses);
                });
            })
        ;
    });
};

module.exports.setWebhook = function (urlbase, botToken) {
    const querystring = require('querystring');
    const https = require('https');

    const postData = querystring.stringify({
        'url': urlbase + '/bot' + botToken
    });

    const options = {
        hostname: 'api.telegram.org',
        port: 443,
        path: '/bot' + botToken + '/setWebhook',
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': postData.length
        }
    };

    return new Promise(function (resolve, reject) {
        const req = https.request(options, function (res) {
            res.on('data', function (d) {
                process.stdout.write(d);
            });

            res.on('end', function () {
                resolve();
            });
        });

        req.on('error', function (e) {
            reject(e);
        });

        req.write(postData);
        req.end();
    });
};

const updateKeyboard = function (user, msg, lastKeyboardUpdate, handleResponse) {
    console.log('check time', user.last_activity_at, lastKeyboardUpdate, new Date);
    if (user.last_activity_at.getTime() < lastKeyboardUpdate.getTime()) {
        console.log('update keyboard');

        user.last_activity_at = new Date();
        user.save();

        handleResponse(msg)([{
            type: 'message',
            text: 'Здравствуйте',
            reply_markup: {
                keyboard: [
                    [{
                        text: 'Старт',
                    }, {
                        text: 'Помощь',
                    }],
                    [{
                        text: 'Для продавцов',
                    }],
                ],
                resize_keyboard: true,
            }
        }]);
    }
};
