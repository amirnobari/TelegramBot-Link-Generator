const fs = require('fs')
const TelegramBot = require('node-telegram-bot-api')

require('dotenv').config()

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true })

const linksFile = 'links.json' // فایل JSON برای ذخیره لینک‌های دعوت
function readLinksFile() {
    try {
        if (!fs.existsSync(linksFile)) {
            fs.writeFileSync(linksFile, '{}')
        }
        const data = fs.readFileSync(linksFile, 'utf8')
        return JSON.parse(data)
    } catch (err) {
        console.error(err)
        return {}
    }
}

function saveLinksFile(data) {
    fs.writeFileSync(linksFile, JSON.stringify(data, null, 4), 'utf8')
}
//شناسه کانال پابلیک
function checkPublicChannelMembership(userId) {
    return bot.getChatMember(-1001956864682, userId)
}

//منطق ساخت لینک
function createOrUpdatePrivateGroupInviteLink(userId) {
    const links = readLinksFile()

    if (links.users && links.users[userId] && links.users[userId].privateGroupInviteLink) {
        const userLinkData = links.users[userId]
        const currentTime = Math.floor(Date.now() / 1000)

        if (userLinkData.expireDate > currentTime) {
            // اگر زمان اعتبار لینک قبلی هنوز به اتمام نرسیده باشد
            return Promise.resolve(userLinkData.privateGroupInviteLink)
        }
    }

    return new Promise((resolve, reject) => {
        // اگر لینک قبلی موجود نبود یا منقضی شده بود، لینک جدید ایجاد می‌شود
        const expireDate = Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 ساعت
        const memberLimit = 1 // محدودیت برای یک شناسه کاربری

        bot.createChatInviteLink(-1002077897244, {
            expire_date: expireDate,
            member_limit: memberLimit
        }).then((inviteLink) => {
            links.users = links.users || {}
            links.users[userId] = links.users[userId] || {}
            links.users[userId].privateGroupInviteLink = inviteLink.invite_link
            links.users[userId].expireDate = expireDate
            saveLinksFile(links)
            resolve(inviteLink.invite_link)
        }).catch((err) => {
            reject(err)
        })
    })
}
// حدف کاربر از لوکال استوریج
function removeUserData(userId) {
    const links = readLinksFile()

    if (links.users && links.users[userId]) {
        delete links.users[userId]
        saveLinksFile(links)
        console.log(`User data for ${userId} removed.`)
    } else {
        console.log(`User data for ${userId} does not exist or is invalid.`)
    }
}

// افزودن تابع برای چک کردن شناسه کاربر در فایل links.json
function checkUserExistence(userId) {
    const links = readLinksFile()
    return links.users && links.users[userId]
}

//مکانیزم محدود سازی درخواستها
let requestCounter = 0
const REQUEST_LIMIT = 5
const INTERVAL_TIME = 5000 // مثلاً 5 ثانیه

function sendTelegramRequest(userId) {
    if (requestCounter < REQUEST_LIMIT) {
        requestCounter++
        return createOrUpdatePrivateGroupInviteLink(userId)
    } else {
        return new Promise((resolve) => {
            setTimeout(() => {
                requestCounter = 0
                resolve(createOrUpdatePrivateGroupInviteLink(userId))
            }, INTERVAL_TIME)
        })
    }
}

let startCounter = {}

//کارهای دکمه start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id
    const userId = msg.from.id

    if (!startCounter[userId]) {
        startCounter[userId] = 1
    } else {
        startCounter[userId]++
    }

    if (startCounter[userId] > 10) {
        const oneDayInSeconds = 86400
        const blockDuration = oneDayInSeconds

        const unblockDate = Math.floor(Date.now() / 1000) + blockDuration

        bot.sendMessage(chatId, `کاربر عزیز، شما بیش از 10 بار دستور /start را زدید. حساب شما به مدت 1 روز مسدود خواهد شد. برای آزادی، بعد از ${new Date(unblockDate * 1000).toLocaleString()} مجددا تلاش کنید.`)

        setTimeout(() => {
            startCounter[userId] = 0
        }, blockDuration * 1000)
    } else {
        checkPublicChannelMembership(userId)
            .then((publicChatMember) => {
                const userExists = checkUserExistence(userId)
                if (publicChatMember && (publicChatMember.status === 'member' || publicChatMember.status === 'creator' || publicChatMember.status === 'administrator')) {
                    if (userExists) {
                        const userLinkData = readLinksFile().users[userId]
                        const currentTime = Math.floor(Date.now() / 1000)
                        if (userLinkData.expireDate < currentTime) {
                            removeUserData(userId) // حذف اطلاعات کاربر اگر زمان گذشته باشد
                            createOrUpdatePrivateGroupInviteLink(userId) // ایجاد لینک جدید برای کاربر
                                .then((inviteLink) => {
                                    const expireDate = Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 10 دقیقه اعتبار لینک
                                    const userData = {
                                        privateGroupInviteLink: inviteLink,
                                        expireDate: expireDate
                                    }
                                    const links = readLinksFile()
                                    links.users = links.users || {}
                                    links.users[userId] = userData
                                    saveLinksFile(links)

                                    bot.sendMessage(chatId, `🎉 لینک دعوت برای شما ایجاد شد:\n${inviteLink}\n⚠️کاربر عزیز دقت کنید زدن بیش از 10 بار دکمه شروع در هر روز باعث بلاک شدن برای 24 ساعت میشود⚠️`)
                                })
                                .catch((err) => {
                                    console.error(err)
                                    bot.sendMessage(chatId, '⛔متاسفانه نمی‌توانم لینک دعوت به گروه پرایوت را ایجاد کنم.⛔')
                                })
                        } else {
                            let timeMessage = ''

                            const timeLeft = userLinkData.expireDate - currentTime

                            const hours = Math.floor(timeLeft / 3600)
                            const minutes = Math.floor((timeLeft % 3600) / 60)

                            if (hours > 0) {
                                timeMessage += `${hours} ساعت `
                            }

                            if (minutes > 0 || timeMessage === '') {
                                timeMessage += `${minutes} دقیقه`
                            }

                            bot.sendMessage(chatId, `شما قبلاً لینک دعوت گرفته‌اید:\n${userLinkData.privateGroupInviteLink}\nزمان باقی‌مانده برای درخواست مجدد لینک: ${timeMessage} ⏳`)
                        }
                    } else {
                        createOrUpdatePrivateGroupInviteLink(userId) // ایجاد لینک جدید برای کاربر
                            .then((inviteLink) => {
                                const expireDate = Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 ساعت
                                const userData = {
                                    privateGroupInviteLink: inviteLink,
                                    expireDate: expireDate
                                }
                                const links = readLinksFile()
                                links.users = links.users || {}
                                links.users[userId] = userData
                                saveLinksFile(links)

                                bot.sendMessage(chatId, `لینک دعوت برای شما ایجاد شد:\n${inviteLink}\n⚠️کاربر عزیز دقت کنید زدن بیش از 10 بار دکمه شروع در هر روز باعث بلاک شدن برای 24 ساعت میشود⚠️`)
                            })
                            .catch((err) => {
                                console.error(err)
                                bot.sendMessage(chatId, '⛔متاسفانه نمی‌توانم لینک دعوت به گروه پرایوت را ایجاد کنم.⛔')
                            })
                    }
                } else {
                    bot.sendMessage(chatId, 'شما هنوز عضو کانال پابلیک نشده‌اید. برای عضویت، از لینک زیر استفاده کنید:\nhttps://t.me/js_challenges')
                }
            })
            .catch((err) => {
                console.error(err)
            })
    }
})
