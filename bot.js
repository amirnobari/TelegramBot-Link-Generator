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
// تابع بررسی عضویت در کانال‌ها
function checkPublicChannelMembership(userId) {
    const channel1Id = -1001956864682 // شناسه کانال اول
    const channel2Id = -1002111615139 // شناسه کانال دوم
    const channel3Id = -1002139501810 // شناسه کانال سوم

    const channel1Membership = bot.getChatMember(channel1Id, userId)
    const channel2Membership = bot.getChatMember(channel2Id, userId)
    const channel3Membership = bot.getChatMember(channel3Id, userId)


    return Promise.all([channel1Membership, channel2Membership, channel3Membership])
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
bot.onText(/\/start/, async (msg) => {
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
        try {
            const publicChatMemberships = await checkPublicChannelMembership(userId)
            const publicChat1Member = publicChatMemberships[0]
            const publicChat2Member = publicChatMemberships[1]
            const publicChat3Member = publicChatMemberships[2]


            const isMemberChannel1 = ['member', 'creator', 'administrator'].includes(publicChat1Member.status)
            const isMemberChannel2 = ['member', 'creator', 'administrator'].includes(publicChat2Member.status)
            const isMemberChannel3 = ['member', 'creator', 'administrator'].includes(publicChat3Member.status)


            if (!isMemberChannel1 && !isMemberChannel2 && !isMemberChannel3) {
                bot.sendMessage(chatId, 'شما هنوز عضو کانال‌های پابلیک نشده‌اید. برای عضویت، از لینک‌های زیر استفاده کنید:\nhttps://t.me/js_challenges\nhttps://t.me/CSSMarkup\nhttps://t.me/Code_Beats')
            } else if (!isMemberChannel1) {
                bot.sendMessage(chatId, 'شما هنوز عضو کانال پابلیک اول نشده‌اید. برای عضویت، از لینک زیر استفاده کنید:\nhttps://t.me/js_challenges')
            } else if (!isMemberChannel2) {
                bot.sendMessage(chatId, 'شما هنوز عضو کانال پابلیک اول نشده‌اید. برای عضویت، از لینک زیر استفاده کنید:\nhttps://t.me/CSSMarkup')
            } else if (!isMemberChannel3) {
                bot.sendMessage(chatId, 'شما هنوز عضو کانال پابلیک سوم نشده‌اید. برای عضویت، از لینک زیر استفاده کنید:\nhttps://t.me/Code_Beats')
            } else {

                const userExists = checkUserExistence(userId)

                if (publicChat1Member && (publicChat1Member.status === 'member' || publicChat1Member.status === 'creator' || publicChat1Member.status === 'administrator')) {
                    if (userExists) {
                        const userLinkData = readLinksFile().users[userId]
                        const currentTime = Math.floor(Date.now() / 1000)

                        if (userLinkData.expireDate < currentTime) {
                            removeUserData(userId)
                            createOrUpdatePrivateGroupInviteLink(userId)
                                .then((inviteLink) => {
                                    const expireDate = Math.floor(Date.now() / 1000) + (24 * 60 * 60)
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
                        createOrUpdatePrivateGroupInviteLink(userId)
                            .then((inviteLink) => {
                                const expireDate = Math.floor(Date.now() / 1000) + (24 * 60 * 60)
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
            }
        } catch (err) {
            console.error(err)
        }
    }
})
