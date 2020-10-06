(function () {
    'use strict'

    function isChromiumBased() {
        return navigator.userAgent.toLowerCase().includes('chrome') || navigator.userAgent.toLowerCase().includes('chromium')
    }
    function isFirefox() {
        return navigator.userAgent.includes('Firefox')
    }
    function isEdge() {
        return navigator.userAgent.includes('Edge')
    }
    function isWindows() {
        if (typeof navigator === 'undefined') {
            return null
        }
        return navigator.platform.toLowerCase().startsWith('win')
    }
    function isMacOS() {
        if (typeof navigator === 'undefined') {
            return null
        }
        return navigator.platform.toLowerCase().startsWith('mac')
    }
    function getChromeVersion() {
        const agent = navigator.userAgent.toLowerCase()
        const m = agent.match(/chrom[e|ium]\/([^ ]+)/)
        if (m && m[1]) {
            return m[1]
        }
        return null
    }
    function compareChromeVersions($a, $b) {
        const a = $a.split('.').map((x) => parseInt(x))
        const b = $b.split('.').map((x) => parseInt(x))
        for (let i = 0;i < a.length;i++) {
            if (a[i] !== b[i]) {
                return a[i] < b[i] ? -1 : 1
            }
        }
        return 0
    }

    async function getOKResponse(url, mimeType) {
        const response = await fetch(url, {
            cache: 'force-cache',
            credentials: 'omit',
        })
        if (isFirefox() && mimeType === 'text/css' && url.startsWith('moz-extension://') && url.endsWith('.css')) {
            return response
        }
        if (mimeType && !response.headers.get('Content-Type').startsWith(mimeType)) {
            throw new Error(`Mime type mismatch when loading ${url}`)
        }
        if (!response.ok) {
            throw new Error(`Unable to load ${url} ${response.status} ${response.statusText}`)
        }
        return response
    }
    async function loadAsDataURL(url, mimeType) {
        const response = await getOKResponse(url, mimeType)
        return await readResponseAsDataURL(response)
    }
    async function readResponseAsDataURL(response) {
        const blob = await response.blob()
        const dataURL = await (new Promise((resolve) => {
            const reader = new FileReader()
            reader.onloadend = () => resolve(reader.result)
            reader.readAsDataURL(blob)
        }))
        return dataURL
    }
    async function loadAsText(url, mimeType) {
        const response = await getOKResponse(url, mimeType)
        return await response.text()
    }

    function parseArray(text) {
        return text.replace(/\r/g, '')
            .split('\n')
            .map((s) => s.trim())
            .filter((s) => s)
    }
    function formatArray(arr) {
        return arr.concat('').join('\n')
    }
    function getStringSize(value) {
        return value.length * 2
    }

    function parse24HTime(time) {
        return time.split(':').map((x) => parseInt(x))
    }
    function compareTime(a, b) {
        if (a[0] === b[0] && a[1] === b[1]) {
            return 0
        }
        if (a[0] < b[0] || (a[0] === b[0] && a[1] < b[1])) {
            return -1
        }
        return 1
    }
    function isInTimeInterval(date, time0, time1) {
        const a = parse24HTime(time0)
        const b = parse24HTime(time1)
        const t = [date.getHours(), date.getMinutes()]
        if (compareTime(a, b) > 0) {
            return compareTime(a, t) <= 0 || compareTime(t, b) < 0
        }
        return compareTime(a, t) <= 0 && compareTime(t, b) < 0
    }
    function getDuration(time) {
        let duration = 0
        if (time.seconds) {
            duration += time.seconds * 1000
        }
        if (time.minutes) {
            duration += time.minutes * 60 * 1000
        }
        if (time.hours) {
            duration += time.hours * 60 * 60 * 1000
        }
        if (time.days) {
            duration += time.days * 24 * 60 * 60 * 1000
        }
        return duration
    }
    function getSunsetSunriseUTCTime(date, latitude, longitude) {
        const dec31 = new Date(date.getUTCFullYear(), 0, 0)
        const oneDay = getDuration({ days: 1 })
        const dayOfYear = Math.floor((Number(date) - Number(dec31)) / oneDay)
        const zenith = 90.83333333333333
        const D2R = Math.PI / 180
        const R2D = 180 / Math.PI
        const lnHour = longitude / 15
        function getTime(isSunrise) {
            const t = dayOfYear + (((isSunrise ? 6 : 18) - lnHour) / 24)
            const M = (0.9856 * t) - 3.289
            let L = M + (1.916 * Math.sin(M * D2R)) + (0.020 * Math.sin(2 * M * D2R)) + 282.634
            if (L > 360) {
                L = L - 360
            }
            else if (L < 0) {
                L = L + 360
            }
            let RA = R2D * Math.atan(0.91764 * Math.tan(L * D2R))
            if (RA > 360) {
                RA = RA - 360
            }
            else if (RA < 0) {
                RA = RA + 360
            }
            const Lquadrant = (Math.floor(L / (90))) * 90
            const RAquadrant = (Math.floor(RA / 90)) * 90
            RA = RA + (Lquadrant - RAquadrant)
            RA = RA / 15
            const sinDec = 0.39782 * Math.sin(L * D2R)
            const cosDec = Math.cos(Math.asin(sinDec))
            const cosH = (Math.cos(zenith * D2R) - (sinDec * Math.sin(latitude * D2R))) / (cosDec * Math.cos(latitude * D2R))
            if (cosH > 1) {
                return {
                    alwaysDay: false,
                    alwaysNight: true,
                    time: 0,
                }
            }
            else if (cosH < -1) {
                return {
                    alwaysDay: true,
                    alwaysNight: false,
                    time: 0,
                }
            }
            const H = (isSunrise ? (360 - R2D * Math.acos(cosH)) : (R2D * Math.acos(cosH))) / 15
            const T = H + RA - (0.06571 * t) - 6.622
            let UT = T - lnHour
            if (UT > 24) {
                UT = UT - 24
            }
            else if (UT < 0) {
                UT = UT + 24
            }
            return {
                alwaysDay: false,
                alwaysNight: false,
                time: UT * getDuration({ hours: 1 }),
            }
        }
        const sunriseTime = getTime(true)
        const sunsetTime = getTime(false)
        if (sunriseTime.alwaysDay || sunsetTime.alwaysDay) {
            return {
                alwaysDay: true
            }
        }
        else if (sunriseTime.alwaysNight || sunsetTime.alwaysNight) {
            return {
                alwaysNight: true
            }
        }
        return {
            sunriseTime: sunriseTime.time,
            sunsetTime: sunsetTime.time
        }
    }
    function isNightAtLocation(date, latitude, longitude) {
        const time = getSunsetSunriseUTCTime(date, latitude, longitude)
        if (time.alwaysDay) {
            return false
        }
        else if (time.alwaysNight) {
            return true
        }
        const sunriseTime = time.sunriseTime
        const sunsetTime = time.sunsetTime
        const currentTime = (date.getUTCHours() * getDuration({ hours: 1 }) +
            date.getUTCMinutes() * getDuration({ minutes: 1 }) +
            date.getUTCSeconds() * getDuration({ seconds: 1 }))
        if (sunsetTime > sunriseTime) {
            return (currentTime > sunsetTime) || (currentTime < sunriseTime)
        }
        else {
            return (currentTime > sunsetTime) && (currentTime < sunriseTime)
        }
    }

    function readText(params) {
        return new Promise((resolve, reject) => {
            const request = new XMLHttpRequest()
            request.overrideMimeType('text/plain')
            request.open('GET', params.url, true)
            request.onload = () => {
                if (request.status >= 200 && request.status < 300) {
                    resolve(request.responseText)
                }
                else {
                    reject(new Error(`${request.status}: ${request.statusText}`))
                }
            }
            request.onerror = () => reject(new Error(`${request.status}: ${request.statusText}`))
            if (params.timeout) {
                request.timeout = params.timeout
                request.ontimeout = () => reject(new Error('File loading stopped due to timeout'))
            }
            request.send()
        })
    }
    class LimitedCacheStorage {
        constructor() {
            this.bytesInUse = 0
            this.records = new Map()
            setInterval(() => this.removeExpiredRecords(), getDuration({ minutes: 1 }))
        }
        has(url) {
            return this.records.has(url)
        }
        get(url) {
            if (this.records.has(url)) {
                const record = this.records.get(url)
                record.expires = Date.now() + LimitedCacheStorage.TTL
                this.records.delete(url)
                this.records.set(url, record)
                return record.value
            }
            return null
        }
        set(url, value) {
            const size = getStringSize(value)
            if (size > LimitedCacheStorage.QUOTA_BYTES) {
                return
            }
            for (const [url, record] of this.records) {
                if (this.bytesInUse + size > LimitedCacheStorage.QUOTA_BYTES) {
                    this.records.delete(url)
                    this.bytesInUse -= record.size
                }
                else {
                    break
                }
            }
            const expires = Date.now() + LimitedCacheStorage.TTL
            this.records.set(url, { url, value, size, expires })
            this.bytesInUse += size
        }
        removeExpiredRecords() {
            const now = Date.now()
            for (const [url, record] of this.records) {
                if (record.expires < now) {
                    this.records.delete(url)
                    this.bytesInUse -= record.size
                }
                else {
                    break
                }
            }
        }
    }
    LimitedCacheStorage.QUOTA_BYTES = (navigator.deviceMemory || 4) * 16 * 1024 * 1024
    LimitedCacheStorage.TTL = getDuration({ minutes: 10 })
    function createFileLoader() {
        const caches = {
            'data-url': new LimitedCacheStorage(),
            'text': new LimitedCacheStorage(),
        }
        const loaders = {
            'data-url': loadAsDataURL,
            'text': loadAsText,
        }
        async function get({ url, responseType, mimeType }) {
            const cache = caches[responseType]
            const load = loaders[responseType]
            if (cache.has(url)) {
                return cache.get(url)
            }
            const data = await load(url, mimeType)
            cache.set(url, data)
            return data
        }
        return { get }
    }

    function isArrayLike(items) {
        return items.length != null
    }
    function forEach(items, iterator) {
        if (isArrayLike(items)) {
            for (let i = 0, len = items.length;i < len;i++) {
                iterator(items[i])
            }
        }
        else {
            for (const item of items) {
                iterator(item)
            }
        }
    }
    function push(array, addition) {
        forEach(addition, (a) => array.push(a))
    }

    function formatSitesFixesConfig(fixes, options) {
        const lines = []
        fixes.forEach((fix, i) => {
            push(lines, fix.url)
            options.props.forEach((prop) => {
                const command = options.getPropCommandName(prop)
                const value = fix[prop]
                if (options.shouldIgnoreProp(prop, value)) {
                    return
                }
                lines.push('')
                lines.push(command)
                const formattedValue = options.formatPropValue(prop, value)
                if (formattedValue) {
                    lines.push(formattedValue)
                }
            })
            if (i < fixes.length - 1) {
                lines.push('')
                lines.push('='.repeat(32))
                lines.push('')
            }
        })
        lines.push('')
        return lines.join('\n')
    }

    function scale(x, inLow, inHigh, outLow, outHigh) {
        return (x - inLow) * (outHigh - outLow) / (inHigh - inLow) + outLow
    }
    function clamp(x, min, max) {
        return Math.min(max, Math.max(min, x))
    }
    function multiplyMatrices(m1, m2) {
        const result = []
        for (let i = 0, len = m1.length;i < len;i++) {
            result[i] = []
            for (let j = 0, len2 = m2[0].length;j < len2;j++) {
                let sum = 0
                for (let k = 0, len3 = m1[0].length;k < len3;k++) {
                    sum += m1[i][k] * m2[k][j]
                }
                result[i][j] = sum
            }
        }
        return result
    }

    function createFilterMatrix(config) {
        let m = Matrix.identity()
        if (config.sepia !== 0) {
            m = multiplyMatrices(m, Matrix.sepia(config.sepia / 100))
        }
        if (config.grayscale !== 0) {
            m = multiplyMatrices(m, Matrix.grayscale(config.grayscale / 100))
        }
        if (config.contrast !== 100) {
            m = multiplyMatrices(m, Matrix.contrast(config.contrast / 100))
        }
        if (config.brightness !== 100) {
            m = multiplyMatrices(m, Matrix.brightness(config.brightness / 100))
        }
        if (config.mode === 1) {
            m = multiplyMatrices(m, Matrix.invertNHue())
        }
        return m
    }
    function applyColorMatrix([r, g, b], matrix) {
        const rgb = [[r / 255], [g / 255], [b / 255], [1], [1]]
        const result = multiplyMatrices(matrix, rgb)
        return [0, 1, 2].map((i) => clamp(Math.round(result[i][0] * 255), 0, 255))
    }
    const Matrix = {
        identity() {
            return [
                [1, 0, 0, 0, 0],
                [0, 1, 0, 0, 0],
                [0, 0, 1, 0, 0],
                [0, 0, 0, 1, 0],
                [0, 0, 0, 0, 1]
            ]
        },
        invertNHue() {
            return [
                [0.333, -0.667, -0.667, 0, 1],
                [-0.667, 0.333, -0.667, 0, 1],
                [-0.667, -0.667, 0.333, 0, 1],
                [0, 0, 0, 1, 0],
                [0, 0, 0, 0, 1]
            ]
        },
        brightness(v) {
            return [
                [v, 0, 0, 0, 0],
                [0, v, 0, 0, 0],
                [0, 0, v, 0, 0],
                [0, 0, 0, 1, 0],
                [0, 0, 0, 0, 1]
            ]
        },
        contrast(v) {
            const t = (1 - v) / 2
            return [
                [v, 0, 0, 0, t],
                [0, v, 0, 0, t],
                [0, 0, v, 0, t],
                [0, 0, 0, 1, 0],
                [0, 0, 0, 0, 1]
            ]
        },
        sepia(v) {
            return [
                [(0.393 + 0.607 * (1 - v)), (0.769 - 0.769 * (1 - v)), (0.189 - 0.189 * (1 - v)), 0, 0],
                [(0.349 - 0.349 * (1 - v)), (0.686 + 0.314 * (1 - v)), (0.168 - 0.168 * (1 - v)), 0, 0],
                [(0.272 - 0.272 * (1 - v)), (0.534 - 0.534 * (1 - v)), (0.131 + 0.869 * (1 - v)), 0, 0],
                [0, 0, 0, 1, 0],
                [0, 0, 0, 0, 1]
            ]
        },
        grayscale(v) {
            return [
                [(0.2126 + 0.7874 * (1 - v)), (0.7152 - 0.7152 * (1 - v)), (0.0722 - 0.0722 * (1 - v)), 0, 0],
                [(0.2126 - 0.2126 * (1 - v)), (0.7152 + 0.2848 * (1 - v)), (0.0722 - 0.0722 * (1 - v)), 0, 0],
                [(0.2126 - 0.2126 * (1 - v)), (0.7152 - 0.7152 * (1 - v)), (0.0722 + 0.9278 * (1 - v)), 0, 0],
                [0, 0, 0, 1, 0],
                [0, 0, 0, 0, 1]
            ]
        },
    }

    function parseSitesFixesConfig(text, options) {
        const sites = []
        const blocks = text.replace(/\r/g, '').split(/^\s*={2,}\s*$/gm)
        blocks.forEach((block) => {
            const lines = block.split('\n')
            const commandIndices = []
            lines.forEach((ln, i) => {
                if (ln.match(/^\s*[A-Z]+(\s[A-Z]+)*\s*$/)) {
                    commandIndices.push(i)
                }
            })
            if (commandIndices.length === 0) {
                return
            }
            const siteFix = {
                url: parseArray(lines.slice(0, commandIndices[0]).join('\n')),
            }
            commandIndices.forEach((commandIndex, i) => {
                const command = lines[commandIndex].trim()
                const valueText = lines.slice(commandIndex + 1, i === commandIndices.length - 1 ? lines.length : commandIndices[i + 1]).join('\n')
                const prop = options.getCommandPropName(command)
                if (!prop) {
                    return
                }
                const value = options.parseCommandValue(command, valueText)
                siteFix[prop] = value
            })
            sites.push(siteFix)
        })
        return sites
    }

    function isIPV6(url) {
        const openingBracketIndex = url.indexOf('[')
        if (openingBracketIndex < 0) {
            return false
        }
        const queryIndex = url.indexOf('?')
        if (queryIndex >= 0 && openingBracketIndex > queryIndex) {
            return false
        }
        return true
    }
    const ipV6HostRegex = /\[.*?\](\:\d+)?/
    function compareIPV6(firstURL, secondURL) {
        const firstHost = firstURL.match(ipV6HostRegex)[0]
        const secondHost = secondURL.match(ipV6HostRegex)[0]
        return firstHost === secondHost
    }

    function getURLHostOrProtocol($url) {
        const url = new URL($url)
        if (url.host) {
            return url.host
        }
        else {
            return url.protocol
        }
    }
    function compareURLPatterns(a, b) {
        return a.localeCompare(b)
    }
    /**
     * Determines whether URL has a match in URL template list.
     * @param url Site URL.
     * @paramlist List to search into.
     */
    function isURLInList(url, list) {
        for (let i = 0;i < list.length;i++) {
            if (isURLMatched(url, list[i])) {
                return true
            }
        }
        return false
    }
    /**
     * Determines whether URL matches the template.
     * @param url URL.
     * @param urlTemplate URL template ("google.*", "youtube.com" etc).
     */
    function isURLMatched(url, urlTemplate) {
        const isFirstIPV6 = isIPV6(url)
        const isSecondIPV6 = isIPV6(urlTemplate)
        if (isFirstIPV6 && isSecondIPV6) {
            return compareIPV6(url, urlTemplate)
        }
        else if (!isSecondIPV6 && !isSecondIPV6) {
            const regex = createUrlRegex(urlTemplate)
            return Boolean(url.match(regex))
        }
        else {
            return false
        }
    }
    function createUrlRegex(urlTemplate) {
        urlTemplate = urlTemplate.trim()
        const exactBeginning = (urlTemplate[0] === '^')
        const exactEnding = (urlTemplate[urlTemplate.length - 1] === '$')
        urlTemplate = (urlTemplate
            .replace(/^\^/, '')
            .replace(/\$$/, '')
            .replace(/^.*?\/{2,3}/, '')
            .replace(/\?.*$/, '')
            .replace(/\/$/, '')
        )
        let slashIndex
        let beforeSlash
        let afterSlash
        if ((slashIndex = urlTemplate.indexOf('/')) >= 0) {
            beforeSlash = urlTemplate.substring(0, slashIndex)
            afterSlash = urlTemplate.replace('$', '').substring(slashIndex)
        }
        else {
            beforeSlash = urlTemplate.replace('$', '')
        }

        let result = (exactBeginning ?
            '^(.*?\\:\\/{2,3})?'
            : '^(.*?\\:\\/{2,3})?([^\/]*?\\.)?'
        )

        const hostParts = beforeSlash.split('.')
        result += '('
        for (let i = 0;i < hostParts.length;i++) {
            if (hostParts[i] === '*') {
                hostParts[i] = '[^\\.\\/]+?'
            }
        }
        result += hostParts.join('\\.')
        result += ')'

        if (afterSlash) {
            result += '('
            result += afterSlash.replace('/', '\\/')
            result += ')'
        }
        result += (exactEnding ?
            '(\\/?(\\?[^\/]*?)?)$'
            : '(\\/?.*?)$'
        )

        return new RegExp(result, 'i')
    }
    function isPDF(url) {
        if (url.includes('.pdf')) {
            if (url.includes('?')) {
                url = url.substring(0, url.lastIndexOf('?'))
            }
            if (url.includes('#')) {
                url = url.substring(0, url.lastIndexOf('#'))
            }
            if (url.match(/(wikipedia|wikimedia).org/i) && url.match(/(wikipedia|wikimedia)\.org\/.*\/[a-z]+\:[^\:\/]+\.pdf/i)) {
                return false
            }
            if (url.endsWith('.pdf')) {
                for (let i = url.length;0 < i;i--) {
                    if (url[i] === '=') {
                        return false
                    }
                    else if (url[i] === '/') {
                        return true
                    }
                }
            }
            else {
                return false
            }
        }
        return false
    }
    function isURLEnabled(url, userSettings, { isProtected, isInDarkList }) {
        if (isProtected && !userSettings.enableForProtectedPages) {
            return false
        }
        if (isPDF(url)) {
            return userSettings.enableForPDF
        }
        const isURLInUserList = isURLInList(url, userSettings.siteList)
        if (userSettings.applyToListedOnly) {
            return isURLInUserList
        }
        const isURLInEnabledList = isURLInList(url, userSettings.siteListEnabled)
        if (isURLInEnabledList && isInDarkList) {
            return true
        }
        return (!isInDarkList && !isURLInUserList)
    }

    function createTextStyle(config) {
        const lines = []
        lines.push('*:not(pre) {')
        if (config.useFont && config.fontFamily) {
            lines.push(`  font-family: ${config.fontFamily} !important;`)
        }
        if (config.textStroke > 0) {
            lines.push(`  -webkit-text-stroke: ${config.textStroke}px !important;`)
            lines.push(`  text-stroke: ${config.textStroke}px !important;`)
        }
        lines.push('}')
        return lines.join('\n')
    }

    var FilterMode;
    (function (FilterMode) {
        FilterMode[FilterMode["light"] = 0] = "light"
        FilterMode[FilterMode["dark"] = 1] = "dark"
    })(FilterMode || (FilterMode = {}))
    function hasChromiumIssue501582() {
        const chromeVersion = getChromeVersion()
        return Boolean(isChromiumBased() &&
            compareChromeVersions(chromeVersion, '81.0.4035.0') >= 0)
    }
    function createCSSFilterStyleheet(config, url, frameURL, inversionFixes) {
        const filterValue = getCSSFilterValue(config)
        const reverseFilterValue = 'invert(100%) hue-rotate(180deg)'
        return cssFilterStyleheetTemplate(filterValue, reverseFilterValue, config, url, frameURL, inversionFixes)
    }
    function cssFilterStyleheetTemplate(filterValue, reverseFilterValue, config, url, frameURL, inversionFixes) {
        const fix = getInversionFixesFor(frameURL || url, inversionFixes)
        const lines = []
        lines.push('@media screen {')
        if (filterValue && !frameURL) {
            lines.push('')
            lines.push('/* Leading rule */')
            lines.push(createLeadingRule(filterValue))
        }
        if (config.mode === FilterMode.dark) {
            lines.push('')
            lines.push('/* Reverse rule */')
            lines.push(createReverseRule(reverseFilterValue, fix))
        }
        if (config.useFont || config.textStroke > 0) {
            lines.push('')
            lines.push('/* Font */')
            lines.push(createTextStyle(config))
        }
        lines.push('')
        lines.push('/* Text contrast */')
        lines.push('html {')
        lines.push('  text-shadow: 0 0 0 !important;')
        lines.push('}')
        lines.push('')
        lines.push('/* Full screen */');
        [':-webkit-full-screen', ':-moz-full-screen', ':fullscreen'].forEach((fullScreen) => {
            lines.push(`${fullScreen}, ${fullScreen} * {`)
            lines.push('  -webkit-filter: none !important;')
            lines.push('  filter: none !important;')
            lines.push('}')
        })
        if (!frameURL) {
            const rootColors = hasChromiumIssue501582() && config.mode === FilterMode.dark ? [0, 0, 0] : [255, 255, 255]
            const [r, g, b] = applyColorMatrix(rootColors, createFilterMatrix(config))
            const bgColor = {
                r: Math.round(r),
                g: Math.round(g),
                b: Math.round(b),
                toString() {
                    return `rgb(${this.r},${this.g},${this.b})`
                },
            }
            lines.push('')
            lines.push('/* Page background */')
            lines.push('html {')
            lines.push(`  background: ${bgColor} !important;`)
            lines.push('}')
        }
        if (fix.css && fix.css.length > 0 && config.mode === FilterMode.dark) {
            lines.push('')
            lines.push('/* Custom rules */')
            lines.push(fix.css)
        }
        lines.push('')
        lines.push('}')
        return lines.join('\n')
    }
    function getCSSFilterValue(config) {
        const filters = []
        if (config.mode === FilterMode.dark) {
            filters.push('invert(100%) hue-rotate(180deg)')
        }
        if (config.brightness !== 100) {
            filters.push(`brightness(${config.brightness}%)`)
        }
        if (config.contrast !== 100) {
            filters.push(`contrast(${config.contrast}%)`)
        }
        if (config.grayscale !== 0) {
            filters.push(`grayscale(${config.grayscale}%)`)
        }
        if (config.sepia !== 0) {
            filters.push(`sepia(${config.sepia}%)`)
        }
        if (filters.length === 0) {
            return null
        }
        return filters.join(' ')
    }
    function createLeadingRule(filterValue) {
        return [
            'html {',
            `  -webkit-filter: ${filterValue} !important;`,
            `  filter: ${filterValue} !important;`,
            '}'
        ].join('\n')
    }
    function joinSelectors(selectors) {
        return selectors.map((s) => s.replace(/\,$/, '')).join(',\n')
    }
    function createReverseRule(reverseFilterValue, fix) {
        const lines = []
        if (fix.invert.length > 0) {
            lines.push(`${joinSelectors(fix.invert)} {`)
            lines.push(`  -webkit-filter: ${reverseFilterValue} !important;`)
            lines.push(`  filter: ${reverseFilterValue} !important;`)
            lines.push('}')
        }
        if (fix.noinvert.length > 0) {
            lines.push(`${joinSelectors(fix.noinvert)} {`)
            lines.push('  -webkit-filter: none !important;')
            lines.push('  filter: none !important;')
            lines.push('}')
        }
        if (fix.removebg.length > 0) {
            lines.push(`${joinSelectors(fix.removebg)} {`)
            lines.push('  background: white !important;')
            lines.push('}')
        }
        return lines.join('\n')
    }
    /**
    * Returns fixes for a given URL.
    * If no matches found, common fixes will be returned.
    * @param url Site URL.
    * @param inversionFixes List of inversion fixes.
    */
    function getInversionFixesFor(url, inversionFixes) {
        const common = {
            url: inversionFixes[0].url,
            invert: inversionFixes[0].invert || [],
            noinvert: inversionFixes[0].noinvert || [],
            removebg: inversionFixes[0].removebg || [],
            css: inversionFixes[0].css || '',
        }
        if (url) {
            const matches = inversionFixes
                .slice(1)
                .filter((s) => isURLInList(url, s.url))
                .sort((a, b) => b.url[0].length - a.url[0].length)
            if (matches.length > 0) {
                const found = matches[0]
                return {
                    url: found.url,
                    invert: common.invert.concat(found.invert || []),
                    noinvert: common.noinvert.concat(found.noinvert || []),
                    removebg: common.removebg.concat(found.removebg || []),
                    css: [common.css, found.css].filter((s) => s).join('\n'),
                }
            }
        }
        return common
    }
    const inversionFixesCommands = {
        'INVERT': 'invert',
        'NO INVERT': 'noinvert',
        'REMOVE BG': 'removebg',
        'CSS': 'css',
    }
    function parseInversionFixes(text) {
        return parseSitesFixesConfig(text, {
            commands: Object.keys(inversionFixesCommands),
            getCommandPropName: (command) => inversionFixesCommands[command] || null,
            parseCommandValue: (command, value) => {
                if (command === 'CSS') {
                    return value.trim()
                }
                return parseArray(value)
            },
        })
    }
    function formatInversionFixes(inversionFixes) {
        const fixes = inversionFixes.slice().sort((a, b) => compareURLPatterns(a.url[0], b.url[0]))
        return formatSitesFixesConfig(fixes, {
            props: Object.values(inversionFixesCommands),
            getPropCommandName: (prop) => Object.entries(inversionFixesCommands).find(([, p]) => p === prop)[0],
            formatPropValue: (prop, value) => {
                if (prop === 'css') {
                    return value.trim()
                }
                return formatArray(value).trim()
            },
            shouldIgnoreProp: (prop, value) => {
                if (prop === 'css') {
                    return !value
                }
                return !(Array.isArray(value) && value.length > 0)
            }
        })
    }

    const dynamicThemeFixesCommands = {
        'INVERT': 'invert',
        'CSS': 'css',
        'IGNORE INLINE STYLE': 'ignoreInlineStyle',
        'IGNORE IMAGE ANALYSIS': 'ignoreImageAnalysis',
    }
    function parseDynamicThemeFixes(text) {
        return parseSitesFixesConfig(text, {
            commands: Object.keys(dynamicThemeFixesCommands),
            getCommandPropName: (command) => dynamicThemeFixesCommands[command] || null,
            parseCommandValue: (command, value) => {
                if (command === 'CSS') {
                    return value.trim()
                }
                return parseArray(value)
            },
        })
    }
    function formatDynamicThemeFixes(dynamicThemeFixes) {
        const fixes = dynamicThemeFixes.slice().sort((a, b) => compareURLPatterns(a.url[0], b.url[0]))
        return formatSitesFixesConfig(fixes, {
            props: Object.values(dynamicThemeFixesCommands),
            getPropCommandName: (prop) => Object.entries(dynamicThemeFixesCommands).find(([, p]) => p === prop)[0],
            formatPropValue: (prop, value) => {
                if (prop === 'css') {
                    return value.trim()
                }
                return formatArray(value).trim()
            },
            shouldIgnoreProp: (prop, value) => {
                if (prop === 'css') {
                    return !value
                }
                return !(Array.isArray(value) && value.length > 0)
            },
        })
    }
    function getDynamicThemeFixesFor(url, frameURL, fixes, enabledForPDF) {
        if (fixes.length === 0 || fixes[0].url[0] !== '*') {
            return null
        }
        const common = {
            url: fixes[0].url,
            invert: fixes[0].invert || [],
            css: fixes[0].css || [],
            ignoreInlineStyle: fixes[0].ignoreInlineStyle || [],
            ignoreImageAnalysis: fixes[0].ignoreImageAnalysis || [],
        }
        if (enabledForPDF) {
            common.invert = common.invert.concat('embed[type="application/pdf"]')
        }
        const sortedBySpecificity = fixes
            .slice(1)
            .map((theme) => {
                return {
                    specificity: isURLInList(frameURL || url, theme.url) ? theme.url[0].length : 0,
                    theme
                }
            })
            .filter(({ specificity }) => specificity > 0)
            .sort((a, b) => b.specificity - a.specificity)
        if (sortedBySpecificity.length === 0) {
            return common
        }
        const match = sortedBySpecificity[0].theme
        return {
            url: match.url,
            invert: common.invert.concat(match.invert || []),
            css: [common.css, match.css].filter((s) => s).join('\n'),
            ignoreInlineStyle: common.ignoreInlineStyle.concat(match.ignoreInlineStyle || []),
            ignoreImageAnalysis: common.ignoreImageAnalysis.concat(match.ignoreImageAnalysis || []),
        }
    }

    const darkTheme = {
        neutralBg: [16, 20, 23],
        neutralText: [167, 158, 139],
        redBg: [64, 12, 32],
        redText: [247, 142, 102],
        greenBg: [32, 64, 48],
        greenText: [128, 204, 148],
        blueBg: [32, 48, 64],
        blueText: [128, 182, 204],
        fadeBg: [16, 20, 23, 0.5],
        fadeText: [167, 158, 139, 0.5],
    }
    const lightTheme = {
        neutralBg: [255, 242, 228],
        neutralText: [0, 0, 0],
        redBg: [255, 85, 170],
        redText: [140, 14, 48],
        greenBg: [192, 255, 170],
        greenText: [0, 128, 0],
        blueBg: [173, 215, 229],
        blueText: [28, 16, 171],
        fadeBg: [0, 0, 0, 0.5],
        fadeText: [0, 0, 0, 0.5],
    }
    function rgb([r, g, b, a]) {
        if (typeof a === 'number') {
            return `rgba(${r}, ${g}, ${b}, ${a})`
        }
        return `rgb(${r}, ${g}, ${b})`
    }
    function mix(color1, color2, t) {
        return color1.map((c, i) => Math.round(c * (1 - t) + color2[i] * t))
    }
    function createStaticStylesheet(config, url, frameURL, staticThemes) {
        const srcTheme = config.mode === 1 ? darkTheme : lightTheme
        const theme = Object.entries(srcTheme).reduce((t, [prop, color]) => {
            t[prop] = applyColorMatrix(color, createFilterMatrix({ ...config, mode: 0 }))
            return t
        }, {})
        const commonTheme = getCommonTheme(staticThemes)
        const siteTheme = getThemeFor(frameURL || url, staticThemes)
        const lines = []
        if (!siteTheme || !siteTheme.noCommon) {
            lines.push('/* Common theme */')
            lines.push(...ruleGenerators.map((gen) => gen(commonTheme, theme)))
        }
        if (siteTheme) {
            lines.push(`/* Theme for ${siteTheme.url.join(' ')} */`)
            lines.push(...ruleGenerators.map((gen) => gen(siteTheme, theme)))
        }
        if (config.useFont || config.textStroke > 0) {
            lines.push('/* Font */')
            lines.push(createTextStyle(config))
        }
        return lines
            .filter((ln) => ln)
            .join('\n')
    }
    function createRuleGen(getSelectors, generateDeclarations, modifySelector = (s) => s) {
        return (siteTheme, themeColors) => {
            const selectors = getSelectors(siteTheme)
            if (selectors == null || selectors.length === 0) {
                return null
            }
            const lines = []
            selectors.forEach((s, i) => {
                let ln = modifySelector(s)
                if (i < selectors.length - 1) {
                    ln += ','
                }
                else {
                    ln += ' {'
                }
                lines.push(ln)
            })
            const declarations = generateDeclarations(themeColors)
            declarations.forEach((d) => lines.push(`    ${d} !important;`))
            lines.push('}')
            return lines.join('\n')
        }
    }
    const mx = {
        bg: {
            hover: 0.075,
            active: 0.1,
        },
        fg: {
            hover: 0.25,
            active: 0.5,
        },
        border: 0.5,
    }
    const ruleGenerators = [
        createRuleGen((t) => t.neutralBg, (t) => [`background-color: ${rgb(t.neutralBg)}`]),
        createRuleGen((t) => t.neutralBgActive, (t) => [`background-color: ${rgb(t.neutralBg)}`]),
        createRuleGen((t) => t.neutralBgActive, (t) => [`background-color: ${rgb(mix(t.neutralBg, [255, 255, 255], mx.bg.hover))}`], (s) => `${s}:hover`),
        createRuleGen((t) => t.neutralBgActive, (t) => [`background-color: ${rgb(mix(t.neutralBg, [255, 255, 255], mx.bg.active))}`], (s) => `${s}:active, ${s}:focus`),
        createRuleGen((t) => t.neutralText, (t) => [`color: ${rgb(t.neutralText)}`]),
        createRuleGen((t) => t.neutralTextActive, (t) => [`color: ${rgb(t.neutralText)}`]),
        createRuleGen((t) => t.neutralTextActive, (t) => [`color: ${rgb(mix(t.neutralText, [255, 255, 255], mx.fg.hover))}`], (s) => `${s}:hover`),
        createRuleGen((t) => t.neutralTextActive, (t) => [`color: ${rgb(mix(t.neutralText, [255, 255, 255], mx.fg.active))}`], (s) => `${s}:active, ${s}:focus`),
        createRuleGen((t) => t.neutralBorder, (t) => [`border-color: ${rgb(mix(t.neutralBg, t.neutralText, mx.border))}`]),
        createRuleGen((t) => t.redBg, (t) => [`background-color: ${rgb(t.redBg)}`]),
        createRuleGen((t) => t.redBgActive, (t) => [`background-color: ${rgb(t.redBg)}`]),
        createRuleGen((t) => t.redBgActive, (t) => [`background-color: ${rgb(mix(t.redBg, [255, 0, 64], mx.bg.hover))}`], (s) => `${s}:hover`),
        createRuleGen((t) => t.redBgActive, (t) => [`background-color: ${rgb(mix(t.redBg, [255, 0, 64], mx.bg.active))}`], (s) => `${s}:active, ${s}:focus`),
        createRuleGen((t) => t.redText, (t) => [`color: ${rgb(t.redText)}`]),
        createRuleGen((t) => t.redTextActive, (t) => [`color: ${rgb(t.redText)}`]),
        createRuleGen((t) => t.redTextActive, (t) => [`color: ${rgb(mix(t.redText, [255, 255, 0], mx.fg.hover))}`], (s) => `${s}:hover`),
        createRuleGen((t) => t.redTextActive, (t) => [`color: ${rgb(mix(t.redText, [255, 255, 0], mx.fg.active))}`], (s) => `${s}:active, ${s}:focus`),
        createRuleGen((t) => t.redBorder, (t) => [`border-color: ${rgb(mix(t.redBg, t.redText, mx.border))}`]),
        createRuleGen((t) => t.greenBg, (t) => [`background-color: ${rgb(t.greenBg)}`]),
        createRuleGen((t) => t.greenBgActive, (t) => [`background-color: ${rgb(t.greenBg)}`]),
        createRuleGen((t) => t.greenBgActive, (t) => [`background-color: ${rgb(mix(t.greenBg, [128, 255, 182], mx.bg.hover))}`], (s) => `${s}:hover`),
        createRuleGen((t) => t.greenBgActive, (t) => [`background-color: ${rgb(mix(t.greenBg, [128, 255, 182], mx.bg.active))}`], (s) => `${s}:active, ${s}:focus`),
        createRuleGen((t) => t.greenText, (t) => [`color: ${rgb(t.greenText)}`]),
        createRuleGen((t) => t.greenTextActive, (t) => [`color: ${rgb(t.greenText)}`]),
        createRuleGen((t) => t.greenTextActive, (t) => [`color: ${rgb(mix(t.greenText, [182, 255, 224], mx.fg.hover))}`], (s) => `${s}:hover`),
        createRuleGen((t) => t.greenTextActive, (t) => [`color: ${rgb(mix(t.greenText, [182, 255, 224], mx.fg.active))}`], (s) => `${s}:active, ${s}:focus`),
        createRuleGen((t) => t.greenBorder, (t) => [`border-color: ${rgb(mix(t.greenBg, t.greenText, mx.border))}`]),
        createRuleGen((t) => t.blueBg, (t) => [`background-color: ${rgb(t.blueBg)}`]),
        createRuleGen((t) => t.blueBgActive, (t) => [`background-color: ${rgb(t.blueBg)}`]),
        createRuleGen((t) => t.blueBgActive, (t) => [`background-color: ${rgb(mix(t.blueBg, [0, 128, 255], mx.bg.hover))}`], (s) => `${s}:hover`),
        createRuleGen((t) => t.blueBgActive, (t) => [`background-color: ${rgb(mix(t.blueBg, [0, 128, 255], mx.bg.active))}`], (s) => `${s}:active, ${s}:focus`),
        createRuleGen((t) => t.blueText, (t) => [`color: ${rgb(t.blueText)}`]),
        createRuleGen((t) => t.blueTextActive, (t) => [`color: ${rgb(t.blueText)}`]),
        createRuleGen((t) => t.blueTextActive, (t) => [`color: ${rgb(mix(t.blueText, [182, 224, 255], mx.fg.hover))}`], (s) => `${s}:hover`),
        createRuleGen((t) => t.blueTextActive, (t) => [`color: ${rgb(mix(t.blueText, [182, 224, 255], mx.fg.active))}`], (s) => `${s}:active, ${s}:focus`),
        createRuleGen((t) => t.blueBorder, (t) => [`border-color: ${rgb(mix(t.blueBg, t.blueText, mx.border))}`]),
        createRuleGen((t) => t.fadeBg, (t) => [`background-color: ${rgb(t.fadeBg)}`]),
        createRuleGen((t) => t.fadeText, (t) => [`color: ${rgb(t.fadeText)}`]),
        createRuleGen((t) => t.transparentBg, () => ['background-color: transparent']),
        createRuleGen((t) => t.noImage, () => ['background-image: none']),
        createRuleGen((t) => t.invert, () => ['filter: invert(100%) hue-rotate(180deg)']),
    ]
    const staticThemeCommands = [
        'NO COMMON',
        'NEUTRAL BG',
        'NEUTRAL BG ACTIVE',
        'NEUTRAL TEXT',
        'NEUTRAL TEXT ACTIVE',
        'NEUTRAL BORDER',
        'RED BG',
        'RED BG ACTIVE',
        'RED TEXT',
        'RED TEXT ACTIVE',
        'RED BORDER',
        'GREEN BG',
        'GREEN BG ACTIVE',
        'GREEN TEXT',
        'GREEN TEXT ACTIVE',
        'GREEN BORDER',
        'BLUE BG',
        'BLUE BG ACTIVE',
        'BLUE TEXT',
        'BLUE TEXT ACTIVE',
        'BLUE BORDER',
        'FADE BG',
        'FADE TEXT',
        'TRANSPARENT BG',
        'NO IMAGE',
        'INVERT',
    ]
    function upperCaseToCamelCase(text) {
        return text
            .split(' ')
            .map((word, i) => {
                return (i === 0
                    ? word.toLowerCase()
                    : (word.charAt(0).toUpperCase() + word.substr(1).toLowerCase()))
            })
            .join('')
    }
    function parseStaticThemes($themes) {
        return parseSitesFixesConfig($themes, {
            commands: staticThemeCommands,
            getCommandPropName: upperCaseToCamelCase,
            parseCommandValue: (command, value) => {
                if (command === 'NO COMMON') {
                    return true
                }
                return parseArray(value)
            }
        })
    }
    function camelCaseToUpperCase(text) {
        return text.replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase()
    }
    function formatStaticThemes(staticThemes) {
        const themes = staticThemes.slice().sort((a, b) => compareURLPatterns(a.url[0], b.url[0]))
        return formatSitesFixesConfig(themes, {
            props: staticThemeCommands.map(upperCaseToCamelCase),
            getPropCommandName: camelCaseToUpperCase,
            formatPropValue: (prop, value) => {
                if (prop === 'noCommon') {
                    return ''
                }
                return formatArray(value).trim()
            },
            shouldIgnoreProp: (prop, value) => {
                if (prop === 'noCommon') {
                    return !value
                }
                return !(Array.isArray(value) && value.length > 0)
            }
        })
    }
    function getCommonTheme(themes) {
        return themes[0]
    }
    function getThemeFor(url, themes) {
        const sortedBySpecificity = themes
            .slice(1)
            .map((theme) => {
                return {
                    specificity: isURLInList(url, theme.url) ? theme.url[0].length : 0,
                    theme
                }
            })
            .filter(({ specificity }) => specificity > 0)
            .sort((a, b) => b.specificity - a.specificity)
        if (sortedBySpecificity.length === 0) {
            return null
        }
        return sortedBySpecificity[0].theme
    }

    const CONFIG_URLs = {
        darkSites: {
            remote: '',
            local: '../config/dark-sites.config',
        },
        dynamicThemeFixes: {
            remote: '',
            local: '../config/dynamic-theme-fixes.config',
        },
        inversionFixes: {
            remote: '',
            local: '../config/inversion-fixes.config',
        },
        staticThemes: {
            remote: '',
            local: '../config/static-themes.config',
        },
    }
    const REMOTE_TIMEOUT_MS = getDuration({ seconds: 10 })
    class ConfigManager {
        constructor() {
            this.raw = {
                darkSites: null,
                dynamicThemeFixes: null,
                inversionFixes: null,
                staticThemes: null,
            }
            this.overrides = {
                darkSites: null,
                dynamicThemeFixes: null,
                inversionFixes: null,
                staticThemes: null,
            }
        }
        async loadConfig({ name, local, localURL, remoteURL, success, }) {
            let $config
            const loadLocal = async () => await readText({ url: localURL })
            if (local) {
                $config = await loadLocal()
            }
            else {
                try {
                    $config = await readText({
                        url: `${remoteURL}?nocache=${Date.now()}`,
                        timeout: REMOTE_TIMEOUT_MS
                    })
                }
                catch (err) {
                    console.error(`${name} remote load error`, err)
                    $config = await loadLocal()
                }
            }
            success($config)
        }
        async loadDarkSites({ local }) {
            await this.loadConfig({
                name: 'Dark Sites',
                local,
                localURL: CONFIG_URLs.darkSites.local,
                remoteURL: CONFIG_URLs.darkSites.remote,
                success: ($sites) => {
                    this.raw.darkSites = $sites
                    this.handleDarkSites()
                },
            })
        }
        async loadDynamicThemeFixes({ local }) {
            await this.loadConfig({
                name: 'Dynamic Theme Fixes',
                local,
                localURL: CONFIG_URLs.dynamicThemeFixes.local,
                remoteURL: CONFIG_URLs.dynamicThemeFixes.remote,
                success: ($fixes) => {
                    this.raw.dynamicThemeFixes = $fixes
                    this.handleDynamicThemeFixes()
                },
            })
        }
        async loadInversionFixes({ local }) {
            await this.loadConfig({
                name: 'Inversion Fixes',
                local,
                localURL: CONFIG_URLs.inversionFixes.local,
                remoteURL: CONFIG_URLs.inversionFixes.remote,
                success: ($fixes) => {
                    this.raw.inversionFixes = $fixes
                    this.handleInversionFixes()
                },
            })
        }
        async loadStaticThemes({ local }) {
            await this.loadConfig({
                name: 'Static Themes',
                local,
                localURL: CONFIG_URLs.staticThemes.local,
                remoteURL: CONFIG_URLs.staticThemes.remote,
                success: ($themes) => {
                    this.raw.staticThemes = $themes
                    this.handleStaticThemes()
                },
            })
        }
        async load(config) {
            await Promise.all([
                this.loadDarkSites(config),
                this.loadDynamicThemeFixes(config),
                this.loadInversionFixes(config),
                this.loadStaticThemes(config),
            ]).catch((err) => console.error('Fatality', err))
        }
        handleDarkSites() {
            const $sites = this.overrides.darkSites || this.raw.darkSites
            this.DARK_SITES = parseArray($sites)
        }
        handleDynamicThemeFixes() {
            const $fixes = this.overrides.dynamicThemeFixes || this.raw.dynamicThemeFixes
            this.DYNAMIC_THEME_FIXES = parseDynamicThemeFixes($fixes)
        }
        handleInversionFixes() {
            const $fixes = this.overrides.inversionFixes || this.raw.inversionFixes
            this.INVERSION_FIXES = parseInversionFixes($fixes)
        }
        handleStaticThemes() {
            const $themes = this.overrides.staticThemes || this.raw.staticThemes
            this.STATIC_THEMES = parseStaticThemes($themes)
        }
    }

    class LocalStorageWrapper {
        get(key) {
            try {
                return localStorage.getItem(key)
            }
            catch (err) {
                console.error(err)
                return null
            }
        }
        set(key, value) {
            try {
                localStorage.setItem(key, value)
            }
            catch (err) {
                console.error(err)
                return
            }
        }
        remove(key) {
            try {
                localStorage.removeItem(key)
            }
            catch (err) {
                console.error(err)
                return
            }
        }
        has(key) {
            try {
                return localStorage.getItem(key) != null
            }
            catch (err) {
                console.error(err)
                return false
            }
        }
    }
    class TempStorage {
        constructor() {
            this.map = new Map()
        }
        get(key) {
            return this.map.get(key)
        }
        set(key, value) {
            this.map.set(key, value)
        }
        remove(key) {
            this.map.delete(key)
        }
        has(key) {
            return this.map.has(key)
        }
    }
    class DevTools {
        constructor(config, onChange) {
            this.store = (typeof localStorage !== 'undefined' && localStorage != null ?
                new LocalStorageWrapper() :
                new TempStorage())
            this.config = config
            this.config.overrides.dynamicThemeFixes = this.getSavedDynamicThemeFixes() || null
            this.config.overrides.inversionFixes = this.getSavedInversionFixes() || null
            this.config.overrides.staticThemes = this.getSavedStaticThemes() || null
            this.onChange = onChange
        }
        getSavedDynamicThemeFixes() {
            return this.store.get(DevTools.KEY_DYNAMIC) || null
        }
        saveDynamicThemeFixes(text) {
            this.store.set(DevTools.KEY_DYNAMIC, text)
        }
        hasCustomDynamicThemeFixes() {
            return this.store.has(DevTools.KEY_DYNAMIC)
        }
        getDynamicThemeFixesText() {
            const $fixes = this.getSavedDynamicThemeFixes()
            const fixes = $fixes ? parseDynamicThemeFixes($fixes) : this.config.DYNAMIC_THEME_FIXES
            return formatDynamicThemeFixes(fixes)
        }
        resetDynamicThemeFixes() {
            this.store.remove(DevTools.KEY_DYNAMIC)
            this.config.overrides.dynamicThemeFixes = null
            this.config.handleDynamicThemeFixes()
            this.onChange()
        }
        applyDynamicThemeFixes(text) {
            try {
                const formatted = formatDynamicThemeFixes(parseDynamicThemeFixes(text))
                this.config.overrides.dynamicThemeFixes = formatted
                this.config.handleDynamicThemeFixes()
                this.saveDynamicThemeFixes(formatted)
                this.onChange()
                return null
            }
            catch (err) {
                return err
            }
        }
        getSavedInversionFixes() {
            return this.store.get(DevTools.KEY_FILTER) || null
        }
        saveInversionFixes(text) {
            this.store.set(DevTools.KEY_FILTER, text)
        }
        hasCustomFilterFixes() {
            return this.store.has(DevTools.KEY_FILTER)
        }
        getInversionFixesText() {
            const $fixes = this.getSavedInversionFixes()
            const fixes = $fixes ? parseInversionFixes($fixes) : this.config.INVERSION_FIXES
            return formatInversionFixes(fixes)
        }
        resetInversionFixes() {
            this.store.remove(DevTools.KEY_FILTER)
            this.config.overrides.inversionFixes = null
            this.config.handleInversionFixes()
            this.onChange()
        }
        applyInversionFixes(text) {
            try {
                const formatted = formatInversionFixes(parseInversionFixes(text))
                this.config.overrides.inversionFixes = formatted
                this.config.handleInversionFixes()
                this.saveInversionFixes(formatted)
                this.onChange()
                return null
            }
            catch (err) {
                return err
            }
        }
        getSavedStaticThemes() {
            return this.store.get(DevTools.KEY_STATIC) || null
        }
        saveStaticThemes(text) {
            this.store.set(DevTools.KEY_STATIC, text)
        }
        hasCustomStaticFixes() {
            return this.store.has(DevTools.KEY_STATIC)
        }
        getStaticThemesText() {
            const $themes = this.getSavedStaticThemes()
            const themes = $themes ? parseStaticThemes($themes) : this.config.STATIC_THEMES
            return formatStaticThemes(themes)
        }
        resetStaticThemes() {
            this.store.remove(DevTools.KEY_STATIC)
            this.config.overrides.staticThemes = null
            this.config.handleStaticThemes()
            this.onChange()
        }
        applyStaticThemes(text) {
            try {
                const formatted = formatStaticThemes(parseStaticThemes(text))
                this.config.overrides.staticThemes = formatted
                this.config.handleStaticThemes()
                this.saveStaticThemes(formatted)
                this.onChange()
                return null
            }
            catch (err) {
                return err
            }
        }
    }
    DevTools.KEY_DYNAMIC = 'dev_dynamic_theme_fixes'
    DevTools.KEY_FILTER = 'dev_inversion_fixes'
    DevTools.KEY_STATIC = 'dev_static_themes'

    const ICON_PATHS = {
        active_19: '../icons/icon_19.png',
        active_38: '../icons/icon_38.png',
        inactive_19: '../icons/icon_19.png',
        inactive_38: '../icons/icon_38.png',
    }
    class IconManager {
        constructor() {
            this.setActive()
        }
        setActive() {
            if (!chrome.browserAction.setIcon) {
                return
            }
            chrome.browserAction.setIcon({
                path: {
                    '19': ICON_PATHS.active_19,
                    '38': ICON_PATHS.active_38
                }
            })
        }
        setInactive() {
            if (!chrome.browserAction.setIcon) {
                // Fix for Firefox Android
                return
            }
            chrome.browserAction.setIcon({
                path: {
                    '19': ICON_PATHS.inactive_19,
                    '38': ICON_PATHS.inactive_38
                }
            })
        }
        showImportantBadge() {
            chrome.browserAction.setBadgeBackgroundColor({ color: '#e96c4c' })
            chrome.browserAction.setBadgeText({ text: '!' })
        }
        showUnreadReleaseNotesBadge(count) {
            chrome.browserAction.setBadgeBackgroundColor({ color: '#e96c4c' })
            chrome.browserAction.setBadgeText({ text: String(count) })
        }
        hideBadge() {
            chrome.browserAction.setBadgeText({ text: '' })
        }
    }

    class Messenger {
        constructor(adapter) {
            this.reporters = new Set()
            this.adapter = adapter
            chrome.runtime.onConnect.addListener((port) => {
                if (port.name === 'ui') {
                    port.onMessage.addListener((message) => this.onUIMessage(port, message))
                    this.adapter.onPopupOpen()
                }
            })
        }
        async onUIMessage(port, { type, id, data }) {
            switch (type) {
                case 'get-data': {
                    const data = await this.adapter.collect()
                    port.postMessage({ id, data })
                    break
                }
                case 'get-active-tab-info': {
                    const data = await this.adapter.getActiveTabInfo()
                    port.postMessage({ id, data })
                    break
                }
                case 'subscribe-to-changes': {
                    const report = (data) => port.postMessage({ id, data })
                    this.reporters.add(report)
                    port.onDisconnect.addListener(() => this.reporters.delete(report))
                    break
                }
                case 'change-settings': {
                    this.adapter.changeSettings(data)
                    break
                }
                case 'set-theme': {
                    this.adapter.setTheme(data)
                    break
                }
                case 'set-shortcut': {
                    this.adapter.setShortcut(data)
                    break
                }
                case 'toggle-url': {
                    this.adapter.toggleURL(data)
                    break
                }
                case 'mark-news-as-read': {
                    this.adapter.markNewsAsRead(data)
                    break
                }
                case 'load-config': {
                    await this.adapter.loadConfig(data)
                }
                case 'apply-dev-dynamic-theme-fixes': {
                    const error = this.adapter.applyDevDynamicThemeFixes(data)
                    port.postMessage({ id, error: (error ? error.message : null) })
                    break
                }
                case 'reset-dev-dynamic-theme-fixes': {
                    this.adapter.resetDevDynamicThemeFixes()
                    break
                }
                case 'apply-dev-inversion-fixes': {
                    const error = this.adapter.applyDevInversionFixes(data)
                    port.postMessage({ id, error: (error ? error.message : null) })
                    break
                }
                case 'reset-dev-inversion-fixes': {
                    this.adapter.resetDevInversionFixes()
                    break
                }
                case 'apply-dev-static-themes': {
                    const error = this.adapter.applyDevStaticThemes(data)
                    port.postMessage({ id, error: error ? error.message : null })
                    break
                }
                case 'reset-dev-static-themes': {
                    this.adapter.resetDevStaticThemes()
                    break
                }
            }
        }
        reportChanges(data) {
            this.reporters.forEach((report) => report(data))
        }
    }

    function getUILanguage() {
        const code = chrome.i18n.getUILanguage()
        if (code.endsWith('-mac')) {
            return code.substring(0, code.length - 4)
        }
        return code
    }

    function canInjectScript(url) {
        if (isFirefox()) {
            return (url
                && !url.startsWith('about:')
                && !url.startsWith('moz')
                && !url.startsWith('view-source:')
                && !url.startsWith('https://addons.mozilla.org')
                && !isPDF(url))
        }
        if (isEdge()) {
            return (url
                && !url.startsWith('chrome')
                && !url.startsWith('edge')
                && !url.startsWith('https://chrome.google.com/webstore')
                && !url.startsWith('https://microsoftedge.microsoft.com/addons'))
        }
        return (url
            && !url.startsWith('chrome')
            && !url.startsWith('https://chrome.google.com/webstore'))
    }
    function readSyncStorage(defaults) {
        return new Promise((resolve) => {
            chrome.storage.sync.get(defaults, (sync) => {
                resolve(sync)
            })
        })
    }
    function readLocalStorage(defaults) {
        return new Promise((resolve) => {
            chrome.storage.local.get(defaults, (local) => {
                resolve(local)
            })
        })
    }
    function writeSyncStorage(values) {
        return new Promise((resolve, reject) => {
            chrome.storage.sync.set(values, () => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError)
                    return
                }
                resolve()
            })
        })
    }
    function writeLocalStorage(values) {
        return new Promise((resolve) => {
            chrome.storage.local.set(values, () => {
                resolve()
            })
        })
    }
    function getFontList() {
        return new Promise((resolve) => {
            if (!chrome.fontSettings) {
                resolve([
                    'serif',
                    'sans-serif',
                    'monospace',
                    'cursive',
                    'fantasy',
                    'system-ui'
                ])
                return
            }
            chrome.fontSettings.getFontList((list) => {
                const fonts = list.map((f) => f.fontId)
                resolve(fonts)
            })
        })
    }
    function getCommands() {
        return new Promise((resolve) => {
            if (!chrome.commands) {
                resolve([])
                return
            }
            chrome.commands.getAll((commands) => {
                if (commands) {
                    resolve(commands)
                }
                else {
                    resolve([])
                }
            })
        })
    }
    function setShortcut(command, shortcut) {
        if (typeof browser !== 'undefined' && browser.commands && browser.commands.update) {
            browser.commands.update({ name: command, shortcut })
        }
    }

    function queryTabs(query) {
        return new Promise((resolve) => {
            chrome.tabs.query(query, (tabs) => resolve(tabs))
        })
    }
    class TabManager {
        constructor({ getConnectionMessage, onColorSchemeChange }) {
            this.ports = new Map()
            chrome.runtime.onConnect.addListener((port) => {
                if (port.name === 'tab') {
                    const reply = (options) => {
                        const message = getConnectionMessage(options)
                        if (message instanceof Promise) {
                            message.then((asyncMessage) => asyncMessage && port.postMessage(asyncMessage))
                        }
                        else if (message) {
                            port.postMessage(message)
                        }
                    }
                    const isPanel = port.sender.tab == null
                    if (isPanel) {
                        reply({ url: port.sender.url, frameURL: null, unsupportedSender: true })
                        return
                    }
                    const tabId = port.sender.tab.id
                    const { frameId } = port.sender
                    const senderURL = port.sender.url
                    const tabURL = port.sender.tab.url
                    let framesPorts
                    if (this.ports.has(tabId)) {
                        framesPorts = this.ports.get(tabId)
                    }
                    else {
                        framesPorts = new Map()
                        this.ports.set(tabId, framesPorts)
                    }
                    framesPorts.set(frameId, { url: senderURL, port })
                    port.onDisconnect.addListener(() => {
                        framesPorts.delete(frameId)
                        if (framesPorts.size === 0) {
                            this.ports.delete(tabId)
                        }
                    })
                    reply({
                        url: tabURL,
                        frameURL: frameId === 0 ? null : senderURL,
                    })
                }
            })
            const fileLoader = createFileLoader()
            chrome.runtime.onMessage.addListener(async ({ type, data, id }, sender) => {
                if (type === 'fetch') {
                    const { url, responseType, mimeType } = data
                    const sendResponse = (response) => chrome.tabs.sendMessage(sender.tab.id, { type: 'fetch-response', id, ...response })
                    try {
                        const response = await fileLoader.get({ url, responseType, mimeType })
                        sendResponse({ data: response })
                    }
                    catch (err) {
                        sendResponse({ error: err && err.message ? err.message : err })
                    }
                }
                if (type === 'color-scheme-change') {
                    onColorSchemeChange(data)
                }
                if (type === 'save-file') {
                    const { content, name } = data
                    const a = document.createElement('a')
                    a.href = URL.createObjectURL(new Blob([content]))
                    a.download = name
                    a.click()
                }
                if (type === 'request-export-css') {
                    const activeTab = await this.getActiveTab()
                    this.ports
                        .get(activeTab.id)
                        .get(0).port
                        .postMessage({ type: 'export-css' })
                }
            })
        }
        async updateContentScript(options) {
            (await queryTabs({}))
                .filter((tab) => options.runOnProtectedPages || canInjectScript(tab.url))
                .filter((tab) => !this.ports.has(tab.id))
                .forEach((tab) => !tab.discarded && chrome.tabs.executeScript(tab.id, {
                    runAt: 'document_start',
                    file: '/inject/index.js',
                    allFrames: true,
                    matchAboutBlank: true,
                }))
        }
        async sendMessage(getMessage) {
            (await queryTabs({}))
                .filter((tab) => this.ports.has(tab.id))
                .forEach((tab) => {
                    const framesPorts = this.ports.get(tab.id)
                    framesPorts.forEach(({ url, port }, frameId) => {
                        const message = getMessage(tab.url, frameId === 0 ? null : url)
                        if (tab.active && frameId === 0) {
                            port.postMessage(message)
                        }
                        else {
                            setTimeout(() => port.postMessage(message))
                        }
                    })
                })
        }
        async getActiveTabURL() {
            return (await this.getActiveTab()).url
        }
        async getActiveTab() {
            let tab = (await queryTabs({
                active: true,
                lastFocusedWindow: true
            }))[0]
            const isExtensionPage = (url) => url.startsWith('chrome-extension:') || url.startsWith('moz-extension:')
            if (!tab || isExtensionPage(tab.url)) {
                const tabs = (await queryTabs({ active: true }))
                tab = tabs.find((t) => !isExtensionPage(t.url)) || tab
            }
            return tab
        }
    }

    var ThemeEngines = {
        cssFilter: 'cssFilter',
        svgFilter: 'svgFilter',
        staticTheme: 'staticTheme',
        dynamicTheme: 'dynamicTheme',
    }

    const DEFAULT_COLORS = {
        darkScheme: {
            background: '#181a1b',
            text: '#e8e6e3',
        },
        lightScheme: {
            background: '#dcdad7',
            text: '#181a1b',
        },
    }
    const DEFAULT_THEME = {
        mode: 1,
        brightness: 100,
        contrast: 100,
        grayscale: 0,
        sepia: 0,
        useFont: false,
        fontFamily: isMacOS() ? 'Helvetica Neue' : isWindows() ? 'Segoe UI' : 'Open Sans',
        textStroke: 0,
        engine: ThemeEngines.dynamicTheme,
        stylesheet: '',
        darkSchemeBackgroundColor: DEFAULT_COLORS.darkScheme.background,
        darkSchemeTextColor: DEFAULT_COLORS.darkScheme.text,
        lightSchemeBackgroundColor: DEFAULT_COLORS.lightScheme.background,
        lightSchemeTextColor: DEFAULT_COLORS.lightScheme.text,
        scrollbarColor: isMacOS() ? '' : 'auto',
        selectionColor: 'auto',
        styleSystemControls: true,
    }
    const DEFAULT_SETTINGS = {
        enabled: true,
        theme: DEFAULT_THEME,
        presets: [],
        customThemes: [],
        siteList: [],
        siteListEnabled: [],
        applyToListedOnly: false,
        changeBrowserTheme: false,
        notifyOfNews: false,
        syncSettings: true,
        syncSitesFixes: false,
        automation: '',
        time: {
            activation: '18:00',
            deactivation: '9:00',
        },
        location: {
            latitude: null,
            longitude: null,
        },
        previewNewDesign: false,
        enableForPDF: true,
        enableForProtectedPages: false,
    }

    function debounce(delay, fn) {
        let timeoutId = null
        return ((...args) => {
            if (timeoutId) {
                clearTimeout(timeoutId)
            }
            timeoutId = setTimeout(() => {
                timeoutId = null
                fn(...args)
            }, delay)
        })
    }

    const SAVE_TIMEOUT = 1000
    class UserStorage {
        constructor() {
            this.saveSettingsIntoStorage = debounce(SAVE_TIMEOUT, async () => {
                const settings = this.settings
                if (settings.syncSettings) {
                    try {
                        await writeSyncStorage(settings)
                    }
                    catch (err) {
                        console.warn('Settings synchronization was disabled due to error:', chrome.runtime.lastError)
                        this.set({ syncSettings: false })
                        await this.saveSyncSetting(false)
                        await writeLocalStorage(settings)
                    }
                }
                else {
                    await writeLocalStorage(settings)
                }
            })
            this.settings = null
        }
        async loadSettings() {
            this.settings = await this.loadSettingsFromStorage()
        }
        fillDefaults(settings) {
            settings.theme = { ...DEFAULT_THEME, ...settings.theme }
            settings.time = { ...DEFAULT_SETTINGS.time, ...settings.time }
            settings.presets.forEach((preset) => {
                preset.theme = { ...DEFAULT_THEME, ...preset.theme }
            })
            settings.customThemes.forEach((site) => {
                site.theme = { ...DEFAULT_THEME, ...site.theme }
            })
        }
        async loadSettingsFromStorage() {
            const local = await readLocalStorage(DEFAULT_SETTINGS)
            if (local.syncSettings == null) {
                local.syncSettings = DEFAULT_SETTINGS.syncSettings
            }
            if (!local.syncSettings) {
                this.fillDefaults(local)
                return local
            }
            const $sync = await readSyncStorage(DEFAULT_SETTINGS)
            if (!$sync) {
                console.warn('Sync settings are missing')
                local.syncSettings = false
                this.set({ syncSettings: false })
                this.saveSyncSetting(false)
                return local
            }
            const sync = await readSyncStorage(DEFAULT_SETTINGS)
            this.fillDefaults(sync)
            return sync
        }
        async saveSettings() {
            await this.saveSettingsIntoStorage()
        }
        async saveSyncSetting(sync) {
            const obj = { syncSettings: sync }
            await writeLocalStorage(obj)
            try {
                await writeSyncStorage(obj)
            }
            catch (err) {
                console.warn('Settings synchronization was disabled due to error:', chrome.runtime.lastError)
                this.set({ syncSettings: false })
            }
        }
        set($settings) {
            if ($settings.siteList) {
                if (!Array.isArray($settings.siteList)) {
                    const list = []
                    for (const key in $settings.siteList) {
                        const index = Number(key)
                        if (!isNaN(index)) {
                            list[index] = $settings.siteList[key]
                        }
                    }
                    $settings.siteList = list
                }
                const siteList = $settings.siteList.filter((pattern) => {
                    let isOK = false
                    try {
                        isURLMatched('https://google.com/', pattern)
                        isURLMatched('[::1]:1337', pattern)
                        isOK = true
                    }
                    catch (err) {
                        console.warn(`Pattern "${pattern}" excluded`)
                    }
                    return isOK && pattern !== '/'
                })
                $settings = { ...$settings, siteList }
            }
            this.settings = { ...this.settings, ...$settings }
        }
    }

    function hslToRGB({ h, s, l, a = 1 }) {
        if (s === 0) {
            const [r, b, g] = [l, l, l].map((x) => Math.round(x * 255))
            return { r, g, b, a }
        }
        const c = (1 - Math.abs(2 * l - 1)) * s
        const x = c * (1 - Math.abs((h / 60) % 2 - 1))
        const m = l - c / 2
        const [r, g, b] = (h < 60 ? [c, x, 0] :
            h < 120 ? [x, c, 0] :
                h < 180 ? [0, c, x] :
                    h < 240 ? [0, x, c] :
                        h < 300 ? [x, 0, c] :
                            [c, 0, x]).map((n) => Math.round((n + m) * 255))
        return { r, g, b, a }
    }
    function rgbToHSL({ r: r255, g: g255, b: b255, a = 1 }) {
        const r = r255 / 255
        const g = g255 / 255
        const b = b255 / 255
        const max = Math.max(r, g, b)
        const min = Math.min(r, g, b)
        const c = max - min
        const l = (max + min) / 2
        if (c === 0) {
            return { h: 0, s: 0, l, a }
        }
        let h = (max === r ? (((g - b) / c) % 6) :
            max === g ? ((b - r) / c + 2) :
                ((r - g) / c + 4)) * 60
        if (h < 0) {
            h += 360
        }
        const s = c / (1 - Math.abs(2 * l - 1))
        return { h, s, l, a }
    }
    function toFixed(n, digits = 0) {
        const fixed = n.toFixed(digits)
        if (digits === 0) {
            return fixed
        }
        const dot = fixed.indexOf('.')
        if (dot >= 0) {
            const zerosMatch = fixed.match(/0+$/)
            if (zerosMatch) {
                if (zerosMatch.index === dot + 1) {
                    return fixed.substring(0, dot)
                }
                return fixed.substring(0, zerosMatch.index)
            }
        }
        return fixed
    }
    function rgbToString(rgb) {
        const { r, g, b, a } = rgb
        if (a != null && a < 1) {
            return `rgba(${toFixed(r)}, ${toFixed(g)}, ${toFixed(b)}, ${toFixed(a, 2)})`
        }
        return `rgb(${toFixed(r)}, ${toFixed(g)}, ${toFixed(b)})`
    }
    function rgbToHexString({ r, g, b, a }) {
        return `#${(a != null && a < 1 ? [r, g, b, Math.round(a * 255)] : [r, g, b]).map((x) => {
            return `${x < 16 ? '0' : ''}${x.toString(16)}`
        }).join('')}`
    }
    const rgbMatch = /^rgba?\([^\(\)]+\)$/
    const hslMatch = /^hsla?\([^\(\)]+\)$/
    const hexMatch = /^#[0-9a-f]+$/i
    function parse($color) {
        const c = $color.trim().toLowerCase()
        if (c.match(rgbMatch)) {
            return parseRGB(c)
        }
        if (c.match(hslMatch)) {
            return parseHSL(c)
        }
        if (c.match(hexMatch)) {
            return parseHex(c)
        }
        if (knownColors.has(c)) {
            return getColorByName(c)
        }
        if (systemColors.has(c)) {
            return getSystemColor(c)
        }
        if ($color === 'transparent') {
            return { r: 0, g: 0, b: 0, a: 0 }
        }
        throw new Error(`Unable to parse ${$color}`)
    }
    function getNumbersFromString(str, splitter, range, units) {
        const raw = str.split(splitter).filter((x) => x)
        const unitsList = Object.entries(units)
        const numbers = raw.map((r) => r.trim()).map((r, i) => {
            let n
            const unit = unitsList.find(([u]) => r.endsWith(u))
            if (unit) {
                n = parseFloat(r.substring(0, r.length - unit[0].length)) / unit[1] * range[i]
            }
            else {
                n = parseFloat(r)
            }
            if (range[i] > 1) {
                return Math.round(n)
            }
            return n
        })
        return numbers
    }
    const rgbSplitter = /rgba?|\(|\)|\/|,|\s/ig
    const rgbRange = [255, 255, 255, 1]
    const rgbUnits = { '%': 100 }
    function parseRGB($rgb) {
        const [r, g, b, a = 1] = getNumbersFromString($rgb, rgbSplitter, rgbRange, rgbUnits)
        return { r, g, b, a }
    }
    const hslSplitter = /hsla?|\(|\)|\/|,|\s/ig
    const hslRange = [360, 1, 1, 1]
    const hslUnits = { '%': 100, 'deg': 360, 'rad': 2 * Math.PI, 'turn': 1 }
    function parseHSL($hsl) {
        const [h, s, l, a = 1] = getNumbersFromString($hsl, hslSplitter, hslRange, hslUnits)
        return hslToRGB({ h, s, l, a })
    }
    function parseHex($hex) {
        const h = $hex.substring(1)
        switch (h.length) {
            case 3:
            case 4: {
                const [r, g, b] = [0, 1, 2].map((i) => parseInt(`${h[i]}${h[i]}`, 16))
                const a = h.length === 3 ? 1 : (parseInt(`${h[3]}${h[3]}`, 16) / 255)
                return { r, g, b, a }
            }
            case 6:
            case 8: {
                const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.substring(i, i + 2), 16))
                const a = h.length === 6 ? 1 : (parseInt(h.substring(6, 8), 16) / 255)
                return { r, g, b, a }
            }
        }
        throw new Error(`Unable to parse ${$hex}`)
    }
    function getColorByName($color) {
        const n = knownColors.get($color)
        return {
            r: (n >> 16) & 255,
            g: (n >> 8) & 255,
            b: (n >> 0) & 255,
            a: 1
        }
    }
    function getSystemColor($color) {
        const n = systemColors.get($color)
        return {
            r: (n >> 16) & 255,
            g: (n >> 8) & 255,
            b: (n >> 0) & 255,
            a: 1
        }
    }
    const knownColors = new Map(Object.entries({
        aliceblue: 0xf0f8ff,
        antiquewhite: 0xfaebd7,
        aqua: 0x00ffff,
        aquamarine: 0x7fffd4,
        azure: 0xf0ffff,
        beige: 0xf5f5dc,
        bisque: 0xffe4c4,
        black: 0x000000,
        blanchedalmond: 0xffebcd,
        blue: 0x0000ff,
        blueviolet: 0x8a2be2,
        brown: 0xa52a2a,
        burlywood: 0xdeb887,
        cadetblue: 0x5f9ea0,
        chartreuse: 0x7fff00,
        chocolate: 0xd2691e,
        coral: 0xff7f50,
        cornflowerblue: 0x6495ed,
        cornsilk: 0xfff8dc,
        crimson: 0xdc143c,
        cyan: 0x00ffff,
        darkblue: 0x00008b,
        darkcyan: 0x008b8b,
        darkgoldenrod: 0xb8860b,
        darkgray: 0xa9a9a9,
        darkgrey: 0xa9a9a9,
        darkgreen: 0x006400,
        darkkhaki: 0xbdb76b,
        darkmagenta: 0x8b008b,
        darkolivegreen: 0x556b2f,
        darkorange: 0xff8c00,
        darkorchid: 0x9932cc,
        darkred: 0x8b0000,
        darksalmon: 0xe9967a,
        darkseagreen: 0x8fbc8f,
        darkslateblue: 0x483d8b,
        darkslategray: 0x2f4f4f,
        darkslategrey: 0x2f4f4f,
        darkturquoise: 0x00ced1,
        darkviolet: 0x9400d3,
        deeppink: 0xff1493,
        deepskyblue: 0x00bfff,
        dimgray: 0x696969,
        dimgrey: 0x696969,
        dodgerblue: 0x1e90ff,
        firebrick: 0xb22222,
        floralwhite: 0xfffaf0,
        forestgreen: 0x228b22,
        fuchsia: 0xff00ff,
        gainsboro: 0xdcdcdc,
        ghostwhite: 0xf8f8ff,
        gold: 0xffd700,
        goldenrod: 0xdaa520,
        gray: 0x808080,
        grey: 0x808080,
        green: 0x008000,
        greenyellow: 0xadff2f,
        honeydew: 0xf0fff0,
        hotpink: 0xff69b4,
        indianred: 0xcd5c5c,
        indigo: 0x4b0082,
        ivory: 0xfffff0,
        khaki: 0xf0e68c,
        lavender: 0xe6e6fa,
        lavenderblush: 0xfff0f5,
        lawngreen: 0x7cfc00,
        lemonchiffon: 0xfffacd,
        lightblue: 0xadd8e6,
        lightcoral: 0xf08080,
        lightcyan: 0xe0ffff,
        lightgoldenrodyellow: 0xfafad2,
        lightgray: 0xd3d3d3,
        lightgrey: 0xd3d3d3,
        lightgreen: 0x90ee90,
        lightpink: 0xffb6c1,
        lightsalmon: 0xffa07a,
        lightseagreen: 0x20b2aa,
        lightskyblue: 0x87cefa,
        lightslategray: 0x778899,
        lightslategrey: 0x778899,
        lightsteelblue: 0xb0c4de,
        lightyellow: 0xffffe0,
        lime: 0x00ff00,
        limegreen: 0x32cd32,
        linen: 0xfaf0e6,
        magenta: 0xff00ff,
        maroon: 0x800000,
        mediumaquamarine: 0x66cdaa,
        mediumblue: 0x0000cd,
        mediumorchid: 0xba55d3,
        mediumpurple: 0x9370db,
        mediumseagreen: 0x3cb371,
        mediumslateblue: 0x7b68ee,
        mediumspringgreen: 0x00fa9a,
        mediumturquoise: 0x48d1cc,
        mediumvioletred: 0xc71585,
        midnightblue: 0x191970,
        mintcream: 0xf5fffa,
        mistyrose: 0xffe4e1,
        moccasin: 0xffe4b5,
        navajowhite: 0xffdead,
        navy: 0x000080,
        oldlace: 0xfdf5e6,
        olive: 0x808000,
        olivedrab: 0x6b8e23,
        orange: 0xffa500,
        orangered: 0xff4500,
        orchid: 0xda70d6,
        palegoldenrod: 0xeee8aa,
        palegreen: 0x98fb98,
        paleturquoise: 0xafeeee,
        palevioletred: 0xdb7093,
        papayawhip: 0xffefd5,
        peachpuff: 0xffdab9,
        peru: 0xcd853f,
        pink: 0xffc0cb,
        plum: 0xdda0dd,
        powderblue: 0xb0e0e6,
        purple: 0x800080,
        rebeccapurple: 0x663399,
        red: 0xff0000,
        rosybrown: 0xbc8f8f,
        royalblue: 0x4169e1,
        saddlebrown: 0x8b4513,
        salmon: 0xfa8072,
        sandybrown: 0xf4a460,
        seagreen: 0x2e8b57,
        seashell: 0xfff5ee,
        sienna: 0xa0522d,
        silver: 0xc0c0c0,
        skyblue: 0x87ceeb,
        slateblue: 0x6a5acd,
        slategray: 0x708090,
        slategrey: 0x708090,
        snow: 0xfffafa,
        springgreen: 0x00ff7f,
        steelblue: 0x4682b4,
        tan: 0xd2b48c,
        teal: 0x008080,
        thistle: 0xd8bfd8,
        tomato: 0xff6347,
        turquoise: 0x40e0d0,
        violet: 0xee82ee,
        wheat: 0xf5deb3,
        white: 0xffffff,
        whitesmoke: 0xf5f5f5,
        yellow: 0xffff00,
        yellowgreen: 0x9acd32,
    }))
    const systemColors = new Map(Object.entries({
        ActiveBorder: 0x3b99fc,
        ActiveCaption: 0x000000,
        AppWorkspace: 0xaaaaaa,
        Background: 0x6363ce,
        ButtonFace: 0xffffff,
        ButtonHighlight: 0xe9e9e9,
        ButtonShadow: 0x9fa09f,
        ButtonText: 0x000000,
        CaptionText: 0x000000,
        GrayText: 0x7f7f7f,
        Highlight: 0xb2d7ff,
        HighlightText: 0x000000,
        InactiveBorder: 0xffffff,
        InactiveCaption: 0xffffff,
        InactiveCaptionText: 0x000000,
        InfoBackground: 0xfbfcc5,
        InfoText: 0x000000,
        Menu: 0xf6f6f6,
        MenuText: 0xffffff,
        Scrollbar: 0xaaaaaa,
        ThreeDDarkShadow: 0x000000,
        ThreeDFace: 0xc0c0c0,
        ThreeDHighlight: 0xffffff,
        ThreeDLightShadow: 0xffffff,
        ThreeDShadow: 0x000000,
        Window: 0xececec,
        WindowFrame: 0xaaaaaa,
        WindowText: 0x000000,
        '-webkit-focus-ring-color': 0xe59700
    }).map(([key, value]) => [key.toLowerCase(), value]))

    function getBgPole(theme) {
        const isDarkScheme = theme.mode === 1
        const prop = isDarkScheme ? 'darkSchemeBackgroundColor' : 'lightSchemeBackgroundColor'
        return theme[prop]
    }
    function getFgPole(theme) {
        const isDarkScheme = theme.mode === 1
        const prop = isDarkScheme ? 'darkSchemeTextColor' : 'lightSchemeTextColor'
        return theme[prop]
    }
    const colorModificationCache = new Map()
    const colorParseCache = new Map()
    function parseToHSLWithCache(color) {
        if (colorParseCache.has(color)) {
            return colorParseCache.get(color)
        }
        const rgb = parse(color)
        const hsl = rgbToHSL(rgb)
        colorParseCache.set(color, hsl)
        return hsl
    }
    const rgbCacheKeys = ['r', 'g', 'b', 'a']
    const themeCacheKeys = ['mode', 'brightness', 'contrast', 'grayscale', 'sepia', 'darkSchemeBackgroundColor', 'darkSchemeTextColor', 'lightSchemeBackgroundColor', 'lightSchemeTextColor']
    function getCacheId(rgb, theme) {
        return rgbCacheKeys.map((k) => rgb[k])
            .concat(themeCacheKeys.map((k) => theme[k]))
            .join(';')
    }
    function modifyColorWithCache(rgb, theme, modifyHSL, poleColor, anotherPoleColor) {
        let fnCache
        if (colorModificationCache.has(modifyHSL)) {
            fnCache = colorModificationCache.get(modifyHSL)
        }
        else {
            fnCache = new Map()
            colorModificationCache.set(modifyHSL, fnCache)
        }
        const id = getCacheId(rgb, theme)
        if (fnCache.has(id)) {
            return fnCache.get(id)
        }
        const hsl = rgbToHSL(rgb)
        const pole = poleColor == null ? null : parseToHSLWithCache(poleColor)
        const anotherPole = anotherPoleColor == null ? null : parseToHSLWithCache(anotherPoleColor)
        const modified = modifyHSL(hsl, pole, anotherPole)
        const { r, g, b, a } = hslToRGB(modified)
        const matrix = createFilterMatrix(theme)
        const [rf, gf, bf] = applyColorMatrix([r, g, b], matrix)
        const color = (a === 1 ?
            rgbToHexString({ r: rf, g: gf, b: bf }) :
            rgbToString({ r: rf, g: gf, b: bf, a }))
        fnCache.set(id, color)
        return color
    }
    function modifyLightSchemeColor(rgb, theme) {
        const poleBg = getBgPole(theme)
        const poleFg = getFgPole(theme)
        return modifyColorWithCache(rgb, theme, modifyLightModeHSL, poleFg, poleBg)
    }
    function modifyLightModeHSL({ h, s, l, a }, poleFg, poleBg) {
        const isDark = l < 0.5
        let isNeutral
        if (isDark) {
            isNeutral = l < 0.2 || s < 0.12
        }
        else {
            const isBlue = h > 200 && h < 280
            isNeutral = s < 0.24 || (l > 0.8 && isBlue)
        }
        let hx = h
        let sx = l
        if (isNeutral) {
            if (isDark) {
                hx = poleFg.h
                sx = poleFg.s
            }
            else {
                hx = poleBg.h
                sx = poleBg.s
            }
        }
        const lx = scale(l, 0, 1, poleFg.l, poleBg.l)
        return { h: hx, s: sx, l: lx, a }
    }
    const MAX_BG_LIGHTNESS = 0.4
    function modifyBgHSL({ h, s, l, a }, pole) {
        const isDark = l < 0.5
        const isBlue = h > 200 && h < 280
        const isNeutral = s < 0.12 || (l > 0.8 && isBlue)
        if (isDark) {
            const lx = scale(l, 0, 0.5, 0, MAX_BG_LIGHTNESS)
            if (isNeutral) {
                const hx = pole.h
                const sx = pole.s
                return { h: hx, s: sx, l: lx, a }
            }
            return { h, s, l: lx, a }
        }
        const lx = scale(l, 0.5, 1, MAX_BG_LIGHTNESS, pole.l)
        if (isNeutral) {
            const hx = pole.h
            const sx = pole.s
            return { h: hx, s: sx, l: lx, a }
        }
        let hx = h
        const isYellow = h > 60 && h < 180
        if (isYellow) {
            const isCloserToGreen = h > 120
            if (isCloserToGreen) {
                hx = scale(h, 120, 180, 135, 180)
            }
            else {
                hx = scale(h, 60, 120, 60, 105)
            }
        }
        return { h: hx, s, l: lx, a }
    }
    function modifyBackgroundColor(rgb, theme) {
        if (theme.mode === 0) {
            return modifyLightSchemeColor(rgb, theme)
        }
        const pole = getBgPole(theme)
        return modifyColorWithCache(rgb, { ...theme, mode: 0 }, modifyBgHSL, pole)
    }
    const MIN_FG_LIGHTNESS = 0.55
    function modifyBlueFgHue(hue) {
        return scale(hue, 205, 245, 205, 220)
    }
    function modifyFgHSL({ h, s, l, a }, pole) {
        const isLight = l > 0.5
        const isNeutral = l < 0.2 || s < 0.24
        const isBlue = !isNeutral && h > 205 && h < 245
        if (isLight) {
            const lx = scale(l, 0.5, 1, MIN_FG_LIGHTNESS, pole.l)
            if (isNeutral) {
                const hx = pole.h
                const sx = pole.s
                return { h: hx, s: sx, l: lx, a }
            }
            let hx = h
            if (isBlue) {
                hx = modifyBlueFgHue(h)
            }
            return { h: hx, s, l: lx, a }
        }
        if (isNeutral) {
            const hx = pole.h
            const sx = pole.s
            const lx = scale(l, 0, 0.5, pole.l, MIN_FG_LIGHTNESS)
            return { h: hx, s: sx, l: lx, a }
        }
        let hx = h
        let lx = l
        if (isBlue) {
            hx = modifyBlueFgHue(h)
            lx = scale(l, 0, 0.5, pole.l, Math.min(1, MIN_FG_LIGHTNESS + 0.05))
        }
        else {
            lx = scale(l, 0, 0.5, pole.l, MIN_FG_LIGHTNESS)
        }
        return { h: hx, s, l: lx, a }
    }
    function modifyForegroundColor(rgb, theme) {
        if (theme.mode === 0) {
            return modifyLightSchemeColor(rgb, theme)
        }
        const pole = getFgPole(theme)
        return modifyColorWithCache(rgb, { ...theme, mode: 0 }, modifyFgHSL, pole)
    }
    function modifyBorderHSL({ h, s, l, a }, poleFg, poleBg) {
        const isDark = l < 0.5
        const isNeutral = l < 0.2 || s < 0.24
        let hx = h
        let sx = s
        if (isNeutral) {
            if (isDark) {
                hx = poleFg.h
                sx = poleFg.s
            }
            else {
                hx = poleBg.h
                sx = poleBg.s
            }
        }
        const lx = scale(l, 0, 1, 0.5, 0.2)
        return { h: hx, s: sx, l: lx, a }
    }
    function modifyBorderColor(rgb, theme) {
        if (theme.mode === 0) {
            return modifyLightSchemeColor(rgb, theme)
        }
        const poleFg = getFgPole(theme)
        const poleBg = getBgPole(theme)
        return modifyColorWithCache(rgb, { ...theme, mode: 0 }, modifyBorderHSL, poleFg, poleBg)
    }

    const themeColorTypes = {
        accentcolor: 'bg',
        button_background_active: 'text',
        button_background_hover: 'text',
        frame: 'bg',
        icons: 'text',
        icons_attention: 'text',
        popup: 'bg',
        popup_border: 'bg',
        popup_highlight: 'bg',
        popup_highlight_text: 'text',
        popup_text: 'text',
        tab_background_text: 'text',
        tab_line: 'bg',
        tab_loading: 'bg',
        tab_selected: 'bg',
        textcolor: 'text',
        toolbar: 'bg',
        toolbar_bottom_separator: 'border',
        toolbar_field: 'bg',
        toolbar_field_border: 'border',
        toolbar_field_border_focus: 'border',
        toolbar_field_focus: 'bg',
        toolbar_field_separator: 'border',
        toolbar_field_text: 'text',
        toolbar_field_text_focus: 'text',
        toolbar_text: 'text',
        toolbar_top_separator: 'border',
        toolbar_vertical_separator: 'border',
    }
    const $colors = {
        accentcolor: '#111111',
        frame: '#111111',
        popup: '#cccccc',
        popup_text: 'black',
        tab_background_text: 'white',
        tab_line: '#23aeff',
        tab_loading: '#23aeff',
        textcolor: 'white',
        toolbar: '#707070',
        toolbar_field: 'lightgray',
        toolbar_field_text: 'black',
    }
    function setWindowTheme(filter) {
        const colors = Object.entries($colors).reduce((obj, [key, value]) => {
            const type = themeColorTypes[key]
            const modify = {
                'bg': modifyBackgroundColor,
                'text': modifyForegroundColor,
                'border': modifyBorderColor,
            }[type]
            const rgb = parse(value)
            const modified = modify(rgb, filter)
            obj[key] = modified
            return obj
        }, {})
        if (typeof browser !== 'undefined' && browser.theme && browser.theme.update) {
            browser.theme.update({ colors })
        }
    }
    function resetWindowTheme() {
        if (typeof browser !== 'undefined' && browser.theme && browser.theme.reset) {
            browser.theme.reset()
        }
    }

    function createSVGFilterStylesheet(config, url, frameURL, inversionFixes) {
        let filterValue
        let reverseFilterValue
        if (isFirefox()) {
            filterValue = getEmbeddedSVGFilterValue(getSVGFilterMatrixValue(config))
            reverseFilterValue = getEmbeddedSVGFilterValue(getSVGReverseFilterMatrixValue())
        }
        else {
            filterValue = 'url(#dark-mode-filter)'
            reverseFilterValue = 'url(#dark-mode-reverse-filter)'
        }
        return cssFilterStyleheetTemplate(filterValue, reverseFilterValue, config, url, frameURL, inversionFixes)
    }
    function getEmbeddedSVGFilterValue(matrixValue) {
        const id = 'dark-mode-filter'
        const svg = [
            '<svg xmlns="http://www.w3.org/2000/svg">',
            `<filter id="${id}" style="color-interpolation-filters: sRGB;">`,
            `<feColorMatrix type="matrix" values="${matrixValue}" />`,
            '</filter>',
            '</svg>',
        ].join('')
        return `url(data:image/svg+xml;base64,${btoa(svg)}#${id})`
    }
    function toSVGMatrix(matrix) {
        return matrix.slice(0, 4).map(m => m.map(m => m.toFixed(3)).join(' ')).join(' ')
    }
    function getSVGFilterMatrixValue(config) {
        return toSVGMatrix(createFilterMatrix(config))
    }
    function getSVGReverseFilterMatrixValue() {
        return toSVGMatrix(Matrix.invertNHue())
    }

    const matchesMediaQuery = (query) => Boolean(window.matchMedia(query).matches)
    const matchesDarkTheme = () => matchesMediaQuery('(prefers-color-scheme: dark)')
    const matchesLightTheme = () => matchesMediaQuery('(prefers-color-scheme: light)')
    const isColorSchemeSupported = matchesDarkTheme() || matchesLightTheme()
    function isSystemDarkModeEnabled() {
        if (!isColorSchemeSupported) {
            return false
        }
        return matchesDarkTheme()
    }

    const AUTO_TIME_CHECK_INTERVAL = getDuration({ seconds: 10 })
    class Extension {
        constructor() {
            this.popupOpeningListener = null
            this.wasLastColorSchemeDark = null
            this.onColorSchemeChange = ({ isDark }) => {
                this.wasLastColorSchemeDark = isDark
                if (this.user.settings.automation !== 'system') {
                    return
                }
                this.handleAutoCheck()
            }
            this.handleAutoCheck = () => {
                if (!this.ready) {
                    return
                }
                const isEnabled = this.isEnabled()
                if (this.wasEnabledOnLastCheck !== isEnabled) {
                    this.wasEnabledOnLastCheck = isEnabled
                    this.onAppToggle()
                    this.tabs.sendMessage(this.getTabMessage)
                    this.reportChanges()
                }
            }
            this.getTabMessage = (url, frameURL) => {
                const urlInfo = this.getURLInfo(url)
                if (this.isEnabled() && isURLEnabled(url, this.user.settings, urlInfo)) {
                    const custom = this.user.settings.customThemes.find(({ url: urlList }) => isURLInList(url, urlList))
                    const preset = custom ? null : this.user.settings.presets.find(({ urls }) => isURLInList(url, urls))
                    const theme = custom ? custom.theme : preset ? preset.theme : this.user.settings.theme
                    console.log(`Creating CSS for url: ${url}`)
                    switch (theme.engine) {
                        case ThemeEngines.cssFilter: {
                            return {
                                type: 'add-css-filter',
                                data: createCSSFilterStyleheet(theme, url, frameURL, this.config.INVERSION_FIXES),
                            }
                        }
                        case ThemeEngines.svgFilter: {
                            if (isFirefox()) {
                                return {
                                    type: 'add-css-filter',
                                    data: createSVGFilterStylesheet(theme, url, frameURL, this.config.INVERSION_FIXES),
                                }
                            }
                            return {
                                type: 'add-svg-filter',
                                data: {
                                    css: createSVGFilterStylesheet(theme, url, frameURL, this.config.INVERSION_FIXES),
                                    svgMatrix: getSVGFilterMatrixValue(theme),
                                    svgReverseMatrix: getSVGReverseFilterMatrixValue(),
                                },
                            }
                        }
                        case ThemeEngines.staticTheme: {
                            return {
                                type: 'add-static-theme',
                                data: theme.stylesheet && theme.stylesheet.trim() ?
                                    theme.stylesheet :
                                    createStaticStylesheet(theme, url, frameURL, this.config.STATIC_THEMES),
                            }
                        }
                        case ThemeEngines.dynamicTheme: {
                            const filter = { ...theme }
                            delete filter.engine
                            const fixes = getDynamicThemeFixesFor(url, frameURL, this.config.DYNAMIC_THEME_FIXES, this.user.settings.enableForPDF)
                            const isIFrame = frameURL != null
                            return {
                                type: 'add-dynamic-theme',
                                data: { filter, fixes, isIFrame },
                            }
                        }
                        default: {
                            throw new Error(`Unknown engine ${theme.engine}`)
                        }
                    }
                }
                console.log(`Site is not inverted: ${url}`)
                return {
                    type: 'clean-up',
                }
            }
            this.ready = false
            this.icon = new IconManager()
            this.config = new ConfigManager()
            this.devtools = new DevTools(this.config, () => this.onSettingsChanged())
            this.messenger = new Messenger(this.getMessengerAdapter());;
            this.tabs = new TabManager({
                getConnectionMessage: ({ url, frameURL, unsupportedSender }) => {
                    if (unsupportedSender) {
                        return this.getUnsupportedSenderMessage()
                    }
                    return this.getConnectionMessage(url, frameURL)
                },
                onColorSchemeChange: this.onColorSchemeChange,
            })
            this.user = new UserStorage()
            this.awaiting = []
        }
        isEnabled() {
            const { automation } = this.user.settings
            if (automation === 'time') {
                const now = new Date()
                return isInTimeInterval(now, this.user.settings.time.activation, this.user.settings.time.deactivation)
            }
            else if (automation === 'system') {
                if (isFirefox()) {
                    return this.wasLastColorSchemeDark == null
                        ? isSystemDarkModeEnabled()
                        : this.wasLastColorSchemeDark
                }
                return isSystemDarkModeEnabled()
            }
            else if (automation === 'location') {
                const latitude = this.user.settings.location.latitude
                const longitude = this.user.settings.location.longitude
                if (latitude != null && longitude != null) {
                    const now = new Date()
                    return isNightAtLocation(now, latitude, longitude)
                }
            }
            return this.user.settings.enabled
        }
        async start() {
            await this.config.load({ local: true })
            this.fonts = await getFontList()
            await this.user.loadSettings()
            if (this.user.settings.syncSitesFixes) {
                await this.config.load({ local: false })
            }
            this.onAppToggle()
            this.changeSettings(this.user.settings)
            console.log('loaded', this.user.settings)
            this.registerCommands()
            this.ready = true
            this.tabs.updateContentScript({ runOnProtectedPages: this.user.settings.enableForProtectedPages })
            this.awaiting.forEach((ready) => ready())
            this.awaiting = null
            this.startAutoTimeCheck()
        }
        getMessengerAdapter() {
            return {
                collect: async () => {
                    if (!this.ready) {
                        await new Promise((resolve) => this.awaiting.push(resolve))
                    }
                    return await this.collectData()
                },
                getActiveTabInfo: async () => {
                    if (!this.ready) {
                        await new Promise((resolve) => this.awaiting.push(resolve))
                    }
                    const url = await this.tabs.getActiveTabURL()
                    return this.getURLInfo(url)
                },
                changeSettings: (settings) => this.changeSettings(settings),
                setTheme: (theme) => this.setTheme(theme),
                setShortcut: ({ command, shortcut }) => this.setShortcut(command, shortcut),
                toggleURL: (url) => this.toggleURL(url),
                onPopupOpen: () => this.popupOpeningListener && this.popupOpeningListener(),
                loadConfig: async (options) => await this.config.load(options),
                applyDevDynamicThemeFixes: (text) => this.devtools.applyDynamicThemeFixes(text),
                resetDevDynamicThemeFixes: () => this.devtools.resetDynamicThemeFixes(),
                applyDevInversionFixes: (text) => this.devtools.applyInversionFixes(text),
                resetDevInversionFixes: () => this.devtools.resetInversionFixes(),
                applyDevStaticThemes: (text) => this.devtools.applyStaticThemes(text),
                resetDevStaticThemes: () => this.devtools.resetStaticThemes(),
            }
        }
        registerCommands() {
            if (!chrome.commands) {
                return
            }
            chrome.commands.onCommand.addListener((command) => {
                if (command === 'toggle') {
                    console.log('Toggle command entered')
                    this.changeSettings({
                        enabled: !this.isEnabled(),
                        automation: '',
                    })
                }
                if (command === 'addSite') {
                    console.log('Add Site command entered')
                    this.toggleCurrentSite()
                }
                if (command === 'switchEngine') {
                    console.log('Switch Engine command entered')
                    const engines = Object.values(ThemeEngines)
                    const index = engines.indexOf(this.user.settings.theme.engine)
                    const next = index === engines.length - 1 ? engines[0] : engines[index + 1]
                    this.setTheme({ engine: next })
                }
            })
        }
        async getShortcuts() {
            const commands = await getCommands()
            return commands.reduce((map, cmd) => Object.assign(map, { [cmd.name]: cmd.shortcut }), {})
        }
        setShortcut(command, shortcut) {
            setShortcut(command, shortcut)
        }
        async collectData() {
            return {
                isEnabled: this.isEnabled(),
                isReady: this.ready,
                settings: this.user.settings,
                fonts: this.fonts,
                shortcuts: await this.getShortcuts(),
                devtools: {
                    dynamicFixesText: this.devtools.getDynamicThemeFixesText(),
                    filterFixesText: this.devtools.getInversionFixesText(),
                    staticThemesText: this.devtools.getStaticThemesText(),
                    hasCustomDynamicFixes: this.devtools.hasCustomDynamicThemeFixes(),
                    hasCustomFilterFixes: this.devtools.hasCustomFilterFixes(),
                    hasCustomStaticFixes: this.devtools.hasCustomStaticFixes(),
                },
            }
        }

        getConnectionMessage(url, frameURL) {
            if (this.ready) {
                return this.getTabMessage(url, frameURL)
            }
            else {
                return new Promise((resolve) => {
                    this.awaiting.push(() => {
                        resolve(this.getTabMessage(url, frameURL))
                    })
                })
            }
        }
        getUnsupportedSenderMessage() {
            return { type: 'unsupported-sender' }
        }
        startAutoTimeCheck() {
            setInterval(() => {
                if (!this.ready || this.user.settings.automation === '') {
                    return
                }
                this.handleAutoCheck()
            }, AUTO_TIME_CHECK_INTERVAL)
        }
        changeSettings($settings) {
            const prev = { ...this.user.settings }
            this.user.set($settings)
            if ((prev.enabled !== this.user.settings.enabled) ||
                (prev.automation !== this.user.settings.automation) ||
                (prev.time.activation !== this.user.settings.time.activation) ||
                (prev.time.deactivation !== this.user.settings.time.deactivation) ||
                (prev.location.latitude !== this.user.settings.location.latitude) ||
                (prev.location.longitude !== this.user.settings.location.longitude)) {
                this.onAppToggle()
            }
            if (prev.syncSettings !== this.user.settings.syncSettings) {
                this.user.saveSyncSetting(this.user.settings.syncSettings)
            }
            if (this.isEnabled() && $settings.changeBrowserTheme != null && prev.changeBrowserTheme !== $settings.changeBrowserTheme) {
                if ($settings.changeBrowserTheme) {
                    setWindowTheme(this.user.settings.theme)
                }
                else {
                    resetWindowTheme()
                }
            }
            this.onSettingsChanged()
        }
        setTheme($theme) {
            this.user.set({ theme: { ...this.user.settings.theme, ...$theme } })
            if (this.isEnabled() && this.user.settings.changeBrowserTheme) {
                setWindowTheme(this.user.settings.theme)
            }
            this.onSettingsChanged()
        }
        async reportChanges() {
            const info = await this.collectData()
            this.messenger.reportChanges(info)
        }
        toggleURL(url) {
            const isInDarkList = isURLInList(url, this.config.DARK_SITES)
            const siteList = isInDarkList ?
                this.user.settings.siteListEnabled.slice() :
                this.user.settings.siteList.slice()
            const pattern = getURLHostOrProtocol(url)
            const index = siteList.indexOf(pattern)
            if (index < 0) {
                siteList.push(pattern)
            }
            else {
                siteList.splice(index, 1)
            }
            if (isInDarkList) {
                this.changeSettings({ siteListEnabled: siteList })
            }
            else {
                this.changeSettings({ siteList })
            }
        }
        async toggleCurrentSite() {
            const url = await this.tabs.getActiveTabURL()
            this.toggleURL(url)
        }
        onAppToggle() {
            if (this.isEnabled()) {
                this.icon.setActive()
                if (this.user.settings.changeBrowserTheme) {
                    setWindowTheme(this.user.settings.theme)
                }
            }
            else {
                this.icon.setInactive()
                if (this.user.settings.changeBrowserTheme) {
                    resetWindowTheme()
                }
            }
        }
        onSettingsChanged() {
            if (!this.ready) {
                return
            }
            this.wasEnabledOnLastCheck = this.isEnabled()
            this.tabs.sendMessage(this.getTabMessage)
            this.saveUserSettings()
            this.reportChanges()
        }
        getURLInfo(url) {
            const { DARK_SITES } = this.config
            const isInDarkList = isURLInList(url, DARK_SITES)
            const isProtected = !canInjectScript(url)
            return {
                url,
                isInDarkList,
                isProtected,
            }
        }
        async saveUserSettings() {
            await this.user.saveSettings()
            console.log('saved', this.user.settings)
        }
    }
    const extension = new Extension()
    extension.start()
}())
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy91dGlscy9wbGF0Zm9ybS50cyIsIi4uLy4uL3NyYy91dGlscy9uZXR3b3JrLnRzIiwiLi4vLi4vc3JjL3V0aWxzL3RleHQudHMiLCIuLi8uLi9zcmMvdXRpbHMvdGltZS50cyIsIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL3V0aWxzL25ldHdvcmsudHMiLCIuLi8uLi9zcmMvdXRpbHMvYXJyYXkudHMiLCIuLi8uLi9zcmMvZ2VuZXJhdG9ycy91dGlscy9mb3JtYXQudHMiLCIuLi8uLi9zcmMvdXRpbHMvbWF0aC50cyIsIi4uLy4uL3NyYy9nZW5lcmF0b3JzL3V0aWxzL21hdHJpeC50cyIsIi4uLy4uL3NyYy9nZW5lcmF0b3JzL3V0aWxzL3BhcnNlLnRzIiwiLi4vLi4vc3JjL3V0aWxzL2lwdjYudHMiLCIuLi8uLi9zcmMvdXRpbHMvdXJsLnRzIiwiLi4vLi4vc3JjL2dlbmVyYXRvcnMvdGV4dC1zdHlsZS50cyIsIi4uLy4uL3NyYy9nZW5lcmF0b3JzL2Nzcy1maWx0ZXIudHMiLCIuLi8uLi9zcmMvZ2VuZXJhdG9ycy9keW5hbWljLXRoZW1lLnRzIiwiLi4vLi4vc3JjL2dlbmVyYXRvcnMvc3RhdGljLXRoZW1lLnRzIiwiLi4vLi4vc3JjL2JhY2tncm91bmQvY29uZmlnLW1hbmFnZXIudHMiLCIuLi8uLi9zcmMvYmFja2dyb3VuZC9kZXZ0b29scy50cyIsIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL2ljb24tbWFuYWdlci50cyIsIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL21lc3Nlbmdlci50cyIsIi4uLy4uL3NyYy91dGlscy9sb2NhbGVzLnRzIiwiLi4vLi4vc3JjL3V0aWxzL2xpbmtzLnRzIiwiLi4vLi4vc3JjL2JhY2tncm91bmQvdXRpbHMvZXh0ZW5zaW9uLWFwaS50cyIsIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL25ld3NtYWtlci50cyIsIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL3RhYi1tYW5hZ2VyLnRzIiwiLi4vLi4vc3JjL2dlbmVyYXRvcnMvdGhlbWUtZW5naW5lcy50cyIsIi4uLy4uL3NyYy9kZWZhdWx0cy50cyIsIi4uLy4uL3NyYy91dGlscy9kZWJvdW5jZS50cyIsIi4uLy4uL3NyYy9iYWNrZ3JvdW5kL3VzZXItc3RvcmFnZS50cyIsIi4uLy4uL3NyYy91dGlscy9jb2xvci50cyIsIi4uLy4uL3NyYy9nZW5lcmF0b3JzL21vZGlmeS1jb2xvcnMudHMiLCIuLi8uLi9zcmMvYmFja2dyb3VuZC93aW5kb3ctdGhlbWUudHMiLCIuLi8uLi9zcmMvZ2VuZXJhdG9ycy9zdmctZmlsdGVyLnRzIiwiLi4vLi4vc3JjL3V0aWxzL21lZGlhLXF1ZXJ5LnRzIiwiLi4vLi4vc3JjL2JhY2tncm91bmQvZXh0ZW5zaW9uLnRzIiwiLi4vLi4vc3JjL2JhY2tncm91bmQvaW5kZXgudHMiXSwic291cmNlc0NvbnRlbnQiOlsiZXhwb3J0IGZ1bmN0aW9uIGlzQ2hyb21pdW1CYXNlZCgpIHtcbiAgICByZXR1cm4gbmF2aWdhdG9yLnVzZXJBZ2VudC50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdjaHJvbWUnKSB8fCBuYXZpZ2F0b3IudXNlckFnZW50LnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ2Nocm9taXVtJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0ZpcmVmb3goKSB7XG4gICAgcmV0dXJuIG5hdmlnYXRvci51c2VyQWdlbnQuaW5jbHVkZXMoJ0ZpcmVmb3gnKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzVml2YWxkaSgpIHtcbiAgICByZXR1cm4gbmF2aWdhdG9yLnVzZXJBZ2VudC50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCd2aXZhbGRpJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1lhQnJvd3NlcigpIHtcbiAgICByZXR1cm4gbmF2aWdhdG9yLnVzZXJBZ2VudC50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCd5YWJyb3dzZXInKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzT3BlcmEoKSB7XG4gICAgY29uc3QgYWdlbnQgPSBuYXZpZ2F0b3IudXNlckFnZW50LnRvTG93ZXJDYXNlKCk7XG4gICAgcmV0dXJuIGFnZW50LmluY2x1ZGVzKCdvcHInKSB8fCBhZ2VudC5pbmNsdWRlcygnb3BlcmEnKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzRWRnZSgpIHtcbiAgICByZXR1cm4gbmF2aWdhdG9yLnVzZXJBZ2VudC5pbmNsdWRlcygnRWRnJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1dpbmRvd3MoKSB7XG4gICAgaWYgKHR5cGVvZiBuYXZpZ2F0b3IgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICByZXR1cm4gbmF2aWdhdG9yLnBsYXRmb3JtLnRvTG93ZXJDYXNlKCkuc3RhcnRzV2l0aCgnd2luJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc01hY09TKCkge1xuICAgIGlmICh0eXBlb2YgbmF2aWdhdG9yID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgcmV0dXJuIG5hdmlnYXRvci5wbGF0Zm9ybS50b0xvd2VyQ2FzZSgpLnN0YXJ0c1dpdGgoJ21hYycpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNNb2JpbGUoKSB7XG4gICAgaWYgKHR5cGVvZiBuYXZpZ2F0b3IgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICByZXR1cm4gbmF2aWdhdG9yLnVzZXJBZ2VudC50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdtb2JpbGUnKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldENocm9tZVZlcnNpb24oKSB7XG4gICAgY29uc3QgYWdlbnQgPSBuYXZpZ2F0b3IudXNlckFnZW50LnRvTG93ZXJDYXNlKCk7XG4gICAgY29uc3QgbSA9IGFnZW50Lm1hdGNoKC9jaHJvbVtlfGl1bV1cXC8oW14gXSspLyk7XG4gICAgaWYgKG0gJiYgbVsxXSkge1xuICAgICAgICByZXR1cm4gbVsxXTtcbiAgICB9XG4gICAgcmV0dXJuIG51bGw7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjb21wYXJlQ2hyb21lVmVyc2lvbnMoJGE6IHN0cmluZywgJGI6IHN0cmluZykge1xuICAgIGNvbnN0IGEgPSAkYS5zcGxpdCgnLicpLm1hcCgoeCkgPT4gcGFyc2VJbnQoeCkpO1xuICAgIGNvbnN0IGIgPSAkYi5zcGxpdCgnLicpLm1hcCgoeCkgPT4gcGFyc2VJbnQoeCkpO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYS5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAoYVtpXSAhPT0gYltpXSkge1xuICAgICAgICAgICAgcmV0dXJuIGFbaV0gPCBiW2ldID8gLTEgOiAxO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiAwO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNEZWZpbmVkU2VsZWN0b3JTdXBwb3J0ZWQoKSB7XG4gICAgdHJ5IHtcbiAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignOmRlZmluZWQnKTtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG59XG5cbmV4cG9ydCBjb25zdCBJU19TSEFET1dfRE9NX1NVUFBPUlRFRCA9IHR5cGVvZiBTaGFkb3dSb290ID09PSAnZnVuY3Rpb24nO1xuXG5leHBvcnQgZnVuY3Rpb24gaXNDU1NTdHlsZVNoZWV0Q29uc3RydWN0b3JTdXBwb3J0ZWQoKSB7XG4gICAgdHJ5IHtcbiAgICAgICAgbmV3IENTU1N0eWxlU2hlZXQoKTtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG59XG4iLCJpbXBvcnQge2lzRmlyZWZveH0gZnJvbSAnLi9wbGF0Zm9ybSc7XG5cbmFzeW5jIGZ1bmN0aW9uIGdldE9LUmVzcG9uc2UodXJsOiBzdHJpbmcsIG1pbWVUeXBlPzogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChcbiAgICAgICAgdXJsLFxuICAgICAgICB7XG4gICAgICAgICAgICBjYWNoZTogJ2ZvcmNlLWNhY2hlJyxcbiAgICAgICAgICAgIGNyZWRlbnRpYWxzOiAnb21pdCcsXG4gICAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIEZpcmVmb3ggYnVnLCBjb250ZW50IHR5cGUgaXMgXCJhcHBsaWNhdGlvbi94LXVua25vd24tY29udGVudC10eXBlXCJcbiAgICBpZiAoaXNGaXJlZm94KCkgJiYgbWltZVR5cGUgPT09ICd0ZXh0L2NzcycgJiYgdXJsLnN0YXJ0c1dpdGgoJ21vei1leHRlbnNpb246Ly8nKSAmJiB1cmwuZW5kc1dpdGgoJy5jc3MnKSkge1xuICAgICAgICByZXR1cm4gcmVzcG9uc2U7XG4gICAgfVxuXG4gICAgaWYgKG1pbWVUeXBlICYmICFyZXNwb25zZS5oZWFkZXJzLmdldCgnQ29udGVudC1UeXBlJykuc3RhcnRzV2l0aChtaW1lVHlwZSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBNaW1lIHR5cGUgbWlzbWF0Y2ggd2hlbiBsb2FkaW5nICR7dXJsfWApO1xuICAgIH1cblxuICAgIGlmICghcmVzcG9uc2Uub2spIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmFibGUgdG8gbG9hZCAke3VybH0gJHtyZXNwb25zZS5zdGF0dXN9ICR7cmVzcG9uc2Uuc3RhdHVzVGV4dH1gKTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVzcG9uc2U7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBsb2FkQXNEYXRhVVJMKHVybDogc3RyaW5nLCBtaW1lVHlwZT86IHN0cmluZykge1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZ2V0T0tSZXNwb25zZSh1cmwsIG1pbWVUeXBlKTtcbiAgICByZXR1cm4gYXdhaXQgcmVhZFJlc3BvbnNlQXNEYXRhVVJMKHJlc3BvbnNlKTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJlYWRSZXNwb25zZUFzRGF0YVVSTChyZXNwb25zZTogUmVzcG9uc2UpIHtcbiAgICBjb25zdCBibG9iID0gYXdhaXQgcmVzcG9uc2UuYmxvYigpO1xuICAgIGNvbnN0IGRhdGFVUkwgPSBhd2FpdCAobmV3IFByb21pc2U8c3RyaW5nPigocmVzb2x2ZSkgPT4ge1xuICAgICAgICBjb25zdCByZWFkZXIgPSBuZXcgRmlsZVJlYWRlcigpO1xuICAgICAgICByZWFkZXIub25sb2FkZW5kID0gKCkgPT4gcmVzb2x2ZShyZWFkZXIucmVzdWx0IGFzIHN0cmluZyk7XG4gICAgICAgIHJlYWRlci5yZWFkQXNEYXRhVVJMKGJsb2IpO1xuICAgIH0pKTtcbiAgICByZXR1cm4gZGF0YVVSTDtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGxvYWRBc1RleHQodXJsOiBzdHJpbmcsIG1pbWVUeXBlPzogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBnZXRPS1Jlc3BvbnNlKHVybCwgbWltZVR5cGUpO1xuICAgIHJldHVybiBhd2FpdCByZXNwb25zZS50ZXh0KCk7XG59XG4iLCJleHBvcnQgZnVuY3Rpb24gZ2V0VGV4dFBvc2l0aW9uTWVzc2FnZSh0ZXh0OiBzdHJpbmcsIGluZGV4OiBudW1iZXIpIHtcbiAgICBpZiAoIWlzRmluaXRlKGluZGV4KSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFdyb25nIGNoYXIgaW5kZXggJHtpbmRleH1gKTtcbiAgICB9XG4gICAgbGV0IG1lc3NhZ2UgPSAnJztcbiAgICBsZXQgbGluZSA9IDA7XG4gICAgbGV0IHByZXZMbjogbnVtYmVyO1xuICAgIGxldCBuZXh0TG4gPSAwO1xuICAgIGRvIHtcbiAgICAgICAgbGluZSsrO1xuICAgICAgICBwcmV2TG4gPSBuZXh0TG47XG4gICAgICAgIG5leHRMbiA9IHRleHQuaW5kZXhPZignXFxuJywgcHJldkxuICsgMSk7XG4gICAgfSB3aGlsZSAobmV4dExuID49IDAgJiYgbmV4dExuIDw9IGluZGV4KTtcbiAgICBjb25zdCBjb2x1bW4gPSBpbmRleCAtIHByZXZMbjtcbiAgICBtZXNzYWdlICs9IGBsaW5lICR7bGluZX0sIGNvbHVtbiAke2NvbHVtbn1gO1xuICAgIG1lc3NhZ2UgKz0gJ1xcbic7XG4gICAgaWYgKGluZGV4IDwgdGV4dC5sZW5ndGgpIHtcbiAgICAgICAgbWVzc2FnZSArPSB0ZXh0LnN1YnN0cmluZyhwcmV2TG4gKyAxLCBuZXh0TG4pO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIG1lc3NhZ2UgKz0gdGV4dC5zdWJzdHJpbmcodGV4dC5sYXN0SW5kZXhPZignXFxuJykgKyAxKTtcbiAgICB9XG4gICAgbWVzc2FnZSArPSAnXFxuJztcbiAgICBtZXNzYWdlICs9IGAke25ldyBBcnJheShjb2x1bW4pLmpvaW4oJy0nKX1eYDtcbiAgICByZXR1cm4gbWVzc2FnZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFRleHREaWZmSW5kZXgoYTogc3RyaW5nLCBiOiBzdHJpbmcpIHtcbiAgICBjb25zdCBzaG9ydCA9IE1hdGgubWluKGEubGVuZ3RoLCBiLmxlbmd0aCk7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzaG9ydDsgaSsrKSB7XG4gICAgICAgIGlmIChhW2ldICE9PSBiW2ldKSB7XG4gICAgICAgICAgICByZXR1cm4gaTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBpZiAoYS5sZW5ndGggIT09IGIubGVuZ3RoKSB7XG4gICAgICAgIHJldHVybiBzaG9ydDtcbiAgICB9XG4gICAgcmV0dXJuIC0xO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VBcnJheSh0ZXh0OiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGV4dC5yZXBsYWNlKC9cXHIvZywgJycpXG4gICAgICAgIC5zcGxpdCgnXFxuJylcbiAgICAgICAgLm1hcCgocykgPT4gcy50cmltKCkpXG4gICAgICAgIC5maWx0ZXIoKHMpID0+IHMpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZm9ybWF0QXJyYXkoYXJyOiBzdHJpbmdbXSkge1xuICAgIHJldHVybiBhcnIuY29uY2F0KCcnKS5qb2luKCdcXG4nKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldE1hdGNoZXMocmVnZXg6IFJlZ0V4cCwgaW5wdXQ6IHN0cmluZywgZ3JvdXAgPSAwKSB7XG4gICAgY29uc3QgbWF0Y2hlczogc3RyaW5nW10gPSBbXTtcbiAgICBsZXQgbTogUmVnRXhwTWF0Y2hBcnJheTtcbiAgICB3aGlsZSAobSA9IHJlZ2V4LmV4ZWMoaW5wdXQpKSB7XG4gICAgICAgIG1hdGNoZXMucHVzaChtW2dyb3VwXSk7XG4gICAgfVxuICAgIHJldHVybiBtYXRjaGVzO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0U3RyaW5nU2l6ZSh2YWx1ZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHZhbHVlLmxlbmd0aCAqIDI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmb3JtYXRDU1ModGV4dDogc3RyaW5nKSB7XG5cbiAgICBmdW5jdGlvbiB0cmltTGVmdCh0ZXh0OiBzdHJpbmcpIHtcbiAgICAgICAgcmV0dXJuIHRleHQucmVwbGFjZSgvXlxccysvLCAnJyk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ2V0SW5kZW50KGRlcHRoOiBudW1iZXIpIHtcbiAgICAgICAgaWYgKGRlcHRoID09PSAwKSB7XG4gICAgICAgICAgICByZXR1cm4gJyc7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuICcgJy5yZXBlYXQoNCAqIGRlcHRoKTtcbiAgICB9XG5cbiAgICBjb25zdCBlbXB0eVJ1bGVSZWdleHAgPSAvW157fV0re1xccyp9L2c7XG4gICAgd2hpbGUgKGVtcHR5UnVsZVJlZ2V4cC50ZXN0KHRleHQpKSB7XG4gICAgICAgIHRleHQgPSB0ZXh0LnJlcGxhY2UoZW1wdHlSdWxlUmVnZXhwLCAnJyk7XG4gICAgfVxuXG4gICAgY29uc3QgY3NzID0gKHRleHRcbiAgICAgICAgLnJlcGxhY2UoL1xcc3syLH0vZywgJyAnKSAvLyBSZXBsYWNpbmcgbXVsdGlwbGUgc3BhY2VzIHRvIG9uZVxuICAgICAgICAucmVwbGFjZSgvXFx7L2csICd7XFxuJykgLy8ge1xuICAgICAgICAucmVwbGFjZSgvXFx9L2csICdcXG59XFxuJykgLy8gfVxuICAgICAgICAucmVwbGFjZSgvXFw7KD8hW14oXFwofFxcXCIpXSooXFwpfFxcXCIpKS9nLCAnO1xcbicpIC8vIDsgYW5kIGRvIG5vdCB0YXJnZXQgYmV0d2VlbiAoKSBhbmQgXCJcIlxuICAgICAgICAucmVwbGFjZSgvXFwsKD8hW14oXFwofFxcXCIpXSooXFwpfFxcXCIpKS9nLCAnLFxcbicpIC8vICwgYW5kIGRvIG5vdCB0YXJnZXQgYmV0d2VlbiAoKSBhbmQgXCJcIlxuICAgICAgICAucmVwbGFjZSgvXFxuXFxzKlxcbi9nLCAnXFxuJykgLy8gUmVtb3ZlIFxcbiBXaXRob3V0IGFueSBjaGFyYWN0ZXJzIGJldHdlZW4gaXQgdG8gdGhlIG5leHQgXFxuXG4gICAgICAgIC5zcGxpdCgnXFxuJykpO1xuXG4gICAgbGV0IGRlcHRoID0gMDtcbiAgICBjb25zdCBmb3JtYXR0ZWQgPSBbXTtcblxuICAgIGZvciAobGV0IHggPSAwLCBsZW4gPSBjc3MubGVuZ3RoOyB4IDwgbGVuOyB4KyspIHtcbiAgICAgICAgY29uc3QgbGluZSA9IGNzc1t4XSArICdcXG4nO1xuICAgICAgICBpZiAobGluZS5tYXRjaCgvXFx7LykpIHsgLy8ge1xuICAgICAgICAgICAgZm9ybWF0dGVkLnB1c2goZ2V0SW5kZW50KGRlcHRoKyspICsgdHJpbUxlZnQobGluZSkpO1xuICAgICAgICB9IGVsc2UgaWYgKGxpbmUubWF0Y2goL1xcfS8pKSB7IC8vIH1cbiAgICAgICAgICAgIGZvcm1hdHRlZC5wdXNoKGdldEluZGVudCgtLWRlcHRoKSArIHRyaW1MZWZ0KGxpbmUpKTtcbiAgICAgICAgfSBlbHNlIHsgLy8gQ1NTIGxpbmVcbiAgICAgICAgICAgIGZvcm1hdHRlZC5wdXNoKGdldEluZGVudChkZXB0aCkgKyB0cmltTGVmdChsaW5lKSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gZm9ybWF0dGVkLmpvaW4oJycpLnRyaW0oKTtcbn1cbiIsImV4cG9ydCBmdW5jdGlvbiBwYXJzZVRpbWUoJHRpbWU6IHN0cmluZykge1xuICAgIGNvbnN0IHBhcnRzID0gJHRpbWUuc3BsaXQoJzonKS5zbGljZSgwLCAyKTtcbiAgICBjb25zdCBsb3dlcmNhc2VkID0gJHRpbWUudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG4gICAgY29uc3QgaXNBTSA9IGxvd2VyY2FzZWQuZW5kc1dpdGgoJ2FtJykgfHwgbG93ZXJjYXNlZC5lbmRzV2l0aCgnYS5tLicpO1xuICAgIGNvbnN0IGlzUE0gPSBsb3dlcmNhc2VkLmVuZHNXaXRoKCdwbScpIHx8IGxvd2VyY2FzZWQuZW5kc1dpdGgoJ3AubS4nKTtcblxuICAgIGxldCBob3VycyA9IHBhcnRzLmxlbmd0aCA+IDAgPyBwYXJzZUludChwYXJ0c1swXSkgOiAwO1xuICAgIGlmIChpc05hTihob3VycykgfHwgaG91cnMgPiAyMykge1xuICAgICAgICBob3VycyA9IDA7XG4gICAgfVxuICAgIGlmIChpc0FNICYmIGhvdXJzID09PSAxMikge1xuICAgICAgICBob3VycyA9IDA7XG4gICAgfVxuICAgIGlmIChpc1BNICYmIGhvdXJzIDwgMTIpIHtcbiAgICAgICAgaG91cnMgKz0gMTI7XG4gICAgfVxuXG4gICAgbGV0IG1pbnV0ZXMgPSBwYXJ0cy5sZW5ndGggPiAxID8gcGFyc2VJbnQocGFydHNbMV0pIDogMDtcbiAgICBpZiAoaXNOYU4obWludXRlcykgfHwgbWludXRlcyA+IDU5KSB7XG4gICAgICAgIG1pbnV0ZXMgPSAwO1xuICAgIH1cblxuICAgIHJldHVybiBbaG91cnMsIG1pbnV0ZXNdO1xufVxuXG5mdW5jdGlvbiBwYXJzZTI0SFRpbWUodGltZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRpbWUuc3BsaXQoJzonKS5tYXAoKHgpID0+IHBhcnNlSW50KHgpKTtcbn1cblxuZnVuY3Rpb24gY29tcGFyZVRpbWUoYTogbnVtYmVyW10sIGI6IG51bWJlcltdKSB7XG4gICAgaWYgKGFbMF0gPT09IGJbMF0gJiYgYVsxXSA9PT0gYlsxXSkge1xuICAgICAgICByZXR1cm4gMDtcbiAgICB9XG4gICAgaWYgKGFbMF0gPCBiWzBdIHx8IChhWzBdID09PSBiWzBdICYmIGFbMV0gPCBiWzFdKSkge1xuICAgICAgICByZXR1cm4gLTE7XG4gICAgfVxuICAgIHJldHVybiAxO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNJblRpbWVJbnRlcnZhbChkYXRlOiBEYXRlLCB0aW1lMDogc3RyaW5nLCB0aW1lMTogc3RyaW5nKSB7XG4gICAgY29uc3QgYSA9IHBhcnNlMjRIVGltZSh0aW1lMCk7XG4gICAgY29uc3QgYiA9IHBhcnNlMjRIVGltZSh0aW1lMSk7XG4gICAgY29uc3QgdCA9IFtkYXRlLmdldEhvdXJzKCksIGRhdGUuZ2V0TWludXRlcygpXTtcbiAgICBpZiAoY29tcGFyZVRpbWUoYSwgYikgPiAwKSB7XG4gICAgICAgIHJldHVybiBjb21wYXJlVGltZShhLCB0KSA8PSAwIHx8IGNvbXBhcmVUaW1lKHQsIGIpIDwgMDtcbiAgICB9XG4gICAgcmV0dXJuIGNvbXBhcmVUaW1lKGEsIHQpIDw9IDAgJiYgY29tcGFyZVRpbWUodCwgYikgPCAwO1xufVxuXG5pbnRlcmZhY2UgRHVyYXRpb24ge1xuICAgIGRheXM/OiBudW1iZXI7XG4gICAgaG91cnM/OiBudW1iZXI7XG4gICAgbWludXRlcz86IG51bWJlcjtcbiAgICBzZWNvbmRzPzogbnVtYmVyO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0RHVyYXRpb24odGltZTogRHVyYXRpb24pIHtcbiAgICBsZXQgZHVyYXRpb24gPSAwO1xuICAgIGlmICh0aW1lLnNlY29uZHMpIHtcbiAgICAgICAgZHVyYXRpb24gKz0gdGltZS5zZWNvbmRzICogMTAwMDtcbiAgICB9XG4gICAgaWYgKHRpbWUubWludXRlcykge1xuICAgICAgICBkdXJhdGlvbiArPSB0aW1lLm1pbnV0ZXMgKiA2MCAqIDEwMDA7XG4gICAgfVxuICAgIGlmICh0aW1lLmhvdXJzKSB7XG4gICAgICAgIGR1cmF0aW9uICs9IHRpbWUuaG91cnMgKiA2MCAqIDYwICogMTAwMDtcbiAgICB9XG4gICAgaWYgKHRpbWUuZGF5cykge1xuICAgICAgICBkdXJhdGlvbiArPSB0aW1lLmRheXMgKiAyNCAqIDYwICogNjAgKiAxMDAwO1xuICAgIH1cbiAgICByZXR1cm4gZHVyYXRpb247XG59XG5cbmZ1bmN0aW9uIGdldFN1bnNldFN1bnJpc2VVVENUaW1lKFxuICAgIGRhdGU6IERhdGUsXG4gICAgbGF0aXR1ZGU6IG51bWJlcixcbiAgICBsb25naXR1ZGU6IG51bWJlcixcbikge1xuICAgIGNvbnN0IGRlYzMxID0gbmV3IERhdGUoZGF0ZS5nZXRVVENGdWxsWWVhcigpLCAwLCAwKTtcbiAgICBjb25zdCBvbmVEYXkgPSBnZXREdXJhdGlvbih7ZGF5czogMX0pO1xuICAgIGNvbnN0IGRheU9mWWVhciA9IE1hdGguZmxvb3IoKE51bWJlcihkYXRlKSAtIE51bWJlcihkZWMzMSkpIC8gb25lRGF5KTtcblxuICAgIGNvbnN0IHplbml0aCA9IDkwLjgzMzMzMzMzMzMzMzMzO1xuICAgIGNvbnN0IEQyUiA9IE1hdGguUEkgLyAxODA7XG4gICAgY29uc3QgUjJEID0gMTgwIC8gTWF0aC5QSTtcblxuICAgIC8vIGNvbnZlcnQgdGhlIGxvbmdpdHVkZSB0byBob3VyIHZhbHVlIGFuZCBjYWxjdWxhdGUgYW4gYXBwcm94aW1hdGUgdGltZVxuICAgIGNvbnN0IGxuSG91ciA9IGxvbmdpdHVkZSAvIDE1O1xuXG4gICAgZnVuY3Rpb24gZ2V0VGltZShpc1N1bnJpc2U6IGJvb2xlYW4pIHtcbiAgICAgICAgY29uc3QgdCA9IGRheU9mWWVhciArICgoKGlzU3VucmlzZSA/IDYgOiAxOCkgLSBsbkhvdXIpIC8gMjQpO1xuXG4gICAgICAgIC8vIGNhbGN1bGF0ZSB0aGUgU3VuJ3MgbWVhbiBhbm9tYWx5XG4gICAgICAgIGNvbnN0IE0gPSAoMC45ODU2ICogdCkgLSAzLjI4OTtcblxuICAgICAgICAvLyBjYWxjdWxhdGUgdGhlIFN1bidzIHRydWUgbG9uZ2l0dWRlXG4gICAgICAgIGxldCBMID0gTSArICgxLjkxNiAqIE1hdGguc2luKE0gKiBEMlIpKSArICgwLjAyMCAqIE1hdGguc2luKDIgKiBNICogRDJSKSkgKyAyODIuNjM0O1xuICAgICAgICBpZiAoTCA+IDM2MCkge1xuICAgICAgICAgICAgTCA9IEwgLSAzNjA7XG4gICAgICAgIH0gZWxzZSBpZiAoTCA8IDApIHtcbiAgICAgICAgICAgIEwgPSBMICsgMzYwO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gY2FsY3VsYXRlIHRoZSBTdW4ncyByaWdodCBhc2NlbnNpb25cbiAgICAgICAgbGV0IFJBID0gUjJEICogTWF0aC5hdGFuKDAuOTE3NjQgKiBNYXRoLnRhbihMICogRDJSKSk7XG4gICAgICAgIGlmIChSQSA+IDM2MCkge1xuICAgICAgICAgICAgUkEgPSBSQSAtIDM2MDtcbiAgICAgICAgfSBlbHNlIGlmIChSQSA8IDApIHtcbiAgICAgICAgICAgIFJBID0gUkEgKyAzNjA7XG4gICAgICAgIH1cblxuICAgICAgICAvLyByaWdodCBhc2NlbnNpb24gdmFsdWUgbmVlZHMgdG8gYmUgaW4gdGhlIHNhbWUgcXVhXG4gICAgICAgIGNvbnN0IExxdWFkcmFudCA9IChNYXRoLmZsb29yKEwgLyAoOTApKSkgKiA5MDtcbiAgICAgICAgY29uc3QgUkFxdWFkcmFudCA9IChNYXRoLmZsb29yKFJBIC8gOTApKSAqIDkwO1xuICAgICAgICBSQSA9IFJBICsgKExxdWFkcmFudCAtIFJBcXVhZHJhbnQpO1xuXG4gICAgICAgIC8vIHJpZ2h0IGFzY2Vuc2lvbiB2YWx1ZSBuZWVkcyB0byBiZSBjb252ZXJ0ZWQgaW50byBob3Vyc1xuICAgICAgICBSQSA9IFJBIC8gMTU7XG5cbiAgICAgICAgLy8gY2FsY3VsYXRlIHRoZSBTdW4ncyBkZWNsaW5hdGlvblxuICAgICAgICBjb25zdCBzaW5EZWMgPSAwLjM5NzgyICogTWF0aC5zaW4oTCAqIEQyUik7XG4gICAgICAgIGNvbnN0IGNvc0RlYyA9IE1hdGguY29zKE1hdGguYXNpbihzaW5EZWMpKTtcblxuICAgICAgICAvLyBjYWxjdWxhdGUgdGhlIFN1bidzIGxvY2FsIGhvdXIgYW5nbGVcbiAgICAgICAgY29uc3QgY29zSCA9IChNYXRoLmNvcyh6ZW5pdGggKiBEMlIpIC0gKHNpbkRlYyAqIE1hdGguc2luKGxhdGl0dWRlICogRDJSKSkpIC8gKGNvc0RlYyAqIE1hdGguY29zKGxhdGl0dWRlICogRDJSKSk7XG4gICAgICAgIGlmIChjb3NIID4gMSkge1xuICAgICAgICAgICAgLy8gYWx3YXlzIG5pZ2h0XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIGFsd2F5c0RheTogZmFsc2UsXG4gICAgICAgICAgICAgICAgYWx3YXlzTmlnaHQ6IHRydWUsXG4gICAgICAgICAgICAgICAgdGltZTogMCxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gZWxzZSBpZiAoY29zSCA8IC0xKSB7XG4gICAgICAgICAgICAvLyBhbHdheXMgZGF5XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIGFsd2F5c0RheTogdHJ1ZSxcbiAgICAgICAgICAgICAgICBhbHdheXNOaWdodDogZmFsc2UsXG4gICAgICAgICAgICAgICAgdGltZTogMCxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBIID0gKGlzU3VucmlzZSA/ICgzNjAgLSBSMkQgKiBNYXRoLmFjb3MoY29zSCkpIDogKFIyRCAqIE1hdGguYWNvcyhjb3NIKSkpIC8gMTU7XG5cbiAgICAgICAgLy8gY2FsY3VsYXRlIGxvY2FsIG1lYW4gdGltZSBvZiByaXNpbmcvc2V0dGluZ1xuICAgICAgICBjb25zdCBUID0gSCArIFJBIC0gKDAuMDY1NzEgKiB0KSAtIDYuNjIyO1xuXG4gICAgICAgIC8vIGFkanVzdCBiYWNrIHRvIFVUQ1xuICAgICAgICBsZXQgVVQgPSBUIC0gbG5Ib3VyO1xuICAgICAgICBpZiAoVVQgPiAyNCkge1xuICAgICAgICAgICAgVVQgPSBVVCAtIDI0O1xuICAgICAgICB9IGVsc2UgaWYgKFVUIDwgMCkge1xuICAgICAgICAgICAgVVQgPSBVVCArIDI0O1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gY29udmVydCB0byBtaWxsaXNlY29uZHNcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGFsd2F5c0RheTogZmFsc2UsXG4gICAgICAgICAgICBhbHdheXNOaWdodDogZmFsc2UsXG4gICAgICAgICAgICB0aW1lOiBVVCAqIGdldER1cmF0aW9uKHtob3VyczogMX0pLFxuICAgICAgICB9O1xuICAgIH1cblxuICAgIGNvbnN0IHN1bnJpc2VUaW1lID0gZ2V0VGltZSh0cnVlKTtcbiAgICBjb25zdCBzdW5zZXRUaW1lID0gZ2V0VGltZShmYWxzZSk7XG5cbiAgICBpZiAoc3VucmlzZVRpbWUuYWx3YXlzRGF5IHx8IHN1bnNldFRpbWUuYWx3YXlzRGF5KSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBhbHdheXNEYXk6IHRydWVcbiAgICAgICAgfTtcbiAgICB9IGVsc2UgaWYgKHN1bnJpc2VUaW1lLmFsd2F5c05pZ2h0IHx8IHN1bnNldFRpbWUuYWx3YXlzTmlnaHQpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGFsd2F5c05pZ2h0OiB0cnVlXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgc3VucmlzZVRpbWU6IHN1bnJpc2VUaW1lLnRpbWUsXG4gICAgICAgIHN1bnNldFRpbWU6IHN1bnNldFRpbWUudGltZVxuICAgIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc05pZ2h0QXRMb2NhdGlvbihcbiAgICBkYXRlOiBEYXRlLFxuICAgIGxhdGl0dWRlOiBudW1iZXIsXG4gICAgbG9uZ2l0dWRlOiBudW1iZXIsXG4pIHtcbiAgICBjb25zdCB0aW1lID0gZ2V0U3Vuc2V0U3VucmlzZVVUQ1RpbWUoZGF0ZSwgbGF0aXR1ZGUsIGxvbmdpdHVkZSk7XG5cbiAgICBpZiAodGltZS5hbHdheXNEYXkpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH0gZWxzZSBpZiAodGltZS5hbHdheXNOaWdodCkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICBjb25zdCBzdW5yaXNlVGltZSA9IHRpbWUuc3VucmlzZVRpbWU7XG4gICAgY29uc3Qgc3Vuc2V0VGltZSA9IHRpbWUuc3Vuc2V0VGltZTtcbiAgICBjb25zdCBjdXJyZW50VGltZSA9IChcbiAgICAgICAgZGF0ZS5nZXRVVENIb3VycygpICogZ2V0RHVyYXRpb24oe2hvdXJzOiAxfSkgK1xuICAgICAgICBkYXRlLmdldFVUQ01pbnV0ZXMoKSAqIGdldER1cmF0aW9uKHttaW51dGVzOiAxfSkgK1xuICAgICAgICBkYXRlLmdldFVUQ1NlY29uZHMoKSAqIGdldER1cmF0aW9uKHtzZWNvbmRzOiAxfSlcbiAgICApO1xuXG4gICAgaWYgKHN1bnNldFRpbWUgPiBzdW5yaXNlVGltZSkge1xuICAgICAgICByZXR1cm4gKGN1cnJlbnRUaW1lID4gc3Vuc2V0VGltZSkgfHwgKGN1cnJlbnRUaW1lIDwgc3VucmlzZVRpbWUpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiAoY3VycmVudFRpbWUgPiBzdW5zZXRUaW1lKSAmJiAoY3VycmVudFRpbWUgPCBzdW5yaXNlVGltZSk7XG4gICAgfVxufVxuIiwiaW1wb3J0IHtsb2FkQXNEYXRhVVJMLCBsb2FkQXNUZXh0fSBmcm9tICcuLi8uLi91dGlscy9uZXR3b3JrJztcbmltcG9ydCB7Z2V0U3RyaW5nU2l6ZX0gZnJvbSAnLi4vLi4vdXRpbHMvdGV4dCc7XG5pbXBvcnQge2dldER1cmF0aW9ufSBmcm9tICcuLi8uLi91dGlscy90aW1lJztcblxuaW50ZXJmYWNlIFJlcXVlc3RQYXJhbXMge1xuICAgIHVybDogc3RyaW5nO1xuICAgIHRpbWVvdXQ/OiBudW1iZXI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWFkVGV4dChwYXJhbXM6IFJlcXVlc3RQYXJhbXMpOiBQcm9taXNlPHN0cmluZz4ge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgIGNvbnN0IHJlcXVlc3QgPSBuZXcgWE1MSHR0cFJlcXVlc3QoKTtcbiAgICAgICAgcmVxdWVzdC5vdmVycmlkZU1pbWVUeXBlKCd0ZXh0L3BsYWluJyk7XG4gICAgICAgIHJlcXVlc3Qub3BlbignR0VUJywgcGFyYW1zLnVybCwgdHJ1ZSk7XG4gICAgICAgIHJlcXVlc3Qub25sb2FkID0gKCkgPT4ge1xuICAgICAgICAgICAgaWYgKHJlcXVlc3Quc3RhdHVzID49IDIwMCAmJiByZXF1ZXN0LnN0YXR1cyA8IDMwMCkge1xuICAgICAgICAgICAgICAgIHJlc29sdmUocmVxdWVzdC5yZXNwb25zZVRleHQpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZWplY3QobmV3IEVycm9yKGAke3JlcXVlc3Quc3RhdHVzfTogJHtyZXF1ZXN0LnN0YXR1c1RleHR9YCkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICByZXF1ZXN0Lm9uZXJyb3IgPSAoKSA9PiByZWplY3QobmV3IEVycm9yKGAke3JlcXVlc3Quc3RhdHVzfTogJHtyZXF1ZXN0LnN0YXR1c1RleHR9YCkpO1xuICAgICAgICBpZiAocGFyYW1zLnRpbWVvdXQpIHtcbiAgICAgICAgICAgIHJlcXVlc3QudGltZW91dCA9IHBhcmFtcy50aW1lb3V0O1xuICAgICAgICAgICAgcmVxdWVzdC5vbnRpbWVvdXQgPSAoKSA9PiByZWplY3QobmV3IEVycm9yKCdGaWxlIGxvYWRpbmcgc3RvcHBlZCBkdWUgdG8gdGltZW91dCcpKTtcbiAgICAgICAgfVxuICAgICAgICByZXF1ZXN0LnNlbmQoKTtcbiAgICB9KTtcbn1cblxuaW50ZXJmYWNlIENhY2hlUmVjb3JkIHtcbiAgICBleHBpcmVzOiBudW1iZXI7XG4gICAgc2l6ZTogbnVtYmVyO1xuICAgIHVybDogc3RyaW5nO1xuICAgIHZhbHVlOiBzdHJpbmc7XG59XG5cbmNsYXNzIExpbWl0ZWRDYWNoZVN0b3JhZ2Uge1xuICAgIHN0YXRpYyBRVU9UQV9CWVRFUyA9ICgobmF2aWdhdG9yIGFzIGFueSkuZGV2aWNlTWVtb3J5IHx8IDQpICogMTYgKiAxMDI0ICogMTAyNDtcbiAgICBzdGF0aWMgVFRMID0gZ2V0RHVyYXRpb24oe21pbnV0ZXM6IDEwfSk7XG5cbiAgICBwcml2YXRlIGJ5dGVzSW5Vc2UgPSAwO1xuICAgIHByaXZhdGUgcmVjb3JkcyA9IG5ldyBNYXA8c3RyaW5nLCBDYWNoZVJlY29yZD4oKTtcblxuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICBzZXRJbnRlcnZhbCgoKSA9PiB0aGlzLnJlbW92ZUV4cGlyZWRSZWNvcmRzKCksIGdldER1cmF0aW9uKHttaW51dGVzOiAxfSkpO1xuICAgIH1cblxuICAgIGhhcyh1cmw6IHN0cmluZykge1xuICAgICAgICByZXR1cm4gdGhpcy5yZWNvcmRzLmhhcyh1cmwpO1xuICAgIH1cblxuICAgIGdldCh1cmw6IHN0cmluZykge1xuICAgICAgICBpZiAodGhpcy5yZWNvcmRzLmhhcyh1cmwpKSB7XG4gICAgICAgICAgICBjb25zdCByZWNvcmQgPSB0aGlzLnJlY29yZHMuZ2V0KHVybCk7XG4gICAgICAgICAgICByZWNvcmQuZXhwaXJlcyA9IERhdGUubm93KCkgKyBMaW1pdGVkQ2FjaGVTdG9yYWdlLlRUTDtcbiAgICAgICAgICAgIHRoaXMucmVjb3Jkcy5kZWxldGUodXJsKTtcbiAgICAgICAgICAgIHRoaXMucmVjb3Jkcy5zZXQodXJsLCByZWNvcmQpO1xuICAgICAgICAgICAgcmV0dXJuIHJlY29yZC52YWx1ZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBzZXQodXJsOiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcpIHtcbiAgICAgICAgY29uc3Qgc2l6ZSA9IGdldFN0cmluZ1NpemUodmFsdWUpO1xuICAgICAgICBpZiAoc2l6ZSA+IExpbWl0ZWRDYWNoZVN0b3JhZ2UuUVVPVEFfQllURVMpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGZvciAoY29uc3QgW3VybCwgcmVjb3JkXSBvZiB0aGlzLnJlY29yZHMpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLmJ5dGVzSW5Vc2UgKyBzaXplID4gTGltaXRlZENhY2hlU3RvcmFnZS5RVU9UQV9CWVRFUykge1xuICAgICAgICAgICAgICAgIHRoaXMucmVjb3Jkcy5kZWxldGUodXJsKTtcbiAgICAgICAgICAgICAgICB0aGlzLmJ5dGVzSW5Vc2UgLT0gcmVjb3JkLnNpemU7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgZXhwaXJlcyA9IERhdGUubm93KCkgKyBMaW1pdGVkQ2FjaGVTdG9yYWdlLlRUTDtcbiAgICAgICAgdGhpcy5yZWNvcmRzLnNldCh1cmwsIHt1cmwsIHZhbHVlLCBzaXplLCBleHBpcmVzfSk7XG4gICAgICAgIHRoaXMuYnl0ZXNJblVzZSArPSBzaXplO1xuICAgIH1cblxuICAgIHByaXZhdGUgcmVtb3ZlRXhwaXJlZFJlY29yZHMoKSB7XG4gICAgICAgIGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG4gICAgICAgIGZvciAoY29uc3QgW3VybCwgcmVjb3JkXSBvZiB0aGlzLnJlY29yZHMpIHtcbiAgICAgICAgICAgIGlmIChyZWNvcmQuZXhwaXJlcyA8IG5vdykge1xuICAgICAgICAgICAgICAgIHRoaXMucmVjb3Jkcy5kZWxldGUodXJsKTtcbiAgICAgICAgICAgICAgICB0aGlzLmJ5dGVzSW5Vc2UgLT0gcmVjb3JkLnNpemU7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxufVxuXG5pbnRlcmZhY2UgRmV0Y2hSZXF1ZXN0UGFyYW1ldGVycyB7XG4gICAgdXJsOiBzdHJpbmc7XG4gICAgcmVzcG9uc2VUeXBlOiAnZGF0YS11cmwnIHwgJ3RleHQnO1xuICAgIG1pbWVUeXBlPzogc3RyaW5nO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlRmlsZUxvYWRlcigpIHtcbiAgICBjb25zdCBjYWNoZXMgPSB7XG4gICAgICAgICdkYXRhLXVybCc6IG5ldyBMaW1pdGVkQ2FjaGVTdG9yYWdlKCksXG4gICAgICAgICd0ZXh0JzogbmV3IExpbWl0ZWRDYWNoZVN0b3JhZ2UoKSxcbiAgICB9O1xuXG4gICAgY29uc3QgbG9hZGVycyA9IHtcbiAgICAgICAgJ2RhdGEtdXJsJzogbG9hZEFzRGF0YVVSTCxcbiAgICAgICAgJ3RleHQnOiBsb2FkQXNUZXh0LFxuICAgIH07XG5cbiAgICBhc3luYyBmdW5jdGlvbiBnZXQoe3VybCwgcmVzcG9uc2VUeXBlLCBtaW1lVHlwZX06IEZldGNoUmVxdWVzdFBhcmFtZXRlcnMpIHtcbiAgICAgICAgY29uc3QgY2FjaGUgPSBjYWNoZXNbcmVzcG9uc2VUeXBlXTtcbiAgICAgICAgY29uc3QgbG9hZCA9IGxvYWRlcnNbcmVzcG9uc2VUeXBlXTtcbiAgICAgICAgaWYgKGNhY2hlLmhhcyh1cmwpKSB7XG4gICAgICAgICAgICByZXR1cm4gY2FjaGUuZ2V0KHVybCk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBkYXRhID0gYXdhaXQgbG9hZCh1cmwsIG1pbWVUeXBlKTtcbiAgICAgICAgY2FjaGUuc2V0KHVybCwgZGF0YSk7XG4gICAgICAgIHJldHVybiBkYXRhO1xuICAgIH1cblxuICAgIHJldHVybiB7Z2V0fTtcbn1cbiIsImZ1bmN0aW9uIGlzQXJyYXlMaWtlPFQ+KGl0ZW1zOiBJdGVyYWJsZTxUPiB8IEFycmF5TGlrZTxUPik6IGl0ZW1zIGlzIEFycmF5TGlrZTxUPiB7XG4gICAgcmV0dXJuIChpdGVtcyBhcyBBcnJheUxpa2U8VD4pLmxlbmd0aCAhPSBudWxsO1xufVxuXG4vLyBOT1RFOiBJdGVyYXRpbmcgQXJyYXktbGlrZSBpdGVtcyB1c2luZyBgZm9yIC4uIG9mYCBpcyAzeCBzbG93ZXIgaW4gRmlyZWZveFxuLy8gaHR0cHM6Ly9qc2Jlbi5jaC9raWRPcFxuZXhwb3J0IGZ1bmN0aW9uIGZvckVhY2g8VD4oaXRlbXM6IEl0ZXJhYmxlPFQ+IHwgQXJyYXlMaWtlPFQ+LCBpdGVyYXRvcjogKGl0ZW06IFQpID0+IHZvaWQpIHtcbiAgICBpZiAoaXNBcnJheUxpa2UoaXRlbXMpKSB7XG4gICAgICAgIGZvciAobGV0IGkgPSAwLCBsZW4gPSBpdGVtcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuICAgICAgICAgICAgaXRlcmF0b3IoaXRlbXNbaV0pO1xuICAgICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgICAgZm9yIChjb25zdCBpdGVtIG9mIGl0ZW1zKSB7XG4gICAgICAgICAgICBpdGVyYXRvcihpdGVtKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuLy8gTk9URTogUHVzaGluZyBpdGVtcyBsaWtlIGBhcnIucHVzaCguLi5pdGVtcylgIGlzIDN4IHNsb3dlciBpbiBGaXJlZm94XG4vLyBodHRwczovL2pzYmVuLmNoL25yOU9GXG5leHBvcnQgZnVuY3Rpb24gcHVzaDxUPihhcnJheTogQXJyYXk8VD4sIGFkZGl0aW9uOiBJdGVyYWJsZTxUPiB8IEFycmF5TGlrZTxUPikge1xuICAgIGZvckVhY2goYWRkaXRpb24sIChhKSA9PiBhcnJheS5wdXNoKGEpKTtcbn1cblxuLy8gTk9URTogVXNpbmcgYEFycmF5LmZyb20oKWAgaXMgMnggKEZGKSDigJQgNXggKENocm9tZSkgc2xvd2VyIGZvciBBcnJheUxpa2UgKG5vdCBmb3IgSXRlcmFibGUpXG4vLyBodHRwczovL2pzYmVuLmNoL0ZKMW1PXG4vLyBodHRwczovL2pzYmVuLmNoL1ptVmlMXG5leHBvcnQgZnVuY3Rpb24gdG9BcnJheTxUPihpdGVtczogQXJyYXlMaWtlPFQ+KSB7XG4gICAgY29uc3QgcmVzdWx0cyA9IFtdIGFzIEFycmF5PFQ+O1xuICAgIGZvciAobGV0IGkgPSAwLCBsZW4gPSBpdGVtcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuICAgICAgICByZXN1bHRzLnB1c2goaXRlbXNbaV0pO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0cztcbn1cbiIsImltcG9ydCB7cHVzaH0gZnJvbSAnLi4vLi4vdXRpbHMvYXJyYXknO1xuXG5pbnRlcmZhY2UgU2l0ZUZpeCB7XG4gICAgdXJsOiBzdHJpbmdbXTtcbiAgICBbcHJvcDogc3RyaW5nXTogYW55O1xufVxuXG5pbnRlcmZhY2UgU2l0ZXNGaXhlc0Zvcm1hdE9wdGlvbnMge1xuICAgIHByb3BzOiBzdHJpbmdbXTtcbiAgICBnZXRQcm9wQ29tbWFuZE5hbWU6IChwcm9wOiBzdHJpbmcpID0+IHN0cmluZztcbiAgICBmb3JtYXRQcm9wVmFsdWU6IChwcm9wOiBzdHJpbmcsIHZhbHVlKSA9PiBzdHJpbmc7XG4gICAgc2hvdWxkSWdub3JlUHJvcDogKHByb3BzOiBzdHJpbmcsIHZhbHVlKSA9PiBib29sZWFuO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZm9ybWF0U2l0ZXNGaXhlc0NvbmZpZyhmaXhlczogU2l0ZUZpeFtdLCBvcHRpb25zOiBTaXRlc0ZpeGVzRm9ybWF0T3B0aW9ucykge1xuICAgIGNvbnN0IGxpbmVzOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgZml4ZXMuZm9yRWFjaCgoZml4LCBpKSA9PiB7XG4gICAgICAgIHB1c2gobGluZXMsIGZpeC51cmwpO1xuICAgICAgICBvcHRpb25zLnByb3BzLmZvckVhY2goKHByb3ApID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGNvbW1hbmQgPSBvcHRpb25zLmdldFByb3BDb21tYW5kTmFtZShwcm9wKTtcbiAgICAgICAgICAgIGNvbnN0IHZhbHVlID0gZml4W3Byb3BdO1xuICAgICAgICAgICAgaWYgKG9wdGlvbnMuc2hvdWxkSWdub3JlUHJvcChwcm9wLCB2YWx1ZSkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBsaW5lcy5wdXNoKCcnKTtcbiAgICAgICAgICAgIGxpbmVzLnB1c2goY29tbWFuZCk7XG4gICAgICAgICAgICBjb25zdCBmb3JtYXR0ZWRWYWx1ZSA9IG9wdGlvbnMuZm9ybWF0UHJvcFZhbHVlKHByb3AsIHZhbHVlKTtcbiAgICAgICAgICAgIGlmIChmb3JtYXR0ZWRWYWx1ZSkge1xuICAgICAgICAgICAgICAgIGxpbmVzLnB1c2goZm9ybWF0dGVkVmFsdWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgaWYgKGkgPCBmaXhlcy5sZW5ndGggLSAxKSB7XG4gICAgICAgICAgICBsaW5lcy5wdXNoKCcnKTtcbiAgICAgICAgICAgIGxpbmVzLnB1c2goJz0nLnJlcGVhdCgzMikpO1xuICAgICAgICAgICAgbGluZXMucHVzaCgnJyk7XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIGxpbmVzLnB1c2goJycpO1xuICAgIHJldHVybiBsaW5lcy5qb2luKCdcXG4nKTtcbn1cbiIsImV4cG9ydCBmdW5jdGlvbiBzY2FsZSh4OiBudW1iZXIsIGluTG93OiBudW1iZXIsIGluSGlnaDogbnVtYmVyLCBvdXRMb3c6IG51bWJlciwgb3V0SGlnaDogbnVtYmVyKSB7XG4gICAgcmV0dXJuICh4IC0gaW5Mb3cpICogKG91dEhpZ2ggLSBvdXRMb3cpIC8gKGluSGlnaCAtIGluTG93KSArIG91dExvdztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNsYW1wKHg6IG51bWJlciwgbWluOiBudW1iZXIsIG1heDogbnVtYmVyKSB7XG4gICAgcmV0dXJuIE1hdGgubWluKG1heCwgTWF0aC5tYXgobWluLCB4KSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtdWx0aXBseU1hdHJpY2VzKG0xOiBudW1iZXJbXVtdLCBtMjogbnVtYmVyW11bXSkge1xuICAgIGNvbnN0IHJlc3VsdDogbnVtYmVyW11bXSA9IFtdO1xuICAgIGZvciAobGV0IGkgPSAwLCBsZW4gPSBtMS5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuICAgICAgICByZXN1bHRbaV0gPSBbXTtcbiAgICAgICAgZm9yIChsZXQgaiA9IDAsIGxlbjIgPSBtMlswXS5sZW5ndGg7IGogPCBsZW4yOyBqKyspIHtcbiAgICAgICAgICAgIGxldCBzdW0gPSAwO1xuICAgICAgICAgICAgZm9yIChsZXQgayA9IDAsIGxlbjMgPSBtMVswXS5sZW5ndGg7IGsgPCBsZW4zOyBrKyspIHtcbiAgICAgICAgICAgICAgICBzdW0gKz0gbTFbaV1ba10gKiBtMltrXVtqXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJlc3VsdFtpXVtqXSA9IHN1bTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xufVxuIiwiaW1wb3J0IHtjbGFtcCwgbXVsdGlwbHlNYXRyaWNlc30gZnJvbSAnLi4vLi4vdXRpbHMvbWF0aCc7XG5pbXBvcnQge0ZpbHRlckNvbmZpZ30gZnJvbSAnLi4vLi4vZGVmaW5pdGlvbnMnO1xuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlRmlsdGVyTWF0cml4KGNvbmZpZzogRmlsdGVyQ29uZmlnKSB7XG4gICAgbGV0IG0gPSBNYXRyaXguaWRlbnRpdHkoKTtcbiAgICBpZiAoY29uZmlnLnNlcGlhICE9PSAwKSB7XG4gICAgICAgIG0gPSBtdWx0aXBseU1hdHJpY2VzKG0sIE1hdHJpeC5zZXBpYShjb25maWcuc2VwaWEgLyAxMDApKTtcbiAgICB9XG4gICAgaWYgKGNvbmZpZy5ncmF5c2NhbGUgIT09IDApIHtcbiAgICAgICAgbSA9IG11bHRpcGx5TWF0cmljZXMobSwgTWF0cml4LmdyYXlzY2FsZShjb25maWcuZ3JheXNjYWxlIC8gMTAwKSk7XG4gICAgfVxuICAgIGlmIChjb25maWcuY29udHJhc3QgIT09IDEwMCkge1xuICAgICAgICBtID0gbXVsdGlwbHlNYXRyaWNlcyhtLCBNYXRyaXguY29udHJhc3QoY29uZmlnLmNvbnRyYXN0IC8gMTAwKSk7XG4gICAgfVxuICAgIGlmIChjb25maWcuYnJpZ2h0bmVzcyAhPT0gMTAwKSB7XG4gICAgICAgIG0gPSBtdWx0aXBseU1hdHJpY2VzKG0sIE1hdHJpeC5icmlnaHRuZXNzKGNvbmZpZy5icmlnaHRuZXNzIC8gMTAwKSk7XG4gICAgfVxuICAgIGlmIChjb25maWcubW9kZSA9PT0gMSkge1xuICAgICAgICBtID0gbXVsdGlwbHlNYXRyaWNlcyhtLCBNYXRyaXguaW52ZXJ0Tkh1ZSgpKTtcbiAgICB9XG4gICAgcmV0dXJuIG07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhcHBseUNvbG9yTWF0cml4KFtyLCBnLCBiXTogbnVtYmVyW10sIG1hdHJpeDogbnVtYmVyW11bXSkge1xuICAgIGNvbnN0IHJnYiA9IFtbciAvIDI1NV0sIFtnIC8gMjU1XSwgW2IgLyAyNTVdLCBbMV0sIFsxXV07XG4gICAgY29uc3QgcmVzdWx0ID0gbXVsdGlwbHlNYXRyaWNlcyhtYXRyaXgsIHJnYik7XG4gICAgcmV0dXJuIFswLCAxLCAyXS5tYXAoKGkpID0+IGNsYW1wKE1hdGgucm91bmQocmVzdWx0W2ldWzBdICogMjU1KSwgMCwgMjU1KSk7XG59XG5cbmV4cG9ydCBjb25zdCBNYXRyaXggPSB7XG5cbiAgICBpZGVudGl0eSgpIHtcbiAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgIFsxLCAwLCAwLCAwLCAwXSxcbiAgICAgICAgICAgIFswLCAxLCAwLCAwLCAwXSxcbiAgICAgICAgICAgIFswLCAwLCAxLCAwLCAwXSxcbiAgICAgICAgICAgIFswLCAwLCAwLCAxLCAwXSxcbiAgICAgICAgICAgIFswLCAwLCAwLCAwLCAxXVxuICAgICAgICBdO1xuICAgIH0sXG5cbiAgICBpbnZlcnROSHVlKCkge1xuICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgWzAuMzMzLCAtMC42NjcsIC0wLjY2NywgMCwgMV0sXG4gICAgICAgICAgICBbLTAuNjY3LCAwLjMzMywgLTAuNjY3LCAwLCAxXSxcbiAgICAgICAgICAgIFstMC42NjcsIC0wLjY2NywgMC4zMzMsIDAsIDFdLFxuICAgICAgICAgICAgWzAsIDAsIDAsIDEsIDBdLFxuICAgICAgICAgICAgWzAsIDAsIDAsIDAsIDFdXG4gICAgICAgIF07XG4gICAgfSxcblxuICAgIGJyaWdodG5lc3ModjogbnVtYmVyKSB7XG4gICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICBbdiwgMCwgMCwgMCwgMF0sXG4gICAgICAgICAgICBbMCwgdiwgMCwgMCwgMF0sXG4gICAgICAgICAgICBbMCwgMCwgdiwgMCwgMF0sXG4gICAgICAgICAgICBbMCwgMCwgMCwgMSwgMF0sXG4gICAgICAgICAgICBbMCwgMCwgMCwgMCwgMV1cbiAgICAgICAgXTtcbiAgICB9LFxuXG4gICAgY29udHJhc3QodjogbnVtYmVyKSB7XG4gICAgICAgIGNvbnN0IHQgPSAoMSAtIHYpIC8gMjtcbiAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgIFt2LCAwLCAwLCAwLCB0XSxcbiAgICAgICAgICAgIFswLCB2LCAwLCAwLCB0XSxcbiAgICAgICAgICAgIFswLCAwLCB2LCAwLCB0XSxcbiAgICAgICAgICAgIFswLCAwLCAwLCAxLCAwXSxcbiAgICAgICAgICAgIFswLCAwLCAwLCAwLCAxXVxuICAgICAgICBdO1xuICAgIH0sXG5cbiAgICBzZXBpYSh2OiBudW1iZXIpIHtcbiAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgIFsoMC4zOTMgKyAwLjYwNyAqICgxIC0gdikpLCAoMC43NjkgLSAwLjc2OSAqICgxIC0gdikpLCAoMC4xODkgLSAwLjE4OSAqICgxIC0gdikpLCAwLCAwXSxcbiAgICAgICAgICAgIFsoMC4zNDkgLSAwLjM0OSAqICgxIC0gdikpLCAoMC42ODYgKyAwLjMxNCAqICgxIC0gdikpLCAoMC4xNjggLSAwLjE2OCAqICgxIC0gdikpLCAwLCAwXSxcbiAgICAgICAgICAgIFsoMC4yNzIgLSAwLjI3MiAqICgxIC0gdikpLCAoMC41MzQgLSAwLjUzNCAqICgxIC0gdikpLCAoMC4xMzEgKyAwLjg2OSAqICgxIC0gdikpLCAwLCAwXSxcbiAgICAgICAgICAgIFswLCAwLCAwLCAxLCAwXSxcbiAgICAgICAgICAgIFswLCAwLCAwLCAwLCAxXVxuICAgICAgICBdO1xuICAgIH0sXG5cbiAgICBncmF5c2NhbGUodjogbnVtYmVyKSB7XG4gICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICBbKDAuMjEyNiArIDAuNzg3NCAqICgxIC0gdikpLCAoMC43MTUyIC0gMC43MTUyICogKDEgLSB2KSksICgwLjA3MjIgLSAwLjA3MjIgKiAoMSAtIHYpKSwgMCwgMF0sXG4gICAgICAgICAgICBbKDAuMjEyNiAtIDAuMjEyNiAqICgxIC0gdikpLCAoMC43MTUyICsgMC4yODQ4ICogKDEgLSB2KSksICgwLjA3MjIgLSAwLjA3MjIgKiAoMSAtIHYpKSwgMCwgMF0sXG4gICAgICAgICAgICBbKDAuMjEyNiAtIDAuMjEyNiAqICgxIC0gdikpLCAoMC43MTUyIC0gMC43MTUyICogKDEgLSB2KSksICgwLjA3MjIgKyAwLjkyNzggKiAoMSAtIHYpKSwgMCwgMF0sXG4gICAgICAgICAgICBbMCwgMCwgMCwgMSwgMF0sXG4gICAgICAgICAgICBbMCwgMCwgMCwgMCwgMV1cbiAgICAgICAgXTtcbiAgICB9LFxufTtcbiIsImltcG9ydCB7cGFyc2VBcnJheX0gZnJvbSAnLi4vLi4vdXRpbHMvdGV4dCc7XG5cbmludGVyZmFjZSBTaXRlUHJvcHMge1xuICAgIHVybDogc3RyaW5nW107XG59XG5cbmludGVyZmFjZSBTaXRlc0ZpeGVzUGFyc2VyT3B0aW9ucyB7XG4gICAgY29tbWFuZHM6IHN0cmluZ1tdO1xuICAgIGdldENvbW1hbmRQcm9wTmFtZTogKGNvbW1hbmQ6IHN0cmluZykgPT4gc3RyaW5nO1xuICAgIHBhcnNlQ29tbWFuZFZhbHVlOiAoY29tbWFuZDogc3RyaW5nLCB2YWx1ZTogc3RyaW5nKSA9PiBhbnk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZVNpdGVzRml4ZXNDb25maWc8VCBleHRlbmRzIFNpdGVQcm9wcz4odGV4dDogc3RyaW5nLCBvcHRpb25zOiBTaXRlc0ZpeGVzUGFyc2VyT3B0aW9ucykge1xuICAgIGNvbnN0IHNpdGVzOiBUW10gPSBbXTtcblxuICAgIGNvbnN0IGJsb2NrcyA9IHRleHQucmVwbGFjZSgvXFxyL2csICcnKS5zcGxpdCgvXlxccyo9ezIsfVxccyokL2dtKTtcbiAgICBibG9ja3MuZm9yRWFjaCgoYmxvY2spID0+IHtcbiAgICAgICAgY29uc3QgbGluZXMgPSBibG9jay5zcGxpdCgnXFxuJyk7XG4gICAgICAgIGNvbnN0IGNvbW1hbmRJbmRpY2VzOiBudW1iZXJbXSA9IFtdO1xuICAgICAgICBsaW5lcy5mb3JFYWNoKChsbiwgaSkgPT4ge1xuICAgICAgICAgICAgaWYgKGxuLm1hdGNoKC9eXFxzKltBLVpdKyhcXHNbQS1aXSspKlxccyokLykpIHtcbiAgICAgICAgICAgICAgICBjb21tYW5kSW5kaWNlcy5wdXNoKGkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBpZiAoY29tbWFuZEluZGljZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBzaXRlRml4ID0ge1xuICAgICAgICAgICAgdXJsOiBwYXJzZUFycmF5KGxpbmVzLnNsaWNlKDAsIGNvbW1hbmRJbmRpY2VzWzBdKS5qb2luKCdcXG4nKSkgYXMgc3RyaW5nW10sXG4gICAgICAgIH0gYXMgVDtcblxuICAgICAgICBjb21tYW5kSW5kaWNlcy5mb3JFYWNoKChjb21tYW5kSW5kZXgsIGkpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGNvbW1hbmQgPSBsaW5lc1tjb21tYW5kSW5kZXhdLnRyaW0oKTtcbiAgICAgICAgICAgIGNvbnN0IHZhbHVlVGV4dCA9IGxpbmVzLnNsaWNlKGNvbW1hbmRJbmRleCArIDEsIGkgPT09IGNvbW1hbmRJbmRpY2VzLmxlbmd0aCAtIDEgPyBsaW5lcy5sZW5ndGggOiBjb21tYW5kSW5kaWNlc1tpICsgMV0pLmpvaW4oJ1xcbicpO1xuICAgICAgICAgICAgY29uc3QgcHJvcCA9IG9wdGlvbnMuZ2V0Q29tbWFuZFByb3BOYW1lKGNvbW1hbmQpO1xuICAgICAgICAgICAgaWYgKCFwcm9wKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgdmFsdWUgPSBvcHRpb25zLnBhcnNlQ29tbWFuZFZhbHVlKGNvbW1hbmQsIHZhbHVlVGV4dCk7XG4gICAgICAgICAgICBzaXRlRml4W3Byb3BdID0gdmFsdWU7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHNpdGVzLnB1c2goc2l0ZUZpeCk7XG4gICAgfSk7XG5cbiAgICByZXR1cm4gc2l0ZXM7XG59XG4iLCJleHBvcnQgZnVuY3Rpb24gaXNJUFY2KHVybDogc3RyaW5nKSB7XG4gICAgY29uc3Qgb3BlbmluZ0JyYWNrZXRJbmRleCA9IHVybC5pbmRleE9mKCdbJyk7XG4gICAgaWYgKG9wZW5pbmdCcmFja2V0SW5kZXggPCAwKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgY29uc3QgcXVlcnlJbmRleCA9IHVybC5pbmRleE9mKCc/Jyk7XG4gICAgaWYgKHF1ZXJ5SW5kZXggPj0gMCAmJiBvcGVuaW5nQnJhY2tldEluZGV4ID4gcXVlcnlJbmRleCkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xufVxuXG5jb25zdCBpcFY2SG9zdFJlZ2V4ID0gL1xcWy4qP1xcXShcXDpcXGQrKT8vO1xuXG5leHBvcnQgZnVuY3Rpb24gY29tcGFyZUlQVjYoZmlyc3RVUkw6IHN0cmluZywgc2Vjb25kVVJMOiBzdHJpbmcpIHtcbiAgICBjb25zdCBmaXJzdEhvc3QgPSBmaXJzdFVSTC5tYXRjaChpcFY2SG9zdFJlZ2V4KVswXTtcbiAgICBjb25zdCBzZWNvbmRIb3N0ID0gc2Vjb25kVVJMLm1hdGNoKGlwVjZIb3N0UmVnZXgpWzBdO1xuICAgIHJldHVybiBmaXJzdEhvc3QgPT09IHNlY29uZEhvc3Q7XG59XG4iLCJpbXBvcnQge1VzZXJTZXR0aW5nc30gZnJvbSAnLi4vZGVmaW5pdGlvbnMnO1xuaW1wb3J0IHtpc0lQVjYsIGNvbXBhcmVJUFY2fSBmcm9tICcuL2lwdjYnO1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0VVJMSG9zdE9yUHJvdG9jb2woJHVybDogc3RyaW5nKSB7XG4gICAgY29uc3QgdXJsID0gbmV3IFVSTCgkdXJsKTtcbiAgICBpZiAodXJsLmhvc3QpIHtcbiAgICAgICAgcmV0dXJuIHVybC5ob3N0O1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiB1cmwucHJvdG9jb2w7XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gY29tcGFyZVVSTFBhdHRlcm5zKGE6IHN0cmluZywgYjogc3RyaW5nKSB7XG4gICAgcmV0dXJuIGEubG9jYWxlQ29tcGFyZShiKTtcbn1cblxuLyoqXG4gKiBEZXRlcm1pbmVzIHdoZXRoZXIgVVJMIGhhcyBhIG1hdGNoIGluIFVSTCB0ZW1wbGF0ZSBsaXN0LlxuICogQHBhcmFtIHVybCBTaXRlIFVSTC5cbiAqIEBwYXJhbWxpc3QgTGlzdCB0byBzZWFyY2ggaW50by5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGlzVVJMSW5MaXN0KHVybDogc3RyaW5nLCBsaXN0OiBzdHJpbmdbXSkge1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbGlzdC5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAoaXNVUkxNYXRjaGVkKHVybCwgbGlzdFtpXSkpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbn1cblxuLyoqXG4gKiBEZXRlcm1pbmVzIHdoZXRoZXIgVVJMIG1hdGNoZXMgdGhlIHRlbXBsYXRlLlxuICogQHBhcmFtIHVybCBVUkwuXG4gKiBAcGFyYW0gdXJsVGVtcGxhdGUgVVJMIHRlbXBsYXRlIChcImdvb2dsZS4qXCIsIFwieW91dHViZS5jb21cIiBldGMpLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaXNVUkxNYXRjaGVkKHVybDogc3RyaW5nLCB1cmxUZW1wbGF0ZTogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgY29uc3QgaXNGaXJzdElQVjYgPSBpc0lQVjYodXJsKTtcbiAgICBjb25zdCBpc1NlY29uZElQVjYgPSBpc0lQVjYodXJsVGVtcGxhdGUpO1xuICAgIGlmIChpc0ZpcnN0SVBWNiAmJiBpc1NlY29uZElQVjYpIHtcbiAgICAgICAgcmV0dXJuIGNvbXBhcmVJUFY2KHVybCwgdXJsVGVtcGxhdGUpO1xuICAgIH0gZWxzZSBpZiAoIWlzU2Vjb25kSVBWNiAmJiAhaXNTZWNvbmRJUFY2KSB7XG4gICAgICAgIGNvbnN0IHJlZ2V4ID0gY3JlYXRlVXJsUmVnZXgodXJsVGVtcGxhdGUpO1xuICAgICAgICByZXR1cm4gQm9vbGVhbih1cmwubWF0Y2gocmVnZXgpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBjcmVhdGVVcmxSZWdleCh1cmxUZW1wbGF0ZTogc3RyaW5nKTogUmVnRXhwIHtcbiAgICB1cmxUZW1wbGF0ZSA9IHVybFRlbXBsYXRlLnRyaW0oKTtcbiAgICBjb25zdCBleGFjdEJlZ2lubmluZyA9ICh1cmxUZW1wbGF0ZVswXSA9PT0gJ14nKTtcbiAgICBjb25zdCBleGFjdEVuZGluZyA9ICh1cmxUZW1wbGF0ZVt1cmxUZW1wbGF0ZS5sZW5ndGggLSAxXSA9PT0gJyQnKTtcblxuICAgIHVybFRlbXBsYXRlID0gKHVybFRlbXBsYXRlXG4gICAgICAgIC5yZXBsYWNlKC9eXFxeLywgJycpIC8vIFJlbW92ZSBeIGF0IHN0YXJ0XG4gICAgICAgIC5yZXBsYWNlKC9cXCQkLywgJycpIC8vIFJlbW92ZSAkIGF0IGVuZFxuICAgICAgICAucmVwbGFjZSgvXi4qP1xcL3syLDN9LywgJycpIC8vIFJlbW92ZSBzY2hlbWVcbiAgICAgICAgLnJlcGxhY2UoL1xcPy4qJC8sICcnKSAvLyBSZW1vdmUgcXVlcnlcbiAgICAgICAgLnJlcGxhY2UoL1xcLyQvLCAnJykgLy8gUmVtb3ZlIGxhc3Qgc2xhc2hcbiAgICApO1xuXG4gICAgbGV0IHNsYXNoSW5kZXg6IG51bWJlcjtcbiAgICBsZXQgYmVmb3JlU2xhc2g6IHN0cmluZztcbiAgICBsZXQgYWZ0ZXJTbGFzaDogc3RyaW5nO1xuICAgIGlmICgoc2xhc2hJbmRleCA9IHVybFRlbXBsYXRlLmluZGV4T2YoJy8nKSkgPj0gMCkge1xuICAgICAgICBiZWZvcmVTbGFzaCA9IHVybFRlbXBsYXRlLnN1YnN0cmluZygwLCBzbGFzaEluZGV4KTsgLy8gZ29vZ2xlLipcbiAgICAgICAgYWZ0ZXJTbGFzaCA9IHVybFRlbXBsYXRlLnJlcGxhY2UoJyQnLCAnJykuc3Vic3RyaW5nKHNsYXNoSW5kZXgpOyAvLyAvbG9naW4vYWJjXG4gICAgfSBlbHNlIHtcbiAgICAgICAgYmVmb3JlU2xhc2ggPSB1cmxUZW1wbGF0ZS5yZXBsYWNlKCckJywgJycpO1xuICAgIH1cblxuICAgIC8vXG4gICAgLy8gU0NIRU1FIGFuZCBTVUJET01BSU5TXG5cbiAgICBsZXQgcmVzdWx0ID0gKGV4YWN0QmVnaW5uaW5nID9cbiAgICAgICAgJ14oLio/XFxcXDpcXFxcL3syLDN9KT8nIC8vIFNjaGVtZVxuICAgICAgICA6ICdeKC4qP1xcXFw6XFxcXC97MiwzfSk/KFteXFwvXSo/XFxcXC4pPycgLy8gU2NoZW1lIGFuZCBzdWJkb21haW5zXG4gICAgKTtcblxuICAgIC8vXG4gICAgLy8gSE9TVCBhbmQgUE9SVFxuXG4gICAgY29uc3QgaG9zdFBhcnRzID0gYmVmb3JlU2xhc2guc3BsaXQoJy4nKTtcbiAgICByZXN1bHQgKz0gJygnO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgaG9zdFBhcnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmIChob3N0UGFydHNbaV0gPT09ICcqJykge1xuICAgICAgICAgICAgaG9zdFBhcnRzW2ldID0gJ1teXFxcXC5cXFxcL10rPyc7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmVzdWx0ICs9IGhvc3RQYXJ0cy5qb2luKCdcXFxcLicpO1xuICAgIHJlc3VsdCArPSAnKSc7XG5cbiAgICAvL1xuICAgIC8vIFBBVEggYW5kIFFVRVJZXG5cbiAgICBpZiAoYWZ0ZXJTbGFzaCkge1xuICAgICAgICByZXN1bHQgKz0gJygnO1xuICAgICAgICByZXN1bHQgKz0gYWZ0ZXJTbGFzaC5yZXBsYWNlKCcvJywgJ1xcXFwvJyk7XG4gICAgICAgIHJlc3VsdCArPSAnKSc7XG4gICAgfVxuXG4gICAgcmVzdWx0ICs9IChleGFjdEVuZGluZyA/XG4gICAgICAgICcoXFxcXC8/KFxcXFw/W15cXC9dKj8pPykkJyAvLyBBbGwgZm9sbG93aW5nIHF1ZXJpZXNcbiAgICAgICAgOiAnKFxcXFwvPy4qPykkJyAvLyBBbGwgZm9sbG93aW5nIHBhdGhzIGFuZCBxdWVyaWVzXG4gICAgKTtcblxuICAgIC8vXG4gICAgLy8gUmVzdWx0XG5cbiAgICByZXR1cm4gbmV3IFJlZ0V4cChyZXN1bHQsICdpJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1BERih1cmw6IHN0cmluZykge1xuICAgIGlmICh1cmwuaW5jbHVkZXMoJy5wZGYnKSkge1xuICAgICAgICBpZiAodXJsLmluY2x1ZGVzKCc/JykpIHtcbiAgICAgICAgICAgIHVybCA9IHVybC5zdWJzdHJpbmcoMCwgdXJsLmxhc3RJbmRleE9mKCc/JykpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh1cmwuaW5jbHVkZXMoJyMnKSkge1xuICAgICAgICAgICAgdXJsID0gdXJsLnN1YnN0cmluZygwLCB1cmwubGFzdEluZGV4T2YoJyMnKSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHVybC5tYXRjaCgvKHdpa2lwZWRpYXx3aWtpbWVkaWEpLm9yZy9pKSAmJiB1cmwubWF0Y2goLyh3aWtpcGVkaWF8d2lraW1lZGlhKVxcLm9yZ1xcLy4qXFwvW2Etel0rXFw6W15cXDpcXC9dK1xcLnBkZi9pKSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIGlmICh1cmwuZW5kc1dpdGgoJy5wZGYnKSkge1xuICAgICAgICAgICAgZm9yIChsZXQgaSA9IHVybC5sZW5ndGg7IDAgPCBpOyBpLS0pIHtcbiAgICAgICAgICAgICAgICBpZiAodXJsW2ldID09PSAnPScpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodXJsW2ldID09PSAnLycpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzVVJMRW5hYmxlZCh1cmw6IHN0cmluZywgdXNlclNldHRpbmdzOiBVc2VyU2V0dGluZ3MsIHtpc1Byb3RlY3RlZCwgaXNJbkRhcmtMaXN0fSkge1xuICAgIGlmIChpc1Byb3RlY3RlZCAmJiAhdXNlclNldHRpbmdzLmVuYWJsZUZvclByb3RlY3RlZFBhZ2VzKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgaWYgKGlzUERGKHVybCkpIHtcbiAgICAgICAgcmV0dXJuIHVzZXJTZXR0aW5ncy5lbmFibGVGb3JQREY7XG4gICAgfVxuICAgIGNvbnN0IGlzVVJMSW5Vc2VyTGlzdCA9IGlzVVJMSW5MaXN0KHVybCwgdXNlclNldHRpbmdzLnNpdGVMaXN0KTtcbiAgICBpZiAodXNlclNldHRpbmdzLmFwcGx5VG9MaXN0ZWRPbmx5KSB7XG4gICAgICAgIHJldHVybiBpc1VSTEluVXNlckxpc3Q7XG4gICAgfVxuICAgIC8vIFRPRE86IFVzZSBgc2l0ZUxpc3RFbmFibGVkYCwgYHNpdGVMaXN0RGlzYWJsZWRgLCBgZW5hYmxlZEJ5RGVmYXVsdGAgb3B0aW9ucy5cbiAgICAvLyBEZWxldGUgYHNpdGVMaXN0YCBhbmQgYGFwcGx5VG9MaXN0ZWRPbmx5YCBvcHRpb25zLCB0cmFuc2ZlciB1c2VyJ3MgdmFsdWVzLlxuICAgIGNvbnN0IGlzVVJMSW5FbmFibGVkTGlzdCA9IGlzVVJMSW5MaXN0KHVybCwgdXNlclNldHRpbmdzLnNpdGVMaXN0RW5hYmxlZCk7XG4gICAgaWYgKGlzVVJMSW5FbmFibGVkTGlzdCAmJiBpc0luRGFya0xpc3QpIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIHJldHVybiAoIWlzSW5EYXJrTGlzdCAmJiAhaXNVUkxJblVzZXJMaXN0KTtcbn1cbiIsImltcG9ydCB7RmlsdGVyQ29uZmlnfSBmcm9tICcuLi9kZWZpbml0aW9ucyc7XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVUZXh0U3R5bGUoY29uZmlnOiBGaWx0ZXJDb25maWcpOiBzdHJpbmcge1xuICAgIGNvbnN0IGxpbmVzOiBzdHJpbmdbXSA9IFtdO1xuICAgIC8vIERvbid0IHRhcmdldCBwcmUgZWxlbWVudHMgYXMgdGhleSBhcmUgcHJlZm9ybWF0dGVkIGVsZW1lbnQncyBlLmcuIGNvZGUgYmxvY2tzXG4gICAgbGluZXMucHVzaCgnKjpub3QocHJlKSB7Jyk7XG5cbiAgICBpZiAoY29uZmlnLnVzZUZvbnQgJiYgY29uZmlnLmZvbnRGYW1pbHkpIHtcbiAgICAgICAgLy8gVE9ETzogVmFsaWRhdGUuLi5cbiAgICAgICAgbGluZXMucHVzaChgICBmb250LWZhbWlseTogJHtjb25maWcuZm9udEZhbWlseX0gIWltcG9ydGFudDtgKTtcbiAgICB9XG5cbiAgICBpZiAoY29uZmlnLnRleHRTdHJva2UgPiAwKSB7XG4gICAgICAgIGxpbmVzLnB1c2goYCAgLXdlYmtpdC10ZXh0LXN0cm9rZTogJHtjb25maWcudGV4dFN0cm9rZX1weCAhaW1wb3J0YW50O2ApO1xuICAgICAgICBsaW5lcy5wdXNoKGAgIHRleHQtc3Ryb2tlOiAke2NvbmZpZy50ZXh0U3Ryb2tlfXB4ICFpbXBvcnRhbnQ7YCk7XG4gICAgfVxuXG4gICAgbGluZXMucHVzaCgnfScpO1xuXG4gICAgcmV0dXJuIGxpbmVzLmpvaW4oJ1xcbicpO1xufVxuIiwiaW1wb3J0IHtmb3JtYXRTaXRlc0ZpeGVzQ29uZmlnfSBmcm9tICcuL3V0aWxzL2Zvcm1hdCc7XG5pbXBvcnQge2FwcGx5Q29sb3JNYXRyaXgsIGNyZWF0ZUZpbHRlck1hdHJpeH0gZnJvbSAnLi91dGlscy9tYXRyaXgnO1xuaW1wb3J0IHtwYXJzZVNpdGVzRml4ZXNDb25maWd9IGZyb20gJy4vdXRpbHMvcGFyc2UnO1xuaW1wb3J0IHtwYXJzZUFycmF5LCBmb3JtYXRBcnJheX0gZnJvbSAnLi4vdXRpbHMvdGV4dCc7XG5pbXBvcnQge2NvbXBhcmVVUkxQYXR0ZXJucywgaXNVUkxJbkxpc3R9IGZyb20gJy4uL3V0aWxzL3VybCc7XG5pbXBvcnQge2NyZWF0ZVRleHRTdHlsZX0gZnJvbSAnLi90ZXh0LXN0eWxlJztcbmltcG9ydCB7RmlsdGVyQ29uZmlnLCBJbnZlcnNpb25GaXh9IGZyb20gJy4uL2RlZmluaXRpb25zJztcbmltcG9ydCB7Y29tcGFyZUNocm9tZVZlcnNpb25zLCBnZXRDaHJvbWVWZXJzaW9uLCBpc0Nocm9taXVtQmFzZWR9IGZyb20gJy4uL3V0aWxzL3BsYXRmb3JtJztcblxuZXhwb3J0IGVudW0gRmlsdGVyTW9kZSB7XG4gICAgbGlnaHQgPSAwLFxuICAgIGRhcmsgPSAxXG59XG5cbi8qKlxuICogVGhpcyBjaGVja3MgaWYgdGhlIGN1cnJlbnQgY2hyb21pdW0gdmVyc2lvbiBoYXMgdGhlIHBhdGNoIGluIGl0LlxuICogQXMgb2YgQ2hyb21pdW0gdjgxLjAuNDAzNS4wIHRoaXMgaGFzIGJlZW4gdGhlIHNpdHVhdGlvblxuICpcbiAqIEJ1ZyByZXBvcnQ6IGh0dHBzOi8vYnVncy5jaHJvbWl1bS5vcmcvcC9jaHJvbWl1bS9pc3N1ZXMvZGV0YWlsP2lkPTUwMTU4MlxuICogUGF0Y2g6IGh0dHBzOi8vY2hyb21pdW0tcmV2aWV3Lmdvb2dsZXNvdXJjZS5jb20vYy9jaHJvbWl1bS9zcmMvKy8xOTc5MjU4XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBoYXNDaHJvbWl1bUlzc3VlNTAxNTgyKCkge1xuICAgIGNvbnN0IGNocm9tZVZlcnNpb24gPSBnZXRDaHJvbWVWZXJzaW9uKCk7XG4gICAgcmV0dXJuIEJvb2xlYW4oXG4gICAgICAgIGlzQ2hyb21pdW1CYXNlZCgpICYmXG4gICAgICAgIGNvbXBhcmVDaHJvbWVWZXJzaW9ucyhjaHJvbWVWZXJzaW9uLCAnODEuMC40MDM1LjAnKSA+PSAwXG4gICAgKTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gY3JlYXRlQ1NTRmlsdGVyU3R5bGVoZWV0KGNvbmZpZzogRmlsdGVyQ29uZmlnLCB1cmw6IHN0cmluZywgZnJhbWVVUkw6IHN0cmluZywgaW52ZXJzaW9uRml4ZXM6IEludmVyc2lvbkZpeFtdKSB7XG4gICAgY29uc3QgZmlsdGVyVmFsdWUgPSBnZXRDU1NGaWx0ZXJWYWx1ZShjb25maWcpO1xuICAgIGNvbnN0IHJldmVyc2VGaWx0ZXJWYWx1ZSA9ICdpbnZlcnQoMTAwJSkgaHVlLXJvdGF0ZSgxODBkZWcpJztcbiAgICByZXR1cm4gY3NzRmlsdGVyU3R5bGVoZWV0VGVtcGxhdGUoZmlsdGVyVmFsdWUsIHJldmVyc2VGaWx0ZXJWYWx1ZSwgY29uZmlnLCB1cmwsIGZyYW1lVVJMLCBpbnZlcnNpb25GaXhlcyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjc3NGaWx0ZXJTdHlsZWhlZXRUZW1wbGF0ZShmaWx0ZXJWYWx1ZTogc3RyaW5nLCByZXZlcnNlRmlsdGVyVmFsdWU6IHN0cmluZywgY29uZmlnOiBGaWx0ZXJDb25maWcsIHVybDogc3RyaW5nLCBmcmFtZVVSTDogc3RyaW5nLCBpbnZlcnNpb25GaXhlczogSW52ZXJzaW9uRml4W10pIHtcbiAgICBjb25zdCBmaXggPSBnZXRJbnZlcnNpb25GaXhlc0ZvcihmcmFtZVVSTCB8fCB1cmwsIGludmVyc2lvbkZpeGVzKTtcblxuICAgIGNvbnN0IGxpbmVzOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgbGluZXMucHVzaCgnQG1lZGlhIHNjcmVlbiB7Jyk7XG5cbiAgICAvLyBBZGQgbGVhZGluZyBydWxlXG4gICAgaWYgKGZpbHRlclZhbHVlICYmICFmcmFtZVVSTCkge1xuICAgICAgICBsaW5lcy5wdXNoKCcnKTtcbiAgICAgICAgbGluZXMucHVzaCgnLyogTGVhZGluZyBydWxlICovJyk7XG4gICAgICAgIGxpbmVzLnB1c2goY3JlYXRlTGVhZGluZ1J1bGUoZmlsdGVyVmFsdWUpKTtcbiAgICB9XG5cbiAgICBpZiAoY29uZmlnLm1vZGUgPT09IEZpbHRlck1vZGUuZGFyaykge1xuICAgICAgICAvLyBBZGQgcmV2ZXJzZSBydWxlXG4gICAgICAgIGxpbmVzLnB1c2goJycpO1xuICAgICAgICBsaW5lcy5wdXNoKCcvKiBSZXZlcnNlIHJ1bGUgKi8nKTtcbiAgICAgICAgbGluZXMucHVzaChjcmVhdGVSZXZlcnNlUnVsZShyZXZlcnNlRmlsdGVyVmFsdWUsIGZpeCkpO1xuICAgIH1cblxuICAgIGlmIChjb25maWcudXNlRm9udCB8fCBjb25maWcudGV4dFN0cm9rZSA+IDApIHtcbiAgICAgICAgLy8gQWRkIHRleHQgcnVsZVxuICAgICAgICBsaW5lcy5wdXNoKCcnKTtcbiAgICAgICAgbGluZXMucHVzaCgnLyogRm9udCAqLycpO1xuICAgICAgICBsaW5lcy5wdXNoKGNyZWF0ZVRleHRTdHlsZShjb25maWcpKTtcbiAgICB9XG5cbiAgICAvLyBGaXggYmFkIGZvbnQgaGludGluZyBhZnRlciBpbnZlcnNpb25cbiAgICBsaW5lcy5wdXNoKCcnKTtcbiAgICBsaW5lcy5wdXNoKCcvKiBUZXh0IGNvbnRyYXN0ICovJyk7XG4gICAgbGluZXMucHVzaCgnaHRtbCB7Jyk7XG4gICAgbGluZXMucHVzaCgnICB0ZXh0LXNoYWRvdzogMCAwIDAgIWltcG9ydGFudDsnKTtcbiAgICBsaW5lcy5wdXNoKCd9Jyk7XG5cbiAgICAvLyBGdWxsIHNjcmVlbiBmaXhcbiAgICBsaW5lcy5wdXNoKCcnKTtcbiAgICBsaW5lcy5wdXNoKCcvKiBGdWxsIHNjcmVlbiAqLycpO1xuICAgIFsnOi13ZWJraXQtZnVsbC1zY3JlZW4nLCAnOi1tb3otZnVsbC1zY3JlZW4nLCAnOmZ1bGxzY3JlZW4nXS5mb3JFYWNoKChmdWxsU2NyZWVuKSA9PiB7XG4gICAgICAgIGxpbmVzLnB1c2goYCR7ZnVsbFNjcmVlbn0sICR7ZnVsbFNjcmVlbn0gKiB7YCk7XG4gICAgICAgIGxpbmVzLnB1c2goJyAgLXdlYmtpdC1maWx0ZXI6IG5vbmUgIWltcG9ydGFudDsnKTtcbiAgICAgICAgbGluZXMucHVzaCgnICBmaWx0ZXI6IG5vbmUgIWltcG9ydGFudDsnKTtcbiAgICAgICAgbGluZXMucHVzaCgnfScpO1xuICAgIH0pO1xuXG4gICAgaWYgKCFmcmFtZVVSTCkge1xuICAgICAgICAvLyBJZiB1c2VyIGhhcyB0aGUgY2hyb21lIGlzc3VlIHRoZSBjb2xvcnMgc2hvdWxkIGJlIHRoZSBvdGhlciB3YXkgYXJvdW5kIGFzIG9mIHRoZSByb290Y29sb3JzIHdpbGwgYWZmZWN0IHRoZSB3aG9sZSBiYWNrZ3JvdW5kIGNvbG9yIG9mIHRoZSBwYWdlXG4gICAgICAgIGNvbnN0IHJvb3RDb2xvcnMgPSBoYXNDaHJvbWl1bUlzc3VlNTAxNTgyKCkgJiYgY29uZmlnLm1vZGUgPT09IEZpbHRlck1vZGUuZGFyayA/IFswLCAwLCAwXSA6IFsyNTUsIDI1NSwgMjU1XTtcbiAgICAgICAgY29uc3QgW3IsIGcsIGJdID0gYXBwbHlDb2xvck1hdHJpeChyb290Q29sb3JzLCBjcmVhdGVGaWx0ZXJNYXRyaXgoY29uZmlnKSk7XG4gICAgICAgIGNvbnN0IGJnQ29sb3IgPSB7XG4gICAgICAgICAgICByOiBNYXRoLnJvdW5kKHIpLFxuICAgICAgICAgICAgZzogTWF0aC5yb3VuZChnKSxcbiAgICAgICAgICAgIGI6IE1hdGgucm91bmQoYiksXG4gICAgICAgICAgICB0b1N0cmluZygpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gYHJnYigke3RoaXMucn0sJHt0aGlzLmd9LCR7dGhpcy5ifSlgO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgfTtcbiAgICAgICAgbGluZXMucHVzaCgnJyk7XG4gICAgICAgIGxpbmVzLnB1c2goJy8qIFBhZ2UgYmFja2dyb3VuZCAqLycpO1xuICAgICAgICBsaW5lcy5wdXNoKCdodG1sIHsnKTtcbiAgICAgICAgbGluZXMucHVzaChgICBiYWNrZ3JvdW5kOiAke2JnQ29sb3J9ICFpbXBvcnRhbnQ7YCk7XG4gICAgICAgIGxpbmVzLnB1c2goJ30nKTtcbiAgICB9XG5cbiAgICBpZiAoZml4LmNzcyAmJiBmaXguY3NzLmxlbmd0aCA+IDAgJiYgY29uZmlnLm1vZGUgPT09IEZpbHRlck1vZGUuZGFyaykge1xuICAgICAgICBsaW5lcy5wdXNoKCcnKTtcbiAgICAgICAgbGluZXMucHVzaCgnLyogQ3VzdG9tIHJ1bGVzICovJyk7XG4gICAgICAgIGxpbmVzLnB1c2goZml4LmNzcyk7XG4gICAgfVxuXG4gICAgbGluZXMucHVzaCgnJyk7XG4gICAgbGluZXMucHVzaCgnfScpO1xuXG4gICAgcmV0dXJuIGxpbmVzLmpvaW4oJ1xcbicpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q1NTRmlsdGVyVmFsdWUoY29uZmlnOiBGaWx0ZXJDb25maWcpIHtcbiAgICBjb25zdCBmaWx0ZXJzOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgaWYgKGNvbmZpZy5tb2RlID09PSBGaWx0ZXJNb2RlLmRhcmspIHtcbiAgICAgICAgZmlsdGVycy5wdXNoKCdpbnZlcnQoMTAwJSkgaHVlLXJvdGF0ZSgxODBkZWcpJyk7XG4gICAgfVxuICAgIGlmIChjb25maWcuYnJpZ2h0bmVzcyAhPT0gMTAwKSB7XG4gICAgICAgIGZpbHRlcnMucHVzaChgYnJpZ2h0bmVzcygke2NvbmZpZy5icmlnaHRuZXNzfSUpYCk7XG4gICAgfVxuICAgIGlmIChjb25maWcuY29udHJhc3QgIT09IDEwMCkge1xuICAgICAgICBmaWx0ZXJzLnB1c2goYGNvbnRyYXN0KCR7Y29uZmlnLmNvbnRyYXN0fSUpYCk7XG4gICAgfVxuICAgIGlmIChjb25maWcuZ3JheXNjYWxlICE9PSAwKSB7XG4gICAgICAgIGZpbHRlcnMucHVzaChgZ3JheXNjYWxlKCR7Y29uZmlnLmdyYXlzY2FsZX0lKWApO1xuICAgIH1cbiAgICBpZiAoY29uZmlnLnNlcGlhICE9PSAwKSB7XG4gICAgICAgIGZpbHRlcnMucHVzaChgc2VwaWEoJHtjb25maWcuc2VwaWF9JSlgKTtcbiAgICB9XG5cbiAgICBpZiAoZmlsdGVycy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgcmV0dXJuIGZpbHRlcnMuam9pbignICcpO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVMZWFkaW5nUnVsZShmaWx0ZXJWYWx1ZTogc3RyaW5nKTogc3RyaW5nIHtcbiAgICByZXR1cm4gW1xuICAgICAgICAnaHRtbCB7JyxcbiAgICAgICAgYCAgLXdlYmtpdC1maWx0ZXI6ICR7ZmlsdGVyVmFsdWV9ICFpbXBvcnRhbnQ7YCxcbiAgICAgICAgYCAgZmlsdGVyOiAke2ZpbHRlclZhbHVlfSAhaW1wb3J0YW50O2AsXG4gICAgICAgICd9J1xuICAgIF0uam9pbignXFxuJyk7XG59XG5cbmZ1bmN0aW9uIGpvaW5TZWxlY3RvcnMoc2VsZWN0b3JzOiBzdHJpbmdbXSkge1xuICAgIHJldHVybiBzZWxlY3RvcnMubWFwKChzKSA9PiBzLnJlcGxhY2UoL1xcLCQvLCAnJykpLmpvaW4oJyxcXG4nKTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlUmV2ZXJzZVJ1bGUocmV2ZXJzZUZpbHRlclZhbHVlOiBzdHJpbmcsIGZpeDogSW52ZXJzaW9uRml4KTogc3RyaW5nIHtcbiAgICBjb25zdCBsaW5lczogc3RyaW5nW10gPSBbXTtcblxuICAgIGlmIChmaXguaW52ZXJ0Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgbGluZXMucHVzaChgJHtqb2luU2VsZWN0b3JzKGZpeC5pbnZlcnQpfSB7YCk7XG4gICAgICAgIGxpbmVzLnB1c2goYCAgLXdlYmtpdC1maWx0ZXI6ICR7cmV2ZXJzZUZpbHRlclZhbHVlfSAhaW1wb3J0YW50O2ApO1xuICAgICAgICBsaW5lcy5wdXNoKGAgIGZpbHRlcjogJHtyZXZlcnNlRmlsdGVyVmFsdWV9ICFpbXBvcnRhbnQ7YCk7XG4gICAgICAgIGxpbmVzLnB1c2goJ30nKTtcbiAgICB9XG5cbiAgICBpZiAoZml4Lm5vaW52ZXJ0Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgbGluZXMucHVzaChgJHtqb2luU2VsZWN0b3JzKGZpeC5ub2ludmVydCl9IHtgKTtcbiAgICAgICAgbGluZXMucHVzaCgnICAtd2Via2l0LWZpbHRlcjogbm9uZSAhaW1wb3J0YW50OycpO1xuICAgICAgICBsaW5lcy5wdXNoKCcgIGZpbHRlcjogbm9uZSAhaW1wb3J0YW50OycpO1xuICAgICAgICBsaW5lcy5wdXNoKCd9Jyk7XG4gICAgfVxuXG4gICAgaWYgKGZpeC5yZW1vdmViZy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGxpbmVzLnB1c2goYCR7am9pblNlbGVjdG9ycyhmaXgucmVtb3ZlYmcpfSB7YCk7XG4gICAgICAgIGxpbmVzLnB1c2goJyAgYmFja2dyb3VuZDogd2hpdGUgIWltcG9ydGFudDsnKTtcbiAgICAgICAgbGluZXMucHVzaCgnfScpO1xuICAgIH1cblxuICAgIHJldHVybiBsaW5lcy5qb2luKCdcXG4nKTtcbn1cblxuLyoqXG4qIFJldHVybnMgZml4ZXMgZm9yIGEgZ2l2ZW4gVVJMLlxuKiBJZiBubyBtYXRjaGVzIGZvdW5kLCBjb21tb24gZml4ZXMgd2lsbCBiZSByZXR1cm5lZC5cbiogQHBhcmFtIHVybCBTaXRlIFVSTC5cbiogQHBhcmFtIGludmVyc2lvbkZpeGVzIExpc3Qgb2YgaW52ZXJzaW9uIGZpeGVzLlxuKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRJbnZlcnNpb25GaXhlc0Zvcih1cmw6IHN0cmluZywgaW52ZXJzaW9uRml4ZXM6IEludmVyc2lvbkZpeFtdKTogSW52ZXJzaW9uRml4IHtcbiAgICBjb25zdCBjb21tb24gPSB7XG4gICAgICAgIHVybDogaW52ZXJzaW9uRml4ZXNbMF0udXJsLFxuICAgICAgICBpbnZlcnQ6IGludmVyc2lvbkZpeGVzWzBdLmludmVydCB8fCBbXSxcbiAgICAgICAgbm9pbnZlcnQ6IGludmVyc2lvbkZpeGVzWzBdLm5vaW52ZXJ0IHx8IFtdLFxuICAgICAgICByZW1vdmViZzogaW52ZXJzaW9uRml4ZXNbMF0ucmVtb3ZlYmcgfHwgW10sXG4gICAgICAgIGNzczogaW52ZXJzaW9uRml4ZXNbMF0uY3NzIHx8ICcnLFxuICAgIH07XG5cbiAgICBpZiAodXJsKSB7XG4gICAgICAgIC8vIFNlYXJjaCBmb3IgbWF0Y2ggd2l0aCBnaXZlbiBVUkxcbiAgICAgICAgY29uc3QgbWF0Y2hlcyA9IGludmVyc2lvbkZpeGVzXG4gICAgICAgICAgICAuc2xpY2UoMSlcbiAgICAgICAgICAgIC5maWx0ZXIoKHMpID0+IGlzVVJMSW5MaXN0KHVybCwgcy51cmwpKVxuICAgICAgICAgICAgLnNvcnQoKGEsIGIpID0+IGIudXJsWzBdLmxlbmd0aCAtIGEudXJsWzBdLmxlbmd0aCk7XG4gICAgICAgIGlmIChtYXRjaGVzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGNvbnN0IGZvdW5kID0gbWF0Y2hlc1swXTtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgdXJsOiBmb3VuZC51cmwsXG4gICAgICAgICAgICAgICAgaW52ZXJ0OiBjb21tb24uaW52ZXJ0LmNvbmNhdChmb3VuZC5pbnZlcnQgfHwgW10pLFxuICAgICAgICAgICAgICAgIG5vaW52ZXJ0OiBjb21tb24ubm9pbnZlcnQuY29uY2F0KGZvdW5kLm5vaW52ZXJ0IHx8IFtdKSxcbiAgICAgICAgICAgICAgICByZW1vdmViZzogY29tbW9uLnJlbW92ZWJnLmNvbmNhdChmb3VuZC5yZW1vdmViZyB8fCBbXSksXG4gICAgICAgICAgICAgICAgY3NzOiBbY29tbW9uLmNzcywgZm91bmQuY3NzXS5maWx0ZXIoKHMpID0+IHMpLmpvaW4oJ1xcbicpLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gY29tbW9uO1xufVxuXG5jb25zdCBpbnZlcnNpb25GaXhlc0NvbW1hbmRzID0ge1xuICAgICdJTlZFUlQnOiAnaW52ZXJ0JyxcbiAgICAnTk8gSU5WRVJUJzogJ25vaW52ZXJ0JyxcbiAgICAnUkVNT1ZFIEJHJzogJ3JlbW92ZWJnJyxcbiAgICAnQ1NTJzogJ2NzcycsXG59O1xuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VJbnZlcnNpb25GaXhlcyh0ZXh0OiBzdHJpbmcpIHtcbiAgICByZXR1cm4gcGFyc2VTaXRlc0ZpeGVzQ29uZmlnPEludmVyc2lvbkZpeD4odGV4dCwge1xuICAgICAgICBjb21tYW5kczogT2JqZWN0LmtleXMoaW52ZXJzaW9uRml4ZXNDb21tYW5kcyksXG4gICAgICAgIGdldENvbW1hbmRQcm9wTmFtZTogKGNvbW1hbmQpID0+IGludmVyc2lvbkZpeGVzQ29tbWFuZHNbY29tbWFuZF0gfHwgbnVsbCxcbiAgICAgICAgcGFyc2VDb21tYW5kVmFsdWU6IChjb21tYW5kLCB2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgaWYgKGNvbW1hbmQgPT09ICdDU1MnKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlLnRyaW0oKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBwYXJzZUFycmF5KHZhbHVlKTtcbiAgICAgICAgfSxcbiAgICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGZvcm1hdEludmVyc2lvbkZpeGVzKGludmVyc2lvbkZpeGVzOiBJbnZlcnNpb25GaXhbXSkge1xuICAgIGNvbnN0IGZpeGVzID0gaW52ZXJzaW9uRml4ZXMuc2xpY2UoKS5zb3J0KChhLCBiKSA9PiBjb21wYXJlVVJMUGF0dGVybnMoYS51cmxbMF0sIGIudXJsWzBdKSk7XG5cbiAgICByZXR1cm4gZm9ybWF0U2l0ZXNGaXhlc0NvbmZpZyhmaXhlcywge1xuICAgICAgICBwcm9wczogT2JqZWN0LnZhbHVlcyhpbnZlcnNpb25GaXhlc0NvbW1hbmRzKSxcbiAgICAgICAgZ2V0UHJvcENvbW1hbmROYW1lOiAocHJvcCkgPT4gT2JqZWN0LmVudHJpZXMoaW52ZXJzaW9uRml4ZXNDb21tYW5kcykuZmluZCgoWywgcF0pID0+IHAgPT09IHByb3ApWzBdLFxuICAgICAgICBmb3JtYXRQcm9wVmFsdWU6IChwcm9wLCB2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgaWYgKHByb3AgPT09ICdjc3MnKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlLnRyaW0oKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBmb3JtYXRBcnJheSh2YWx1ZSkudHJpbSgpO1xuICAgICAgICB9LFxuICAgICAgICBzaG91bGRJZ25vcmVQcm9wOiAocHJvcCwgdmFsdWUpID0+IHtcbiAgICAgICAgICAgIGlmIChwcm9wID09PSAnY3NzJykge1xuICAgICAgICAgICAgICAgIHJldHVybiAhdmFsdWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gIShBcnJheS5pc0FycmF5KHZhbHVlKSAmJiB2YWx1ZS5sZW5ndGggPiAwKTtcbiAgICAgICAgfVxuICAgIH0pO1xufVxuIiwiaW1wb3J0IHtmb3JtYXRTaXRlc0ZpeGVzQ29uZmlnfSBmcm9tICcuL3V0aWxzL2Zvcm1hdCc7XG5pbXBvcnQge3BhcnNlU2l0ZXNGaXhlc0NvbmZpZ30gZnJvbSAnLi91dGlscy9wYXJzZSc7XG5pbXBvcnQge3BhcnNlQXJyYXksIGZvcm1hdEFycmF5fSBmcm9tICcuLi91dGlscy90ZXh0JztcbmltcG9ydCB7Y29tcGFyZVVSTFBhdHRlcm5zLCBpc1VSTEluTGlzdH0gZnJvbSAnLi4vdXRpbHMvdXJsJztcbmltcG9ydCB7RHluYW1pY1RoZW1lRml4fSBmcm9tICcuLi9kZWZpbml0aW9ucyc7XG5cbmNvbnN0IGR5bmFtaWNUaGVtZUZpeGVzQ29tbWFuZHMgPSB7XG4gICAgJ0lOVkVSVCc6ICdpbnZlcnQnLFxuICAgICdDU1MnOiAnY3NzJyxcbiAgICAnSUdOT1JFIElOTElORSBTVFlMRSc6ICdpZ25vcmVJbmxpbmVTdHlsZScsXG4gICAgJ0lHTk9SRSBJTUFHRSBBTkFMWVNJUyc6ICdpZ25vcmVJbWFnZUFuYWx5c2lzJyxcbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZUR5bmFtaWNUaGVtZUZpeGVzKHRleHQ6IHN0cmluZykge1xuICAgIHJldHVybiBwYXJzZVNpdGVzRml4ZXNDb25maWc8RHluYW1pY1RoZW1lRml4Pih0ZXh0LCB7XG4gICAgICAgIGNvbW1hbmRzOiBPYmplY3Qua2V5cyhkeW5hbWljVGhlbWVGaXhlc0NvbW1hbmRzKSxcbiAgICAgICAgZ2V0Q29tbWFuZFByb3BOYW1lOiAoY29tbWFuZCkgPT4gZHluYW1pY1RoZW1lRml4ZXNDb21tYW5kc1tjb21tYW5kXSB8fCBudWxsLFxuICAgICAgICBwYXJzZUNvbW1hbmRWYWx1ZTogKGNvbW1hbmQsIHZhbHVlKSA9PiB7XG4gICAgICAgICAgICBpZiAoY29tbWFuZCA9PT0gJ0NTUycpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdmFsdWUudHJpbSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHBhcnNlQXJyYXkodmFsdWUpO1xuICAgICAgICB9LFxuICAgIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZm9ybWF0RHluYW1pY1RoZW1lRml4ZXMoZHluYW1pY1RoZW1lRml4ZXM6IER5bmFtaWNUaGVtZUZpeFtdKSB7XG4gICAgY29uc3QgZml4ZXMgPSBkeW5hbWljVGhlbWVGaXhlcy5zbGljZSgpLnNvcnQoKGEsIGIpID0+IGNvbXBhcmVVUkxQYXR0ZXJucyhhLnVybFswXSwgYi51cmxbMF0pKTtcblxuICAgIHJldHVybiBmb3JtYXRTaXRlc0ZpeGVzQ29uZmlnKGZpeGVzLCB7XG4gICAgICAgIHByb3BzOiBPYmplY3QudmFsdWVzKGR5bmFtaWNUaGVtZUZpeGVzQ29tbWFuZHMpLFxuICAgICAgICBnZXRQcm9wQ29tbWFuZE5hbWU6IChwcm9wKSA9PiBPYmplY3QuZW50cmllcyhkeW5hbWljVGhlbWVGaXhlc0NvbW1hbmRzKS5maW5kKChbLCBwXSkgPT4gcCA9PT0gcHJvcClbMF0sXG4gICAgICAgIGZvcm1hdFByb3BWYWx1ZTogKHByb3AsIHZhbHVlKSA9PiB7XG4gICAgICAgICAgICBpZiAocHJvcCA9PT0gJ2NzcycpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdmFsdWUudHJpbSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGZvcm1hdEFycmF5KHZhbHVlKS50cmltKCk7XG4gICAgICAgIH0sXG4gICAgICAgIHNob3VsZElnbm9yZVByb3A6IChwcm9wLCB2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgaWYgKHByb3AgPT09ICdjc3MnKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuICF2YWx1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiAhKEFycmF5LmlzQXJyYXkodmFsdWUpICYmIHZhbHVlLmxlbmd0aCA+IDApO1xuICAgICAgICB9LFxuICAgIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0RHluYW1pY1RoZW1lRml4ZXNGb3IodXJsOiBzdHJpbmcsIGZyYW1lVVJMOiBzdHJpbmcsIGZpeGVzOiBEeW5hbWljVGhlbWVGaXhbXSwgZW5hYmxlZEZvclBERjogYm9vbGVhbikge1xuICAgIGlmIChmaXhlcy5sZW5ndGggPT09IDAgfHwgZml4ZXNbMF0udXJsWzBdICE9PSAnKicpIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgY29uc3QgY29tbW9uID0ge1xuICAgICAgICB1cmw6IGZpeGVzWzBdLnVybCxcbiAgICAgICAgaW52ZXJ0OiBmaXhlc1swXS5pbnZlcnQgfHwgW10sXG4gICAgICAgIGNzczogZml4ZXNbMF0uY3NzIHx8IFtdLFxuICAgICAgICBpZ25vcmVJbmxpbmVTdHlsZTogZml4ZXNbMF0uaWdub3JlSW5saW5lU3R5bGUgfHwgW10sXG4gICAgICAgIGlnbm9yZUltYWdlQW5hbHlzaXM6IGZpeGVzWzBdLmlnbm9yZUltYWdlQW5hbHlzaXMgfHwgW10sXG4gICAgfTtcbiAgICBpZiAoZW5hYmxlZEZvclBERikge1xuICAgICAgICBjb21tb24uaW52ZXJ0ID0gY29tbW9uLmludmVydC5jb25jYXQoJ2VtYmVkW3R5cGU9XCJhcHBsaWNhdGlvbi9wZGZcIl0nKTtcbiAgICB9XG4gICAgY29uc3Qgc29ydGVkQnlTcGVjaWZpY2l0eSA9IGZpeGVzXG4gICAgICAgIC5zbGljZSgxKVxuICAgICAgICAubWFwKCh0aGVtZSkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzcGVjaWZpY2l0eTogaXNVUkxJbkxpc3QoZnJhbWVVUkwgfHwgdXJsLCB0aGVtZS51cmwpID8gdGhlbWUudXJsWzBdLmxlbmd0aCA6IDAsXG4gICAgICAgICAgICAgICAgdGhlbWVcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0pXG4gICAgICAgIC5maWx0ZXIoKHtzcGVjaWZpY2l0eX0pID0+IHNwZWNpZmljaXR5ID4gMClcbiAgICAgICAgLnNvcnQoKGEsIGIpID0+IGIuc3BlY2lmaWNpdHkgLSBhLnNwZWNpZmljaXR5KTtcblxuICAgIGlmIChzb3J0ZWRCeVNwZWNpZmljaXR5Lmxlbmd0aCA9PT0gMCkge1xuICAgICAgICByZXR1cm4gY29tbW9uO1xuICAgIH1cblxuICAgIGNvbnN0IG1hdGNoID0gc29ydGVkQnlTcGVjaWZpY2l0eVswXS50aGVtZTtcblxuICAgIHJldHVybiB7XG4gICAgICAgIHVybDogbWF0Y2gudXJsLFxuICAgICAgICBpbnZlcnQ6IGNvbW1vbi5pbnZlcnQuY29uY2F0KG1hdGNoLmludmVydCB8fCBbXSksXG4gICAgICAgIGNzczogW2NvbW1vbi5jc3MsIG1hdGNoLmNzc10uZmlsdGVyKChzKSA9PiBzKS5qb2luKCdcXG4nKSxcbiAgICAgICAgaWdub3JlSW5saW5lU3R5bGU6IGNvbW1vbi5pZ25vcmVJbmxpbmVTdHlsZS5jb25jYXQobWF0Y2guaWdub3JlSW5saW5lU3R5bGUgfHwgW10pLFxuICAgICAgICBpZ25vcmVJbWFnZUFuYWx5c2lzOiBjb21tb24uaWdub3JlSW1hZ2VBbmFseXNpcy5jb25jYXQobWF0Y2guaWdub3JlSW1hZ2VBbmFseXNpcyB8fCBbXSksXG4gICAgfTtcbn1cbiIsImltcG9ydCB7aXNVUkxJbkxpc3R9IGZyb20gJy4uL3V0aWxzL3VybCc7XG5pbXBvcnQge2NyZWF0ZVRleHRTdHlsZX0gZnJvbSAnLi90ZXh0LXN0eWxlJztcbmltcG9ydCB7Zm9ybWF0U2l0ZXNGaXhlc0NvbmZpZ30gZnJvbSAnLi91dGlscy9mb3JtYXQnO1xuaW1wb3J0IHthcHBseUNvbG9yTWF0cml4LCBjcmVhdGVGaWx0ZXJNYXRyaXh9IGZyb20gJy4vdXRpbHMvbWF0cml4JztcbmltcG9ydCB7cGFyc2VTaXRlc0ZpeGVzQ29uZmlnfSBmcm9tICcuL3V0aWxzL3BhcnNlJztcbmltcG9ydCB7cGFyc2VBcnJheSwgZm9ybWF0QXJyYXl9IGZyb20gJy4uL3V0aWxzL3RleHQnO1xuaW1wb3J0IHtjb21wYXJlVVJMUGF0dGVybnN9IGZyb20gJy4uL3V0aWxzL3VybCc7XG5pbXBvcnQge0ZpbHRlckNvbmZpZywgU3RhdGljVGhlbWV9IGZyb20gJy4uL2RlZmluaXRpb25zJztcblxuaW50ZXJmYWNlIFRoZW1lQ29sb3JzIHtcbiAgICBbcHJvcDogc3RyaW5nXTogbnVtYmVyW107XG4gICAgbmV1dHJhbEJnOiBudW1iZXJbXTtcbiAgICBuZXV0cmFsVGV4dDogbnVtYmVyW107XG4gICAgcmVkQmc6IG51bWJlcltdO1xuICAgIHJlZFRleHQ6IG51bWJlcltdO1xuICAgIGdyZWVuQmc6IG51bWJlcltdO1xuICAgIGdyZWVuVGV4dDogbnVtYmVyW107XG4gICAgYmx1ZUJnOiBudW1iZXJbXTtcbiAgICBibHVlVGV4dDogbnVtYmVyW107XG4gICAgZmFkZUJnOiBudW1iZXJbXTtcbiAgICBmYWRlVGV4dDogbnVtYmVyW107XG59XG5cbmNvbnN0IGRhcmtUaGVtZTogVGhlbWVDb2xvcnMgPSB7XG4gICAgbmV1dHJhbEJnOiBbMTYsIDIwLCAyM10sXG4gICAgbmV1dHJhbFRleHQ6IFsxNjcsIDE1OCwgMTM5XSxcbiAgICByZWRCZzogWzY0LCAxMiwgMzJdLFxuICAgIHJlZFRleHQ6IFsyNDcsIDE0MiwgMTAyXSxcbiAgICBncmVlbkJnOiBbMzIsIDY0LCA0OF0sXG4gICAgZ3JlZW5UZXh0OiBbMTI4LCAyMDQsIDE0OF0sXG4gICAgYmx1ZUJnOiBbMzIsIDQ4LCA2NF0sXG4gICAgYmx1ZVRleHQ6IFsxMjgsIDE4MiwgMjA0XSxcbiAgICBmYWRlQmc6IFsxNiwgMjAsIDIzLCAwLjVdLFxuICAgIGZhZGVUZXh0OiBbMTY3LCAxNTgsIDEzOSwgMC41XSxcbn07XG5cbmNvbnN0IGxpZ2h0VGhlbWU6IFRoZW1lQ29sb3JzID0ge1xuICAgIG5ldXRyYWxCZzogWzI1NSwgMjQyLCAyMjhdLFxuICAgIG5ldXRyYWxUZXh0OiBbMCwgMCwgMF0sXG4gICAgcmVkQmc6IFsyNTUsIDg1LCAxNzBdLFxuICAgIHJlZFRleHQ6IFsxNDAsIDE0LCA0OF0sXG4gICAgZ3JlZW5CZzogWzE5MiwgMjU1LCAxNzBdLFxuICAgIGdyZWVuVGV4dDogWzAsIDEyOCwgMF0sXG4gICAgYmx1ZUJnOiBbMTczLCAyMTUsIDIyOV0sXG4gICAgYmx1ZVRleHQ6IFsyOCwgMTYsIDE3MV0sXG4gICAgZmFkZUJnOiBbMCwgMCwgMCwgMC41XSxcbiAgICBmYWRlVGV4dDogWzAsIDAsIDAsIDAuNV0sXG59O1xuXG5mdW5jdGlvbiByZ2IoW3IsIGcsIGIsIGFdOiBudW1iZXJbXSkge1xuICAgIGlmICh0eXBlb2YgYSA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgcmV0dXJuIGByZ2JhKCR7cn0sICR7Z30sICR7Yn0sICR7YX0pYDtcbiAgICB9XG4gICAgcmV0dXJuIGByZ2IoJHtyfSwgJHtnfSwgJHtifSlgO1xufVxuXG5mdW5jdGlvbiBtaXgoY29sb3IxOiBudW1iZXJbXSwgY29sb3IyOiBudW1iZXJbXSwgdDogbnVtYmVyKSB7XG4gICAgcmV0dXJuIGNvbG9yMS5tYXAoKGMsIGkpID0+IE1hdGgucm91bmQoYyAqICgxIC0gdCkgKyBjb2xvcjJbaV0gKiB0KSk7XG59XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGNyZWF0ZVN0YXRpY1N0eWxlc2hlZXQoY29uZmlnOiBGaWx0ZXJDb25maWcsIHVybDogc3RyaW5nLCBmcmFtZVVSTDogc3RyaW5nLCBzdGF0aWNUaGVtZXM6IFN0YXRpY1RoZW1lW10pIHtcbiAgICBjb25zdCBzcmNUaGVtZSA9IGNvbmZpZy5tb2RlID09PSAxID8gZGFya1RoZW1lIDogbGlnaHRUaGVtZTtcbiAgICBjb25zdCB0aGVtZSA9IE9iamVjdC5lbnRyaWVzKHNyY1RoZW1lKS5yZWR1Y2UoKHQsIFtwcm9wLCBjb2xvcl0pID0+IHtcbiAgICAgICAgdFtwcm9wXSA9IGFwcGx5Q29sb3JNYXRyaXgoY29sb3IsIGNyZWF0ZUZpbHRlck1hdHJpeCh7Li4uY29uZmlnLCBtb2RlOiAwfSkpO1xuICAgICAgICByZXR1cm4gdDtcbiAgICB9LCB7fSBhcyBUaGVtZUNvbG9ycyk7XG5cbiAgICBjb25zdCBjb21tb25UaGVtZSA9IGdldENvbW1vblRoZW1lKHN0YXRpY1RoZW1lcyk7XG4gICAgY29uc3Qgc2l0ZVRoZW1lID0gZ2V0VGhlbWVGb3IoZnJhbWVVUkwgfHwgdXJsLCBzdGF0aWNUaGVtZXMpO1xuXG4gICAgY29uc3QgbGluZXM6IHN0cmluZ1tdID0gW107XG5cbiAgICBpZiAoIXNpdGVUaGVtZSB8fCAhc2l0ZVRoZW1lLm5vQ29tbW9uKSB7XG4gICAgICAgIGxpbmVzLnB1c2goJy8qIENvbW1vbiB0aGVtZSAqLycpO1xuICAgICAgICBsaW5lcy5wdXNoKC4uLnJ1bGVHZW5lcmF0b3JzLm1hcCgoZ2VuKSA9PiBnZW4oY29tbW9uVGhlbWUsIHRoZW1lKSkpO1xuICAgIH1cblxuICAgIGlmIChzaXRlVGhlbWUpIHtcbiAgICAgICAgbGluZXMucHVzaChgLyogVGhlbWUgZm9yICR7c2l0ZVRoZW1lLnVybC5qb2luKCcgJyl9ICovYCk7XG4gICAgICAgIGxpbmVzLnB1c2goLi4ucnVsZUdlbmVyYXRvcnMubWFwKChnZW4pID0+IGdlbihzaXRlVGhlbWUsIHRoZW1lKSkpO1xuICAgIH1cblxuICAgIGlmIChjb25maWcudXNlRm9udCB8fCBjb25maWcudGV4dFN0cm9rZSA+IDApIHtcbiAgICAgICAgbGluZXMucHVzaCgnLyogRm9udCAqLycpO1xuICAgICAgICBsaW5lcy5wdXNoKGNyZWF0ZVRleHRTdHlsZShjb25maWcpKTtcbiAgICB9XG5cbiAgICByZXR1cm4gbGluZXNcbiAgICAgICAgLmZpbHRlcigobG4pID0+IGxuKVxuICAgICAgICAuam9pbignXFxuJyk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVJ1bGVHZW4oZ2V0U2VsZWN0b3JzOiAoc2l0ZVRoZW1lOiBTdGF0aWNUaGVtZSkgPT4gc3RyaW5nW10sIGdlbmVyYXRlRGVjbGFyYXRpb25zOiAodGhlbWU6IFRoZW1lQ29sb3JzKSA9PiBzdHJpbmdbXSwgbW9kaWZ5U2VsZWN0b3I6ICgoczogc3RyaW5nKSA9PiBzdHJpbmcpID0gKHMpID0+IHMpIHtcbiAgICByZXR1cm4gKHNpdGVUaGVtZTogU3RhdGljVGhlbWUsIHRoZW1lQ29sb3JzOiBUaGVtZUNvbG9ycykgPT4ge1xuICAgICAgICBjb25zdCBzZWxlY3RvcnMgPSBnZXRTZWxlY3RvcnMoc2l0ZVRoZW1lKTtcbiAgICAgICAgaWYgKHNlbGVjdG9ycyA9PSBudWxsIHx8IHNlbGVjdG9ycy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGxpbmVzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICBzZWxlY3RvcnMuZm9yRWFjaCgocywgaSkgPT4ge1xuICAgICAgICAgICAgbGV0IGxuID0gbW9kaWZ5U2VsZWN0b3Iocyk7XG4gICAgICAgICAgICBpZiAoaSA8IHNlbGVjdG9ycy5sZW5ndGggLSAxKSB7XG4gICAgICAgICAgICAgICAgbG4gKz0gJywnO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBsbiArPSAnIHsnO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbGluZXMucHVzaChsbik7XG4gICAgICAgIH0pO1xuICAgICAgICBjb25zdCBkZWNsYXJhdGlvbnMgPSBnZW5lcmF0ZURlY2xhcmF0aW9ucyh0aGVtZUNvbG9ycyk7XG4gICAgICAgIGRlY2xhcmF0aW9ucy5mb3JFYWNoKChkKSA9PiBsaW5lcy5wdXNoKGAgICAgJHtkfSAhaW1wb3J0YW50O2ApKTtcbiAgICAgICAgbGluZXMucHVzaCgnfScpO1xuICAgICAgICByZXR1cm4gbGluZXMuam9pbignXFxuJyk7XG4gICAgfTtcbn1cblxuY29uc3QgbXggPSB7XG4gICAgYmc6IHtcbiAgICAgICAgaG92ZXI6IDAuMDc1LFxuICAgICAgICBhY3RpdmU6IDAuMSxcbiAgICB9LFxuICAgIGZnOiB7XG4gICAgICAgIGhvdmVyOiAwLjI1LFxuICAgICAgICBhY3RpdmU6IDAuNSxcbiAgICB9LFxuICAgIGJvcmRlcjogMC41LFxufTtcblxuY29uc3QgcnVsZUdlbmVyYXRvcnMgPSBbXG4gICAgY3JlYXRlUnVsZUdlbigodCkgPT4gdC5uZXV0cmFsQmcsICh0KSA9PiBbYGJhY2tncm91bmQtY29sb3I6ICR7cmdiKHQubmV1dHJhbEJnKX1gXSksXG4gICAgY3JlYXRlUnVsZUdlbigodCkgPT4gdC5uZXV0cmFsQmdBY3RpdmUsICh0KSA9PiBbYGJhY2tncm91bmQtY29sb3I6ICR7cmdiKHQubmV1dHJhbEJnKX1gXSksXG4gICAgY3JlYXRlUnVsZUdlbigodCkgPT4gdC5uZXV0cmFsQmdBY3RpdmUsICh0KSA9PiBbYGJhY2tncm91bmQtY29sb3I6ICR7cmdiKG1peCh0Lm5ldXRyYWxCZywgWzI1NSwgMjU1LCAyNTVdLCBteC5iZy5ob3ZlcikpfWBdLCAocykgPT4gYCR7c306aG92ZXJgKSxcbiAgICBjcmVhdGVSdWxlR2VuKCh0KSA9PiB0Lm5ldXRyYWxCZ0FjdGl2ZSwgKHQpID0+IFtgYmFja2dyb3VuZC1jb2xvcjogJHtyZ2IobWl4KHQubmV1dHJhbEJnLCBbMjU1LCAyNTUsIDI1NV0sIG14LmJnLmFjdGl2ZSkpfWBdLCAocykgPT4gYCR7c306YWN0aXZlLCAke3N9OmZvY3VzYCksXG4gICAgY3JlYXRlUnVsZUdlbigodCkgPT4gdC5uZXV0cmFsVGV4dCwgKHQpID0+IFtgY29sb3I6ICR7cmdiKHQubmV1dHJhbFRleHQpfWBdKSxcbiAgICBjcmVhdGVSdWxlR2VuKCh0KSA9PiB0Lm5ldXRyYWxUZXh0QWN0aXZlLCAodCkgPT4gW2Bjb2xvcjogJHtyZ2IodC5uZXV0cmFsVGV4dCl9YF0pLFxuICAgIGNyZWF0ZVJ1bGVHZW4oKHQpID0+IHQubmV1dHJhbFRleHRBY3RpdmUsICh0KSA9PiBbYGNvbG9yOiAke3JnYihtaXgodC5uZXV0cmFsVGV4dCwgWzI1NSwgMjU1LCAyNTVdLCBteC5mZy5ob3ZlcikpfWBdLCAocykgPT4gYCR7c306aG92ZXJgKSxcbiAgICBjcmVhdGVSdWxlR2VuKCh0KSA9PiB0Lm5ldXRyYWxUZXh0QWN0aXZlLCAodCkgPT4gW2Bjb2xvcjogJHtyZ2IobWl4KHQubmV1dHJhbFRleHQsIFsyNTUsIDI1NSwgMjU1XSwgbXguZmcuYWN0aXZlKSl9YF0sIChzKSA9PiBgJHtzfTphY3RpdmUsICR7c306Zm9jdXNgKSxcbiAgICBjcmVhdGVSdWxlR2VuKCh0KSA9PiB0Lm5ldXRyYWxCb3JkZXIsICh0KSA9PiBbYGJvcmRlci1jb2xvcjogJHtyZ2IobWl4KHQubmV1dHJhbEJnLCB0Lm5ldXRyYWxUZXh0LCBteC5ib3JkZXIpKX1gXSksXG5cbiAgICBjcmVhdGVSdWxlR2VuKCh0KSA9PiB0LnJlZEJnLCAodCkgPT4gW2BiYWNrZ3JvdW5kLWNvbG9yOiAke3JnYih0LnJlZEJnKX1gXSksXG4gICAgY3JlYXRlUnVsZUdlbigodCkgPT4gdC5yZWRCZ0FjdGl2ZSwgKHQpID0+IFtgYmFja2dyb3VuZC1jb2xvcjogJHtyZ2IodC5yZWRCZyl9YF0pLFxuICAgIGNyZWF0ZVJ1bGVHZW4oKHQpID0+IHQucmVkQmdBY3RpdmUsICh0KSA9PiBbYGJhY2tncm91bmQtY29sb3I6ICR7cmdiKG1peCh0LnJlZEJnLCBbMjU1LCAwLCA2NF0sIG14LmJnLmhvdmVyKSl9YF0sIChzKSA9PiBgJHtzfTpob3ZlcmApLFxuICAgIGNyZWF0ZVJ1bGVHZW4oKHQpID0+IHQucmVkQmdBY3RpdmUsICh0KSA9PiBbYGJhY2tncm91bmQtY29sb3I6ICR7cmdiKG1peCh0LnJlZEJnLCBbMjU1LCAwLCA2NF0sIG14LmJnLmFjdGl2ZSkpfWBdLCAocykgPT4gYCR7c306YWN0aXZlLCAke3N9OmZvY3VzYCksXG4gICAgY3JlYXRlUnVsZUdlbigodCkgPT4gdC5yZWRUZXh0LCAodCkgPT4gW2Bjb2xvcjogJHtyZ2IodC5yZWRUZXh0KX1gXSksXG4gICAgY3JlYXRlUnVsZUdlbigodCkgPT4gdC5yZWRUZXh0QWN0aXZlLCAodCkgPT4gW2Bjb2xvcjogJHtyZ2IodC5yZWRUZXh0KX1gXSksXG4gICAgY3JlYXRlUnVsZUdlbigodCkgPT4gdC5yZWRUZXh0QWN0aXZlLCAodCkgPT4gW2Bjb2xvcjogJHtyZ2IobWl4KHQucmVkVGV4dCwgWzI1NSwgMjU1LCAwXSwgbXguZmcuaG92ZXIpKX1gXSwgKHMpID0+IGAke3N9OmhvdmVyYCksXG4gICAgY3JlYXRlUnVsZUdlbigodCkgPT4gdC5yZWRUZXh0QWN0aXZlLCAodCkgPT4gW2Bjb2xvcjogJHtyZ2IobWl4KHQucmVkVGV4dCwgWzI1NSwgMjU1LCAwXSwgbXguZmcuYWN0aXZlKSl9YF0sIChzKSA9PiBgJHtzfTphY3RpdmUsICR7c306Zm9jdXNgKSxcbiAgICBjcmVhdGVSdWxlR2VuKCh0KSA9PiB0LnJlZEJvcmRlciwgKHQpID0+IFtgYm9yZGVyLWNvbG9yOiAke3JnYihtaXgodC5yZWRCZywgdC5yZWRUZXh0LCBteC5ib3JkZXIpKX1gXSksXG5cbiAgICBjcmVhdGVSdWxlR2VuKCh0KSA9PiB0LmdyZWVuQmcsICh0KSA9PiBbYGJhY2tncm91bmQtY29sb3I6ICR7cmdiKHQuZ3JlZW5CZyl9YF0pLFxuICAgIGNyZWF0ZVJ1bGVHZW4oKHQpID0+IHQuZ3JlZW5CZ0FjdGl2ZSwgKHQpID0+IFtgYmFja2dyb3VuZC1jb2xvcjogJHtyZ2IodC5ncmVlbkJnKX1gXSksXG4gICAgY3JlYXRlUnVsZUdlbigodCkgPT4gdC5ncmVlbkJnQWN0aXZlLCAodCkgPT4gW2BiYWNrZ3JvdW5kLWNvbG9yOiAke3JnYihtaXgodC5ncmVlbkJnLCBbMTI4LCAyNTUsIDE4Ml0sIG14LmJnLmhvdmVyKSl9YF0sIChzKSA9PiBgJHtzfTpob3ZlcmApLFxuICAgIGNyZWF0ZVJ1bGVHZW4oKHQpID0+IHQuZ3JlZW5CZ0FjdGl2ZSwgKHQpID0+IFtgYmFja2dyb3VuZC1jb2xvcjogJHtyZ2IobWl4KHQuZ3JlZW5CZywgWzEyOCwgMjU1LCAxODJdLCBteC5iZy5hY3RpdmUpKX1gXSwgKHMpID0+IGAke3N9OmFjdGl2ZSwgJHtzfTpmb2N1c2ApLFxuICAgIGNyZWF0ZVJ1bGVHZW4oKHQpID0+IHQuZ3JlZW5UZXh0LCAodCkgPT4gW2Bjb2xvcjogJHtyZ2IodC5ncmVlblRleHQpfWBdKSxcbiAgICBjcmVhdGVSdWxlR2VuKCh0KSA9PiB0LmdyZWVuVGV4dEFjdGl2ZSwgKHQpID0+IFtgY29sb3I6ICR7cmdiKHQuZ3JlZW5UZXh0KX1gXSksXG4gICAgY3JlYXRlUnVsZUdlbigodCkgPT4gdC5ncmVlblRleHRBY3RpdmUsICh0KSA9PiBbYGNvbG9yOiAke3JnYihtaXgodC5ncmVlblRleHQsIFsxODIsIDI1NSwgMjI0XSwgbXguZmcuaG92ZXIpKX1gXSwgKHMpID0+IGAke3N9OmhvdmVyYCksXG4gICAgY3JlYXRlUnVsZUdlbigodCkgPT4gdC5ncmVlblRleHRBY3RpdmUsICh0KSA9PiBbYGNvbG9yOiAke3JnYihtaXgodC5ncmVlblRleHQsIFsxODIsIDI1NSwgMjI0XSwgbXguZmcuYWN0aXZlKSl9YF0sIChzKSA9PiBgJHtzfTphY3RpdmUsICR7c306Zm9jdXNgKSxcbiAgICBjcmVhdGVSdWxlR2VuKCh0KSA9PiB0LmdyZWVuQm9yZGVyLCAodCkgPT4gW2Bib3JkZXItY29sb3I6ICR7cmdiKG1peCh0LmdyZWVuQmcsIHQuZ3JlZW5UZXh0LCBteC5ib3JkZXIpKX1gXSksXG5cbiAgICBjcmVhdGVSdWxlR2VuKCh0KSA9PiB0LmJsdWVCZywgKHQpID0+IFtgYmFja2dyb3VuZC1jb2xvcjogJHtyZ2IodC5ibHVlQmcpfWBdKSxcbiAgICBjcmVhdGVSdWxlR2VuKCh0KSA9PiB0LmJsdWVCZ0FjdGl2ZSwgKHQpID0+IFtgYmFja2dyb3VuZC1jb2xvcjogJHtyZ2IodC5ibHVlQmcpfWBdKSxcbiAgICBjcmVhdGVSdWxlR2VuKCh0KSA9PiB0LmJsdWVCZ0FjdGl2ZSwgKHQpID0+IFtgYmFja2dyb3VuZC1jb2xvcjogJHtyZ2IobWl4KHQuYmx1ZUJnLCBbMCwgMTI4LCAyNTVdLCBteC5iZy5ob3ZlcikpfWBdLCAocykgPT4gYCR7c306aG92ZXJgKSxcbiAgICBjcmVhdGVSdWxlR2VuKCh0KSA9PiB0LmJsdWVCZ0FjdGl2ZSwgKHQpID0+IFtgYmFja2dyb3VuZC1jb2xvcjogJHtyZ2IobWl4KHQuYmx1ZUJnLCBbMCwgMTI4LCAyNTVdLCBteC5iZy5hY3RpdmUpKX1gXSwgKHMpID0+IGAke3N9OmFjdGl2ZSwgJHtzfTpmb2N1c2ApLFxuICAgIGNyZWF0ZVJ1bGVHZW4oKHQpID0+IHQuYmx1ZVRleHQsICh0KSA9PiBbYGNvbG9yOiAke3JnYih0LmJsdWVUZXh0KX1gXSksXG4gICAgY3JlYXRlUnVsZUdlbigodCkgPT4gdC5ibHVlVGV4dEFjdGl2ZSwgKHQpID0+IFtgY29sb3I6ICR7cmdiKHQuYmx1ZVRleHQpfWBdKSxcbiAgICBjcmVhdGVSdWxlR2VuKCh0KSA9PiB0LmJsdWVUZXh0QWN0aXZlLCAodCkgPT4gW2Bjb2xvcjogJHtyZ2IobWl4KHQuYmx1ZVRleHQsIFsxODIsIDIyNCwgMjU1XSwgbXguZmcuaG92ZXIpKX1gXSwgKHMpID0+IGAke3N9OmhvdmVyYCksXG4gICAgY3JlYXRlUnVsZUdlbigodCkgPT4gdC5ibHVlVGV4dEFjdGl2ZSwgKHQpID0+IFtgY29sb3I6ICR7cmdiKG1peCh0LmJsdWVUZXh0LCBbMTgyLCAyMjQsIDI1NV0sIG14LmZnLmFjdGl2ZSkpfWBdLCAocykgPT4gYCR7c306YWN0aXZlLCAke3N9OmZvY3VzYCksXG4gICAgY3JlYXRlUnVsZUdlbigodCkgPT4gdC5ibHVlQm9yZGVyLCAodCkgPT4gW2Bib3JkZXItY29sb3I6ICR7cmdiKG1peCh0LmJsdWVCZywgdC5ibHVlVGV4dCwgbXguYm9yZGVyKSl9YF0pLFxuXG4gICAgY3JlYXRlUnVsZUdlbigodCkgPT4gdC5mYWRlQmcsICh0KSA9PiBbYGJhY2tncm91bmQtY29sb3I6ICR7cmdiKHQuZmFkZUJnKX1gXSksXG4gICAgY3JlYXRlUnVsZUdlbigodCkgPT4gdC5mYWRlVGV4dCwgKHQpID0+IFtgY29sb3I6ICR7cmdiKHQuZmFkZVRleHQpfWBdKSxcbiAgICBjcmVhdGVSdWxlR2VuKCh0KSA9PiB0LnRyYW5zcGFyZW50QmcsICgpID0+IFsnYmFja2dyb3VuZC1jb2xvcjogdHJhbnNwYXJlbnQnXSksXG4gICAgY3JlYXRlUnVsZUdlbigodCkgPT4gdC5ub0ltYWdlLCAoKSA9PiBbJ2JhY2tncm91bmQtaW1hZ2U6IG5vbmUnXSksXG4gICAgY3JlYXRlUnVsZUdlbigodCkgPT4gdC5pbnZlcnQsICgpID0+IFsnZmlsdGVyOiBpbnZlcnQoMTAwJSkgaHVlLXJvdGF0ZSgxODBkZWcpJ10pLFxuXTtcblxuY29uc3Qgc3RhdGljVGhlbWVDb21tYW5kcyA9IFtcbiAgICAnTk8gQ09NTU9OJyxcblxuICAgICdORVVUUkFMIEJHJyxcbiAgICAnTkVVVFJBTCBCRyBBQ1RJVkUnLFxuICAgICdORVVUUkFMIFRFWFQnLFxuICAgICdORVVUUkFMIFRFWFQgQUNUSVZFJyxcbiAgICAnTkVVVFJBTCBCT1JERVInLFxuXG4gICAgJ1JFRCBCRycsXG4gICAgJ1JFRCBCRyBBQ1RJVkUnLFxuICAgICdSRUQgVEVYVCcsXG4gICAgJ1JFRCBURVhUIEFDVElWRScsXG4gICAgJ1JFRCBCT1JERVInLFxuXG4gICAgJ0dSRUVOIEJHJyxcbiAgICAnR1JFRU4gQkcgQUNUSVZFJyxcbiAgICAnR1JFRU4gVEVYVCcsXG4gICAgJ0dSRUVOIFRFWFQgQUNUSVZFJyxcbiAgICAnR1JFRU4gQk9SREVSJyxcblxuICAgICdCTFVFIEJHJyxcbiAgICAnQkxVRSBCRyBBQ1RJVkUnLFxuICAgICdCTFVFIFRFWFQnLFxuICAgICdCTFVFIFRFWFQgQUNUSVZFJyxcbiAgICAnQkxVRSBCT1JERVInLFxuXG4gICAgJ0ZBREUgQkcnLFxuICAgICdGQURFIFRFWFQnLFxuICAgICdUUkFOU1BBUkVOVCBCRycsXG5cbiAgICAnTk8gSU1BR0UnLFxuICAgICdJTlZFUlQnLFxuXTtcblxuZnVuY3Rpb24gdXBwZXJDYXNlVG9DYW1lbENhc2UodGV4dDogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRleHRcbiAgICAgICAgLnNwbGl0KCcgJylcbiAgICAgICAgLm1hcCgod29yZCwgaSkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIChpID09PSAwXG4gICAgICAgICAgICAgICAgPyB3b3JkLnRvTG93ZXJDYXNlKClcbiAgICAgICAgICAgICAgICA6ICh3b3JkLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgd29yZC5zdWJzdHIoMSkudG9Mb3dlckNhc2UoKSlcbiAgICAgICAgICAgICk7XG4gICAgICAgIH0pXG4gICAgICAgIC5qb2luKCcnKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlU3RhdGljVGhlbWVzKCR0aGVtZXM6IHN0cmluZykge1xuICAgIHJldHVybiBwYXJzZVNpdGVzRml4ZXNDb25maWc8U3RhdGljVGhlbWU+KCR0aGVtZXMsIHtcbiAgICAgICAgY29tbWFuZHM6IHN0YXRpY1RoZW1lQ29tbWFuZHMsXG4gICAgICAgIGdldENvbW1hbmRQcm9wTmFtZTogdXBwZXJDYXNlVG9DYW1lbENhc2UsXG4gICAgICAgIHBhcnNlQ29tbWFuZFZhbHVlOiAoY29tbWFuZCwgdmFsdWUpID0+IHtcbiAgICAgICAgICAgIGlmIChjb21tYW5kID09PSAnTk8gQ09NTU9OJykge1xuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHBhcnNlQXJyYXkodmFsdWUpO1xuICAgICAgICB9XG4gICAgfSk7XG59XG5cbmZ1bmN0aW9uIGNhbWVsQ2FzZVRvVXBwZXJDYXNlKHRleHQ6IHN0cmluZykge1xuICAgIHJldHVybiB0ZXh0LnJlcGxhY2UoLyhbYS16XSkoW0EtWl0pL2csICckMSAkMicpLnRvVXBwZXJDYXNlKCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmb3JtYXRTdGF0aWNUaGVtZXMoc3RhdGljVGhlbWVzOiBTdGF0aWNUaGVtZVtdKSB7XG4gICAgY29uc3QgdGhlbWVzID0gc3RhdGljVGhlbWVzLnNsaWNlKCkuc29ydCgoYSwgYikgPT4gY29tcGFyZVVSTFBhdHRlcm5zKGEudXJsWzBdLCBiLnVybFswXSkpO1xuXG4gICAgcmV0dXJuIGZvcm1hdFNpdGVzRml4ZXNDb25maWcodGhlbWVzLCB7XG4gICAgICAgIHByb3BzOiBzdGF0aWNUaGVtZUNvbW1hbmRzLm1hcCh1cHBlckNhc2VUb0NhbWVsQ2FzZSksXG4gICAgICAgIGdldFByb3BDb21tYW5kTmFtZTogY2FtZWxDYXNlVG9VcHBlckNhc2UsXG4gICAgICAgIGZvcm1hdFByb3BWYWx1ZTogKHByb3AsIHZhbHVlKSA9PiB7XG4gICAgICAgICAgICBpZiAocHJvcCA9PT0gJ25vQ29tbW9uJykge1xuICAgICAgICAgICAgICAgIHJldHVybiAnJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBmb3JtYXRBcnJheSh2YWx1ZSkudHJpbSgpO1xuICAgICAgICB9LFxuICAgICAgICBzaG91bGRJZ25vcmVQcm9wOiAocHJvcCwgdmFsdWUpID0+IHtcbiAgICAgICAgICAgIGlmIChwcm9wID09PSAnbm9Db21tb24nKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuICF2YWx1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiAhKEFycmF5LmlzQXJyYXkodmFsdWUpICYmIHZhbHVlLmxlbmd0aCA+IDApO1xuICAgICAgICB9XG4gICAgfSk7XG59XG5cbmZ1bmN0aW9uIGdldENvbW1vblRoZW1lKHRoZW1lczogU3RhdGljVGhlbWVbXSkge1xuICAgIHJldHVybiB0aGVtZXNbMF07XG59XG5cbmZ1bmN0aW9uIGdldFRoZW1lRm9yKHVybDogc3RyaW5nLCB0aGVtZXM6IFN0YXRpY1RoZW1lW10pIHtcbiAgICBjb25zdCBzb3J0ZWRCeVNwZWNpZmljaXR5ID0gdGhlbWVzXG4gICAgICAgIC5zbGljZSgxKVxuICAgICAgICAubWFwKCh0aGVtZSkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzcGVjaWZpY2l0eTogaXNVUkxJbkxpc3QodXJsLCB0aGVtZS51cmwpID8gdGhlbWUudXJsWzBdLmxlbmd0aCA6IDAsXG4gICAgICAgICAgICAgICAgdGhlbWVcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0pXG4gICAgICAgIC5maWx0ZXIoKHtzcGVjaWZpY2l0eX0pID0+IHNwZWNpZmljaXR5ID4gMClcbiAgICAgICAgLnNvcnQoKGEsIGIpID0+IGIuc3BlY2lmaWNpdHkgLSBhLnNwZWNpZmljaXR5KTtcblxuICAgIGlmIChzb3J0ZWRCeVNwZWNpZmljaXR5Lmxlbmd0aCA9PT0gMCkge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICByZXR1cm4gc29ydGVkQnlTcGVjaWZpY2l0eVswXS50aGVtZTtcbn1cbiIsImltcG9ydCB7cmVhZFRleHR9IGZyb20gJy4vdXRpbHMvbmV0d29yayc7XG5pbXBvcnQge3BhcnNlQXJyYXl9IGZyb20gJy4uL3V0aWxzL3RleHQnO1xuaW1wb3J0IHtnZXREdXJhdGlvbn0gZnJvbSAnLi4vdXRpbHMvdGltZSc7XG5pbXBvcnQge3BhcnNlSW52ZXJzaW9uRml4ZXN9IGZyb20gJy4uL2dlbmVyYXRvcnMvY3NzLWZpbHRlcic7XG5pbXBvcnQge3BhcnNlRHluYW1pY1RoZW1lRml4ZXN9IGZyb20gJy4uL2dlbmVyYXRvcnMvZHluYW1pYy10aGVtZSc7XG5pbXBvcnQge3BhcnNlU3RhdGljVGhlbWVzfSBmcm9tICcuLi9nZW5lcmF0b3JzL3N0YXRpYy10aGVtZSc7XG5pbXBvcnQge0ludmVyc2lvbkZpeCwgU3RhdGljVGhlbWUsIER5bmFtaWNUaGVtZUZpeH0gZnJvbSAnLi4vZGVmaW5pdGlvbnMnO1xuXG5jb25zdCBDT05GSUdfVVJMcyA9IHtcbiAgICBkYXJrU2l0ZXM6IHtcbiAgICAgICAgcmVtb3RlOiAnaHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL2RhcmtyZWFkZXIvZGFya3JlYWRlci9tYXN0ZXIvc3JjL2NvbmZpZy9kYXJrLXNpdGVzLmNvbmZpZycsXG4gICAgICAgIGxvY2FsOiAnLi4vY29uZmlnL2Rhcmstc2l0ZXMuY29uZmlnJyxcbiAgICB9LFxuICAgIGR5bmFtaWNUaGVtZUZpeGVzOiB7XG4gICAgICAgIHJlbW90ZTogJ2h0dHBzOi8vcmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbS9kYXJrcmVhZGVyL2RhcmtyZWFkZXIvbWFzdGVyL3NyYy9jb25maWcvZHluYW1pYy10aGVtZS1maXhlcy5jb25maWcnLFxuICAgICAgICBsb2NhbDogJy4uL2NvbmZpZy9keW5hbWljLXRoZW1lLWZpeGVzLmNvbmZpZycsXG4gICAgfSxcbiAgICBpbnZlcnNpb25GaXhlczoge1xuICAgICAgICByZW1vdGU6ICdodHRwczovL3Jhdy5naXRodWJ1c2VyY29udGVudC5jb20vZGFya3JlYWRlci9kYXJrcmVhZGVyL21hc3Rlci9zcmMvY29uZmlnL2ludmVyc2lvbi1maXhlcy5jb25maWcnLFxuICAgICAgICBsb2NhbDogJy4uL2NvbmZpZy9pbnZlcnNpb24tZml4ZXMuY29uZmlnJyxcbiAgICB9LFxuICAgIHN0YXRpY1RoZW1lczoge1xuICAgICAgICByZW1vdGU6ICdodHRwczovL3Jhdy5naXRodWJ1c2VyY29udGVudC5jb20vZGFya3JlYWRlci9kYXJrcmVhZGVyL21hc3Rlci9zcmMvY29uZmlnL3N0YXRpYy10aGVtZXMuY29uZmlnJyxcbiAgICAgICAgbG9jYWw6ICcuLi9jb25maWcvc3RhdGljLXRoZW1lcy5jb25maWcnLFxuICAgIH0sXG59O1xuY29uc3QgUkVNT1RFX1RJTUVPVVRfTVMgPSBnZXREdXJhdGlvbih7c2Vjb25kczogMTB9KTtcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgQ29uZmlnTWFuYWdlciB7XG4gICAgREFSS19TSVRFUz86IHN0cmluZ1tdO1xuICAgIERZTkFNSUNfVEhFTUVfRklYRVM/OiBEeW5hbWljVGhlbWVGaXhbXTtcbiAgICBJTlZFUlNJT05fRklYRVM/OiBJbnZlcnNpb25GaXhbXTtcbiAgICBTVEFUSUNfVEhFTUVTPzogU3RhdGljVGhlbWVbXTtcblxuICAgIHJhdyA9IHtcbiAgICAgICAgZGFya1NpdGVzOiBudWxsLFxuICAgICAgICBkeW5hbWljVGhlbWVGaXhlczogbnVsbCxcbiAgICAgICAgaW52ZXJzaW9uRml4ZXM6IG51bGwsXG4gICAgICAgIHN0YXRpY1RoZW1lczogbnVsbCxcbiAgICB9O1xuXG4gICAgb3ZlcnJpZGVzID0ge1xuICAgICAgICBkYXJrU2l0ZXM6IG51bGwsXG4gICAgICAgIGR5bmFtaWNUaGVtZUZpeGVzOiBudWxsLFxuICAgICAgICBpbnZlcnNpb25GaXhlczogbnVsbCxcbiAgICAgICAgc3RhdGljVGhlbWVzOiBudWxsLFxuICAgIH07XG5cbiAgICBwcml2YXRlIGFzeW5jIGxvYWRDb25maWcoe1xuICAgICAgICBuYW1lLFxuICAgICAgICBsb2NhbCxcbiAgICAgICAgbG9jYWxVUkwsXG4gICAgICAgIHJlbW90ZVVSTCxcbiAgICAgICAgc3VjY2VzcyxcbiAgICB9KSB7XG4gICAgICAgIGxldCAkY29uZmlnOiBzdHJpbmc7XG4gICAgICAgIGNvbnN0IGxvYWRMb2NhbCA9IGFzeW5jICgpID0+IGF3YWl0IHJlYWRUZXh0KHt1cmw6IGxvY2FsVVJMfSk7XG4gICAgICAgIGlmIChsb2NhbCkge1xuICAgICAgICAgICAgJGNvbmZpZyA9IGF3YWl0IGxvYWRMb2NhbCgpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAkY29uZmlnID0gYXdhaXQgcmVhZFRleHQoe1xuICAgICAgICAgICAgICAgICAgICB1cmw6IGAke3JlbW90ZVVSTH0/bm9jYWNoZT0ke0RhdGUubm93KCl9YCxcbiAgICAgICAgICAgICAgICAgICAgdGltZW91dDogUkVNT1RFX1RJTUVPVVRfTVNcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYCR7bmFtZX0gcmVtb3RlIGxvYWQgZXJyb3JgLCBlcnIpO1xuICAgICAgICAgICAgICAgICRjb25maWcgPSBhd2FpdCBsb2FkTG9jYWwoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBzdWNjZXNzKCRjb25maWcpO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgbG9hZERhcmtTaXRlcyh7bG9jYWx9KSB7XG4gICAgICAgIGF3YWl0IHRoaXMubG9hZENvbmZpZyh7XG4gICAgICAgICAgICBuYW1lOiAnRGFyayBTaXRlcycsXG4gICAgICAgICAgICBsb2NhbCxcbiAgICAgICAgICAgIGxvY2FsVVJMOiBDT05GSUdfVVJMcy5kYXJrU2l0ZXMubG9jYWwsXG4gICAgICAgICAgICByZW1vdGVVUkw6IENPTkZJR19VUkxzLmRhcmtTaXRlcy5yZW1vdGUsXG4gICAgICAgICAgICBzdWNjZXNzOiAoJHNpdGVzOiBzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICB0aGlzLnJhdy5kYXJrU2l0ZXMgPSAkc2l0ZXM7XG4gICAgICAgICAgICAgICAgdGhpcy5oYW5kbGVEYXJrU2l0ZXMoKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgbG9hZER5bmFtaWNUaGVtZUZpeGVzKHtsb2NhbH0pIHtcbiAgICAgICAgYXdhaXQgdGhpcy5sb2FkQ29uZmlnKHtcbiAgICAgICAgICAgIG5hbWU6ICdEeW5hbWljIFRoZW1lIEZpeGVzJyxcbiAgICAgICAgICAgIGxvY2FsLFxuICAgICAgICAgICAgbG9jYWxVUkw6IENPTkZJR19VUkxzLmR5bmFtaWNUaGVtZUZpeGVzLmxvY2FsLFxuICAgICAgICAgICAgcmVtb3RlVVJMOiBDT05GSUdfVVJMcy5keW5hbWljVGhlbWVGaXhlcy5yZW1vdGUsXG4gICAgICAgICAgICBzdWNjZXNzOiAoJGZpeGVzOiBzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICB0aGlzLnJhdy5keW5hbWljVGhlbWVGaXhlcyA9ICRmaXhlcztcbiAgICAgICAgICAgICAgICB0aGlzLmhhbmRsZUR5bmFtaWNUaGVtZUZpeGVzKCk7XG4gICAgICAgICAgICB9LFxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGxvYWRJbnZlcnNpb25GaXhlcyh7bG9jYWx9KSB7XG4gICAgICAgIGF3YWl0IHRoaXMubG9hZENvbmZpZyh7XG4gICAgICAgICAgICBuYW1lOiAnSW52ZXJzaW9uIEZpeGVzJyxcbiAgICAgICAgICAgIGxvY2FsLFxuICAgICAgICAgICAgbG9jYWxVUkw6IENPTkZJR19VUkxzLmludmVyc2lvbkZpeGVzLmxvY2FsLFxuICAgICAgICAgICAgcmVtb3RlVVJMOiBDT05GSUdfVVJMcy5pbnZlcnNpb25GaXhlcy5yZW1vdGUsXG4gICAgICAgICAgICBzdWNjZXNzOiAoJGZpeGVzOiBzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICB0aGlzLnJhdy5pbnZlcnNpb25GaXhlcyA9ICRmaXhlcztcbiAgICAgICAgICAgICAgICB0aGlzLmhhbmRsZUludmVyc2lvbkZpeGVzKCk7XG4gICAgICAgICAgICB9LFxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGxvYWRTdGF0aWNUaGVtZXMoe2xvY2FsfSkge1xuICAgICAgICBhd2FpdCB0aGlzLmxvYWRDb25maWcoe1xuICAgICAgICAgICAgbmFtZTogJ1N0YXRpYyBUaGVtZXMnLFxuICAgICAgICAgICAgbG9jYWwsXG4gICAgICAgICAgICBsb2NhbFVSTDogQ09ORklHX1VSTHMuc3RhdGljVGhlbWVzLmxvY2FsLFxuICAgICAgICAgICAgcmVtb3RlVVJMOiBDT05GSUdfVVJMcy5zdGF0aWNUaGVtZXMucmVtb3RlLFxuICAgICAgICAgICAgc3VjY2VzczogKCR0aGVtZXM6IHN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMucmF3LnN0YXRpY1RoZW1lcyA9ICR0aGVtZXM7XG4gICAgICAgICAgICAgICAgdGhpcy5oYW5kbGVTdGF0aWNUaGVtZXMoKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGFzeW5jIGxvYWQoY29uZmlnOiB7bG9jYWw6IGJvb2xlYW59KSB7XG4gICAgICAgIGF3YWl0IFByb21pc2UuYWxsKFtcbiAgICAgICAgICAgIHRoaXMubG9hZERhcmtTaXRlcyhjb25maWcpLFxuICAgICAgICAgICAgdGhpcy5sb2FkRHluYW1pY1RoZW1lRml4ZXMoY29uZmlnKSxcbiAgICAgICAgICAgIHRoaXMubG9hZEludmVyc2lvbkZpeGVzKGNvbmZpZyksXG4gICAgICAgICAgICB0aGlzLmxvYWRTdGF0aWNUaGVtZXMoY29uZmlnKSxcbiAgICAgICAgXSkuY2F0Y2goKGVycikgPT4gY29uc29sZS5lcnJvcignRmF0YWxpdHknLCBlcnIpKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGhhbmRsZURhcmtTaXRlcygpIHtcbiAgICAgICAgY29uc3QgJHNpdGVzID0gdGhpcy5vdmVycmlkZXMuZGFya1NpdGVzIHx8IHRoaXMucmF3LmRhcmtTaXRlcztcbiAgICAgICAgdGhpcy5EQVJLX1NJVEVTID0gcGFyc2VBcnJheSgkc2l0ZXMpO1xuICAgIH1cblxuICAgIGhhbmRsZUR5bmFtaWNUaGVtZUZpeGVzKCkge1xuICAgICAgICBjb25zdCAkZml4ZXMgPSB0aGlzLm92ZXJyaWRlcy5keW5hbWljVGhlbWVGaXhlcyB8fCB0aGlzLnJhdy5keW5hbWljVGhlbWVGaXhlcztcbiAgICAgICAgdGhpcy5EWU5BTUlDX1RIRU1FX0ZJWEVTID0gcGFyc2VEeW5hbWljVGhlbWVGaXhlcygkZml4ZXMpO1xuICAgIH1cblxuICAgIGhhbmRsZUludmVyc2lvbkZpeGVzKCkge1xuICAgICAgICBjb25zdCAkZml4ZXMgPSB0aGlzLm92ZXJyaWRlcy5pbnZlcnNpb25GaXhlcyB8fCB0aGlzLnJhdy5pbnZlcnNpb25GaXhlcztcbiAgICAgICAgdGhpcy5JTlZFUlNJT05fRklYRVMgPSBwYXJzZUludmVyc2lvbkZpeGVzKCRmaXhlcyk7XG4gICAgfVxuXG4gICAgaGFuZGxlU3RhdGljVGhlbWVzKCkge1xuICAgICAgICBjb25zdCAkdGhlbWVzID0gdGhpcy5vdmVycmlkZXMuc3RhdGljVGhlbWVzIHx8IHRoaXMucmF3LnN0YXRpY1RoZW1lcztcbiAgICAgICAgdGhpcy5TVEFUSUNfVEhFTUVTID0gcGFyc2VTdGF0aWNUaGVtZXMoJHRoZW1lcyk7XG4gICAgfVxufVxuIiwiaW1wb3J0IHtwYXJzZUludmVyc2lvbkZpeGVzLCBmb3JtYXRJbnZlcnNpb25GaXhlc30gZnJvbSAnLi4vZ2VuZXJhdG9ycy9jc3MtZmlsdGVyJztcbmltcG9ydCB7cGFyc2VEeW5hbWljVGhlbWVGaXhlcywgZm9ybWF0RHluYW1pY1RoZW1lRml4ZXN9IGZyb20gJy4uL2dlbmVyYXRvcnMvZHluYW1pYy10aGVtZSc7XG5pbXBvcnQge3BhcnNlU3RhdGljVGhlbWVzLCBmb3JtYXRTdGF0aWNUaGVtZXN9IGZyb20gJy4uL2dlbmVyYXRvcnMvc3RhdGljLXRoZW1lJztcbmltcG9ydCBDb25maWdNYW5hZ2VyIGZyb20gJy4vY29uZmlnLW1hbmFnZXInO1xuXG5pbnRlcmZhY2UgRGV2VG9vbHNTdG9yYWdlIHtcbiAgICBnZXQoa2V5OiBzdHJpbmcpOiBzdHJpbmc7XG4gICAgc2V0KGtleTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nKTogdm9pZDtcbiAgICByZW1vdmUoa2V5OiBzdHJpbmcpOiB2b2lkO1xuICAgIGhhcyhrZXk6IHN0cmluZyk6IGJvb2xlYW47XG59XG5cbmNsYXNzIExvY2FsU3RvcmFnZVdyYXBwZXIgaW1wbGVtZW50cyBEZXZUb29sc1N0b3JhZ2Uge1xuICAgIGdldChrZXk6IHN0cmluZykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgcmV0dXJuIGxvY2FsU3RvcmFnZS5nZXRJdGVtKGtleSk7XG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihlcnIpO1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cbiAgICB9XG4gICAgc2V0KGtleTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbShrZXksIHZhbHVlKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKGVycik7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmVtb3ZlKGtleTogc3RyaW5nKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBsb2NhbFN0b3JhZ2UucmVtb3ZlSXRlbShrZXkpO1xuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoZXJyKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgIH1cbiAgICBoYXMoa2V5OiBzdHJpbmcpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHJldHVybiBsb2NhbFN0b3JhZ2UuZ2V0SXRlbShrZXkpICE9IG51bGw7XG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihlcnIpO1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgfVxufVxuXG5jbGFzcyBUZW1wU3RvcmFnZSBpbXBsZW1lbnRzIERldlRvb2xzU3RvcmFnZSB7XG4gICAgbWFwID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblxuICAgIGdldChrZXk6IHN0cmluZykge1xuICAgICAgICByZXR1cm4gdGhpcy5tYXAuZ2V0KGtleSk7XG4gICAgfVxuICAgIHNldChrZXk6IHN0cmluZywgdmFsdWU6IHN0cmluZykge1xuICAgICAgICB0aGlzLm1hcC5zZXQoa2V5LCB2YWx1ZSk7XG4gICAgfVxuICAgIHJlbW92ZShrZXk6IHN0cmluZykge1xuICAgICAgICB0aGlzLm1hcC5kZWxldGUoa2V5KTtcbiAgICB9XG4gICAgaGFzKGtleTogc3RyaW5nKSB7XG4gICAgICAgIHJldHVybiB0aGlzLm1hcC5oYXMoa2V5KTtcbiAgICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIERldlRvb2xzIHtcbiAgICBwcml2YXRlIGNvbmZpZzogQ29uZmlnTWFuYWdlcjtcbiAgICBwcml2YXRlIG9uQ2hhbmdlOiAoKSA9PiB2b2lkO1xuICAgIHByaXZhdGUgc3RvcmU6IERldlRvb2xzU3RvcmFnZTtcblxuICAgIGNvbnN0cnVjdG9yKGNvbmZpZzogQ29uZmlnTWFuYWdlciwgb25DaGFuZ2U6ICgpID0+IHZvaWQpIHtcbiAgICAgICAgdGhpcy5zdG9yZSA9ICh0eXBlb2YgbG9jYWxTdG9yYWdlICE9PSAndW5kZWZpbmVkJyAmJiBsb2NhbFN0b3JhZ2UgIT0gbnVsbCA/XG4gICAgICAgICAgICBuZXcgTG9jYWxTdG9yYWdlV3JhcHBlcigpIDpcbiAgICAgICAgICAgIG5ldyBUZW1wU3RvcmFnZSgpKTtcbiAgICAgICAgdGhpcy5jb25maWcgPSBjb25maWc7XG4gICAgICAgIHRoaXMuY29uZmlnLm92ZXJyaWRlcy5keW5hbWljVGhlbWVGaXhlcyA9IHRoaXMuZ2V0U2F2ZWREeW5hbWljVGhlbWVGaXhlcygpIHx8IG51bGw7XG4gICAgICAgIHRoaXMuY29uZmlnLm92ZXJyaWRlcy5pbnZlcnNpb25GaXhlcyA9IHRoaXMuZ2V0U2F2ZWRJbnZlcnNpb25GaXhlcygpIHx8IG51bGw7XG4gICAgICAgIHRoaXMuY29uZmlnLm92ZXJyaWRlcy5zdGF0aWNUaGVtZXMgPSB0aGlzLmdldFNhdmVkU3RhdGljVGhlbWVzKCkgfHwgbnVsbDtcbiAgICAgICAgdGhpcy5vbkNoYW5nZSA9IG9uQ2hhbmdlO1xuICAgIH1cblxuICAgIHByaXZhdGUgc3RhdGljIEtFWV9EWU5BTUlDID0gJ2Rldl9keW5hbWljX3RoZW1lX2ZpeGVzJztcbiAgICBwcml2YXRlIHN0YXRpYyBLRVlfRklMVEVSID0gJ2Rldl9pbnZlcnNpb25fZml4ZXMnO1xuICAgIHByaXZhdGUgc3RhdGljIEtFWV9TVEFUSUMgPSAnZGV2X3N0YXRpY190aGVtZXMnO1xuXG4gICAgcHJpdmF0ZSBnZXRTYXZlZER5bmFtaWNUaGVtZUZpeGVzKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5zdG9yZS5nZXQoRGV2VG9vbHMuS0VZX0RZTkFNSUMpIHx8IG51bGw7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBzYXZlRHluYW1pY1RoZW1lRml4ZXModGV4dDogc3RyaW5nKSB7XG4gICAgICAgIHRoaXMuc3RvcmUuc2V0KERldlRvb2xzLktFWV9EWU5BTUlDLCB0ZXh0KTtcbiAgICB9XG5cbiAgICBoYXNDdXN0b21EeW5hbWljVGhlbWVGaXhlcygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc3RvcmUuaGFzKERldlRvb2xzLktFWV9EWU5BTUlDKTtcbiAgICB9XG5cbiAgICBnZXREeW5hbWljVGhlbWVGaXhlc1RleHQoKSB7XG4gICAgICAgIGNvbnN0ICRmaXhlcyA9IHRoaXMuZ2V0U2F2ZWREeW5hbWljVGhlbWVGaXhlcygpO1xuICAgICAgICBjb25zdCBmaXhlcyA9ICRmaXhlcyA/IHBhcnNlRHluYW1pY1RoZW1lRml4ZXMoJGZpeGVzKSA6IHRoaXMuY29uZmlnLkRZTkFNSUNfVEhFTUVfRklYRVM7XG4gICAgICAgIHJldHVybiBmb3JtYXREeW5hbWljVGhlbWVGaXhlcyhmaXhlcyk7XG4gICAgfVxuXG4gICAgcmVzZXREeW5hbWljVGhlbWVGaXhlcygpIHtcbiAgICAgICAgdGhpcy5zdG9yZS5yZW1vdmUoRGV2VG9vbHMuS0VZX0RZTkFNSUMpO1xuICAgICAgICB0aGlzLmNvbmZpZy5vdmVycmlkZXMuZHluYW1pY1RoZW1lRml4ZXMgPSBudWxsO1xuICAgICAgICB0aGlzLmNvbmZpZy5oYW5kbGVEeW5hbWljVGhlbWVGaXhlcygpO1xuICAgICAgICB0aGlzLm9uQ2hhbmdlKCk7XG4gICAgfVxuXG4gICAgYXBwbHlEeW5hbWljVGhlbWVGaXhlcyh0ZXh0OiBzdHJpbmcpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGZvcm1hdHRlZCA9IGZvcm1hdER5bmFtaWNUaGVtZUZpeGVzKHBhcnNlRHluYW1pY1RoZW1lRml4ZXModGV4dCkpO1xuICAgICAgICAgICAgdGhpcy5jb25maWcub3ZlcnJpZGVzLmR5bmFtaWNUaGVtZUZpeGVzID0gZm9ybWF0dGVkO1xuICAgICAgICAgICAgdGhpcy5jb25maWcuaGFuZGxlRHluYW1pY1RoZW1lRml4ZXMoKTtcbiAgICAgICAgICAgIHRoaXMuc2F2ZUR5bmFtaWNUaGVtZUZpeGVzKGZvcm1hdHRlZCk7XG4gICAgICAgICAgICB0aGlzLm9uQ2hhbmdlKCk7XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICByZXR1cm4gZXJyO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBnZXRTYXZlZEludmVyc2lvbkZpeGVzKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5zdG9yZS5nZXQoRGV2VG9vbHMuS0VZX0ZJTFRFUikgfHwgbnVsbDtcbiAgICB9XG5cbiAgICBwcml2YXRlIHNhdmVJbnZlcnNpb25GaXhlcyh0ZXh0OiBzdHJpbmcpIHtcbiAgICAgICAgdGhpcy5zdG9yZS5zZXQoRGV2VG9vbHMuS0VZX0ZJTFRFUiwgdGV4dCk7XG4gICAgfVxuXG4gICAgaGFzQ3VzdG9tRmlsdGVyRml4ZXMoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnN0b3JlLmhhcyhEZXZUb29scy5LRVlfRklMVEVSKTtcbiAgICB9XG5cbiAgICBnZXRJbnZlcnNpb25GaXhlc1RleHQoKSB7XG4gICAgICAgIGNvbnN0ICRmaXhlcyA9IHRoaXMuZ2V0U2F2ZWRJbnZlcnNpb25GaXhlcygpO1xuICAgICAgICBjb25zdCBmaXhlcyA9ICRmaXhlcyA/IHBhcnNlSW52ZXJzaW9uRml4ZXMoJGZpeGVzKSA6IHRoaXMuY29uZmlnLklOVkVSU0lPTl9GSVhFUztcbiAgICAgICAgcmV0dXJuIGZvcm1hdEludmVyc2lvbkZpeGVzKGZpeGVzKTtcbiAgICB9XG5cbiAgICByZXNldEludmVyc2lvbkZpeGVzKCkge1xuICAgICAgICB0aGlzLnN0b3JlLnJlbW92ZShEZXZUb29scy5LRVlfRklMVEVSKTtcbiAgICAgICAgdGhpcy5jb25maWcub3ZlcnJpZGVzLmludmVyc2lvbkZpeGVzID0gbnVsbDtcbiAgICAgICAgdGhpcy5jb25maWcuaGFuZGxlSW52ZXJzaW9uRml4ZXMoKTtcbiAgICAgICAgdGhpcy5vbkNoYW5nZSgpO1xuICAgIH1cblxuICAgIGFwcGx5SW52ZXJzaW9uRml4ZXModGV4dDogc3RyaW5nKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBmb3JtYXR0ZWQgPSBmb3JtYXRJbnZlcnNpb25GaXhlcyhwYXJzZUludmVyc2lvbkZpeGVzKHRleHQpKTtcbiAgICAgICAgICAgIHRoaXMuY29uZmlnLm92ZXJyaWRlcy5pbnZlcnNpb25GaXhlcyA9IGZvcm1hdHRlZDtcbiAgICAgICAgICAgIHRoaXMuY29uZmlnLmhhbmRsZUludmVyc2lvbkZpeGVzKCk7XG4gICAgICAgICAgICB0aGlzLnNhdmVJbnZlcnNpb25GaXhlcyhmb3JtYXR0ZWQpO1xuICAgICAgICAgICAgdGhpcy5vbkNoYW5nZSgpO1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgcmV0dXJuIGVycjtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgZ2V0U2F2ZWRTdGF0aWNUaGVtZXMoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnN0b3JlLmdldChEZXZUb29scy5LRVlfU1RBVElDKSB8fCBudWxsO1xuICAgIH1cblxuICAgIHByaXZhdGUgc2F2ZVN0YXRpY1RoZW1lcyh0ZXh0OiBzdHJpbmcpIHtcbiAgICAgICAgdGhpcy5zdG9yZS5zZXQoRGV2VG9vbHMuS0VZX1NUQVRJQywgdGV4dCk7XG4gICAgfVxuXG4gICAgaGFzQ3VzdG9tU3RhdGljRml4ZXMoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnN0b3JlLmhhcyhEZXZUb29scy5LRVlfU1RBVElDKTtcbiAgICB9XG5cbiAgICBnZXRTdGF0aWNUaGVtZXNUZXh0KCkge1xuICAgICAgICBjb25zdCAkdGhlbWVzID0gdGhpcy5nZXRTYXZlZFN0YXRpY1RoZW1lcygpO1xuICAgICAgICBjb25zdCB0aGVtZXMgPSAkdGhlbWVzID8gcGFyc2VTdGF0aWNUaGVtZXMoJHRoZW1lcykgOiB0aGlzLmNvbmZpZy5TVEFUSUNfVEhFTUVTO1xuICAgICAgICByZXR1cm4gZm9ybWF0U3RhdGljVGhlbWVzKHRoZW1lcyk7XG4gICAgfVxuXG4gICAgcmVzZXRTdGF0aWNUaGVtZXMoKSB7XG4gICAgICAgIHRoaXMuc3RvcmUucmVtb3ZlKERldlRvb2xzLktFWV9TVEFUSUMpO1xuICAgICAgICB0aGlzLmNvbmZpZy5vdmVycmlkZXMuc3RhdGljVGhlbWVzID0gbnVsbDtcbiAgICAgICAgdGhpcy5jb25maWcuaGFuZGxlU3RhdGljVGhlbWVzKCk7XG4gICAgICAgIHRoaXMub25DaGFuZ2UoKTtcbiAgICB9XG5cbiAgICBhcHBseVN0YXRpY1RoZW1lcyh0ZXh0OiBzdHJpbmcpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGZvcm1hdHRlZCA9IGZvcm1hdFN0YXRpY1RoZW1lcyhwYXJzZVN0YXRpY1RoZW1lcyh0ZXh0KSk7XG4gICAgICAgICAgICB0aGlzLmNvbmZpZy5vdmVycmlkZXMuc3RhdGljVGhlbWVzID0gZm9ybWF0dGVkO1xuICAgICAgICAgICAgdGhpcy5jb25maWcuaGFuZGxlU3RhdGljVGhlbWVzKCk7XG4gICAgICAgICAgICB0aGlzLnNhdmVTdGF0aWNUaGVtZXMoZm9ybWF0dGVkKTtcbiAgICAgICAgICAgIHRoaXMub25DaGFuZ2UoKTtcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIHJldHVybiBlcnI7XG4gICAgICAgIH1cbiAgICB9XG59XG4iLCJjb25zdCBJQ09OX1BBVEhTID0ge1xuICAgIGFjdGl2ZV8xOTogJy4uL2ljb25zL2RyX2FjdGl2ZV8xOS5wbmcnLFxuICAgIGFjdGl2ZV8zODogJy4uL2ljb25zL2RyX2FjdGl2ZV8zOC5wbmcnLFxuICAgIGluYWN0aXZlXzE5OiAnLi4vaWNvbnMvZHJfaW5hY3RpdmVfMTkucG5nJyxcbiAgICBpbmFjdGl2ZV8zODogJy4uL2ljb25zL2RyX2luYWN0aXZlXzM4LnBuZycsXG59O1xuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBJY29uTWFuYWdlciB7XG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIHRoaXMuc2V0QWN0aXZlKCk7XG4gICAgfVxuXG4gICAgc2V0QWN0aXZlKCkge1xuICAgICAgICBpZiAoIWNocm9tZS5icm93c2VyQWN0aW9uLnNldEljb24pIHtcbiAgICAgICAgICAgIC8vIEZpeCBmb3IgRmlyZWZveCBBbmRyb2lkXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgY2hyb21lLmJyb3dzZXJBY3Rpb24uc2V0SWNvbih7XG4gICAgICAgICAgICBwYXRoOiB7XG4gICAgICAgICAgICAgICAgJzE5JzogSUNPTl9QQVRIUy5hY3RpdmVfMTksXG4gICAgICAgICAgICAgICAgJzM4JzogSUNPTl9QQVRIUy5hY3RpdmVfMzhcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgc2V0SW5hY3RpdmUoKSB7XG4gICAgICAgIGlmICghY2hyb21lLmJyb3dzZXJBY3Rpb24uc2V0SWNvbikge1xuICAgICAgICAgICAgLy8gRml4IGZvciBGaXJlZm94IEFuZHJvaWRcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBjaHJvbWUuYnJvd3NlckFjdGlvbi5zZXRJY29uKHtcbiAgICAgICAgICAgIHBhdGg6IHtcbiAgICAgICAgICAgICAgICAnMTknOiBJQ09OX1BBVEhTLmluYWN0aXZlXzE5LFxuICAgICAgICAgICAgICAgICczOCc6IElDT05fUEFUSFMuaW5hY3RpdmVfMzhcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgc2hvd0ltcG9ydGFudEJhZGdlKCkge1xuICAgICAgICBjaHJvbWUuYnJvd3NlckFjdGlvbi5zZXRCYWRnZUJhY2tncm91bmRDb2xvcih7Y29sb3I6ICcjZTk2YzRjJ30pO1xuICAgICAgICBjaHJvbWUuYnJvd3NlckFjdGlvbi5zZXRCYWRnZVRleHQoe3RleHQ6ICchJ30pO1xuICAgIH1cblxuICAgIHNob3dVbnJlYWRSZWxlYXNlTm90ZXNCYWRnZShjb3VudDogbnVtYmVyKSB7XG4gICAgICAgIGNocm9tZS5icm93c2VyQWN0aW9uLnNldEJhZGdlQmFja2dyb3VuZENvbG9yKHtjb2xvcjogJyNlOTZjNGMnfSk7XG4gICAgICAgIGNocm9tZS5icm93c2VyQWN0aW9uLnNldEJhZGdlVGV4dCh7dGV4dDogU3RyaW5nKGNvdW50KX0pO1xuICAgIH1cblxuICAgIGhpZGVCYWRnZSgpIHtcbiAgICAgICAgY2hyb21lLmJyb3dzZXJBY3Rpb24uc2V0QmFkZ2VUZXh0KHt0ZXh0OiAnJ30pO1xuICAgIH1cbn1cbiIsImltcG9ydCB7RXh0ZW5zaW9uRGF0YSwgRmlsdGVyQ29uZmlnLCBUYWJJbmZvLCBNZXNzYWdlLCBVc2VyU2V0dGluZ3N9IGZyb20gJy4uL2RlZmluaXRpb25zJztcblxuZXhwb3J0IGludGVyZmFjZSBFeHRlbnNpb25BZGFwdGVyIHtcbiAgICBjb2xsZWN0OiAoKSA9PiBQcm9taXNlPEV4dGVuc2lvbkRhdGE+O1xuICAgIGdldEFjdGl2ZVRhYkluZm86ICgpID0+IFByb21pc2U8VGFiSW5mbz47XG4gICAgY2hhbmdlU2V0dGluZ3M6IChzZXR0aW5nczogUGFydGlhbDxVc2VyU2V0dGluZ3M+KSA9PiB2b2lkO1xuICAgIHNldFRoZW1lOiAodGhlbWU6IFBhcnRpYWw8RmlsdGVyQ29uZmlnPikgPT4gdm9pZDtcbiAgICBzZXRTaG9ydGN1dDogKHtjb21tYW5kLCBzaG9ydGN1dH0pID0+IHZvaWQ7XG4gICAgbWFya05ld3NBc1JlYWQ6IChpZHM6IHN0cmluZ1tdKSA9PiB2b2lkO1xuICAgIHRvZ2dsZVVSTDogKHBhdHRlcm46IHN0cmluZykgPT4gdm9pZDtcbiAgICBvblBvcHVwT3BlbjogKCkgPT4gdm9pZDtcbiAgICBsb2FkQ29uZmlnOiAob3B0aW9uczoge2xvY2FsOiBib29sZWFufSkgPT4gUHJvbWlzZTx2b2lkPjtcbiAgICBhcHBseURldkR5bmFtaWNUaGVtZUZpeGVzOiAoanNvbjogc3RyaW5nKSA9PiBFcnJvcjtcbiAgICByZXNldERldkR5bmFtaWNUaGVtZUZpeGVzOiAoKSA9PiB2b2lkO1xuICAgIGFwcGx5RGV2SW52ZXJzaW9uRml4ZXM6IChqc29uOiBzdHJpbmcpID0+IEVycm9yO1xuICAgIHJlc2V0RGV2SW52ZXJzaW9uRml4ZXM6ICgpID0+IHZvaWQ7XG4gICAgYXBwbHlEZXZTdGF0aWNUaGVtZXM6ICh0ZXh0OiBzdHJpbmcpID0+IEVycm9yO1xuICAgIHJlc2V0RGV2U3RhdGljVGhlbWVzOiAoKSA9PiB2b2lkO1xufVxuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBNZXNzZW5nZXIge1xuICAgIHByaXZhdGUgcmVwb3J0ZXJzOiBTZXQ8KGluZm86IEV4dGVuc2lvbkRhdGEpID0+IHZvaWQ+O1xuICAgIHByaXZhdGUgYWRhcHRlcjogRXh0ZW5zaW9uQWRhcHRlcjtcblxuICAgIGNvbnN0cnVjdG9yKGFkYXB0ZXI6IEV4dGVuc2lvbkFkYXB0ZXIpIHtcbiAgICAgICAgdGhpcy5yZXBvcnRlcnMgPSBuZXcgU2V0KCk7XG4gICAgICAgIHRoaXMuYWRhcHRlciA9IGFkYXB0ZXI7XG4gICAgICAgIGNocm9tZS5ydW50aW1lLm9uQ29ubmVjdC5hZGRMaXN0ZW5lcigocG9ydCkgPT4ge1xuICAgICAgICAgICAgaWYgKHBvcnQubmFtZSA9PT0gJ3VpJykge1xuICAgICAgICAgICAgICAgIHBvcnQub25NZXNzYWdlLmFkZExpc3RlbmVyKChtZXNzYWdlKSA9PiB0aGlzLm9uVUlNZXNzYWdlKHBvcnQsIG1lc3NhZ2UpKTtcbiAgICAgICAgICAgICAgICB0aGlzLmFkYXB0ZXIub25Qb3B1cE9wZW4oKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBvblVJTWVzc2FnZShwb3J0OiBjaHJvbWUucnVudGltZS5Qb3J0LCB7dHlwZSwgaWQsIGRhdGF9OiBNZXNzYWdlKSB7XG4gICAgICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgICAgICAgY2FzZSAnZ2V0LWRhdGEnOiB7XG4gICAgICAgICAgICAgICAgY29uc3QgZGF0YSA9IGF3YWl0IHRoaXMuYWRhcHRlci5jb2xsZWN0KCk7XG4gICAgICAgICAgICAgICAgcG9ydC5wb3N0TWVzc2FnZSh7aWQsIGRhdGF9KTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhc2UgJ2dldC1hY3RpdmUtdGFiLWluZm8nOiB7XG4gICAgICAgICAgICAgICAgY29uc3QgZGF0YSA9IGF3YWl0IHRoaXMuYWRhcHRlci5nZXRBY3RpdmVUYWJJbmZvKCk7XG4gICAgICAgICAgICAgICAgcG9ydC5wb3N0TWVzc2FnZSh7aWQsIGRhdGF9KTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhc2UgJ3N1YnNjcmliZS10by1jaGFuZ2VzJzoge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlcG9ydCA9IChkYXRhKSA9PiBwb3J0LnBvc3RNZXNzYWdlKHtpZCwgZGF0YX0pO1xuICAgICAgICAgICAgICAgIHRoaXMucmVwb3J0ZXJzLmFkZChyZXBvcnQpO1xuICAgICAgICAgICAgICAgIHBvcnQub25EaXNjb25uZWN0LmFkZExpc3RlbmVyKCgpID0+IHRoaXMucmVwb3J0ZXJzLmRlbGV0ZShyZXBvcnQpKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhc2UgJ2NoYW5nZS1zZXR0aW5ncyc6IHtcbiAgICAgICAgICAgICAgICB0aGlzLmFkYXB0ZXIuY2hhbmdlU2V0dGluZ3MoZGF0YSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYXNlICdzZXQtdGhlbWUnOiB7XG4gICAgICAgICAgICAgICAgdGhpcy5hZGFwdGVyLnNldFRoZW1lKGRhdGEpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2FzZSAnc2V0LXNob3J0Y3V0Jzoge1xuICAgICAgICAgICAgICAgIHRoaXMuYWRhcHRlci5zZXRTaG9ydGN1dChkYXRhKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhc2UgJ3RvZ2dsZS11cmwnOiB7XG4gICAgICAgICAgICAgICAgdGhpcy5hZGFwdGVyLnRvZ2dsZVVSTChkYXRhKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhc2UgJ21hcmstbmV3cy1hcy1yZWFkJzoge1xuICAgICAgICAgICAgICAgIHRoaXMuYWRhcHRlci5tYXJrTmV3c0FzUmVhZChkYXRhKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhc2UgJ2xvYWQtY29uZmlnJzoge1xuICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMuYWRhcHRlci5sb2FkQ29uZmlnKGRhdGEpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2FzZSAnYXBwbHktZGV2LWR5bmFtaWMtdGhlbWUtZml4ZXMnOiB7XG4gICAgICAgICAgICAgICAgY29uc3QgZXJyb3IgPSB0aGlzLmFkYXB0ZXIuYXBwbHlEZXZEeW5hbWljVGhlbWVGaXhlcyhkYXRhKTtcbiAgICAgICAgICAgICAgICBwb3J0LnBvc3RNZXNzYWdlKHtpZCwgZXJyb3I6IChlcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBudWxsKX0pO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2FzZSAncmVzZXQtZGV2LWR5bmFtaWMtdGhlbWUtZml4ZXMnOiB7XG4gICAgICAgICAgICAgICAgdGhpcy5hZGFwdGVyLnJlc2V0RGV2RHluYW1pY1RoZW1lRml4ZXMoKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhc2UgJ2FwcGx5LWRldi1pbnZlcnNpb24tZml4ZXMnOiB7XG4gICAgICAgICAgICAgICAgY29uc3QgZXJyb3IgPSB0aGlzLmFkYXB0ZXIuYXBwbHlEZXZJbnZlcnNpb25GaXhlcyhkYXRhKTtcbiAgICAgICAgICAgICAgICBwb3J0LnBvc3RNZXNzYWdlKHtpZCwgZXJyb3I6IChlcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBudWxsKX0pO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2FzZSAncmVzZXQtZGV2LWludmVyc2lvbi1maXhlcyc6IHtcbiAgICAgICAgICAgICAgICB0aGlzLmFkYXB0ZXIucmVzZXREZXZJbnZlcnNpb25GaXhlcygpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2FzZSAnYXBwbHktZGV2LXN0YXRpYy10aGVtZXMnOiB7XG4gICAgICAgICAgICAgICAgY29uc3QgZXJyb3IgPSB0aGlzLmFkYXB0ZXIuYXBwbHlEZXZTdGF0aWNUaGVtZXMoZGF0YSk7XG4gICAgICAgICAgICAgICAgcG9ydC5wb3N0TWVzc2FnZSh7aWQsIGVycm9yOiBlcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBudWxsfSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYXNlICdyZXNldC1kZXYtc3RhdGljLXRoZW1lcyc6IHtcbiAgICAgICAgICAgICAgICB0aGlzLmFkYXB0ZXIucmVzZXREZXZTdGF0aWNUaGVtZXMoKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJlcG9ydENoYW5nZXMoZGF0YTogRXh0ZW5zaW9uRGF0YSkge1xuICAgICAgICB0aGlzLnJlcG9ydGVycy5mb3JFYWNoKChyZXBvcnQpID0+IHJlcG9ydChkYXRhKSk7XG4gICAgfVxufVxuIiwiZXhwb3J0IGZ1bmN0aW9uIGdldExvY2FsTWVzc2FnZShtZXNzYWdlTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIGNocm9tZS5pMThuLmdldE1lc3NhZ2UobWVzc2FnZU5hbWUpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0VUlMYW5ndWFnZSgpIHtcbiAgICBjb25zdCBjb2RlID0gY2hyb21lLmkxOG4uZ2V0VUlMYW5ndWFnZSgpO1xuICAgIGlmIChjb2RlLmVuZHNXaXRoKCctbWFjJykpIHtcbiAgICAgICAgcmV0dXJuIGNvZGUuc3Vic3RyaW5nKDAsIGNvZGUubGVuZ3RoIC0gNCk7XG4gICAgfVxuICAgIHJldHVybiBjb2RlO1xufVxuIiwiaW1wb3J0IHtnZXRVSUxhbmd1YWdlfSBmcm9tICcuL2xvY2FsZXMnO1xuXG5leHBvcnQgY29uc3QgQkxPR19VUkwgPSAnaHR0cHM6Ly9kYXJrcmVhZGVyLm9yZy9ibG9nLyc7XG5leHBvcnQgY29uc3QgREVWVE9PTFNfRE9DU19VUkwgPSAnaHR0cHM6Ly9naXRodWIuY29tL2FsZXhhbmRlcmJ5L2RhcmtyZWFkZXIjaG93LXRvLWNvbnRyaWJ1dGUnO1xuZXhwb3J0IGNvbnN0IERPTkFURV9VUkwgPSAnaHR0cHM6Ly9vcGVuY29sbGVjdGl2ZS5jb20vZGFya3JlYWRlcic7XG5leHBvcnQgY29uc3QgR0lUSFVCX1VSTCA9ICdodHRwczovL2dpdGh1Yi5jb20vZGFya3JlYWRlci9kYXJrcmVhZGVyJztcbmV4cG9ydCBjb25zdCBQUklWQUNZX1VSTCA9ICdodHRwczovL2RhcmtyZWFkZXIub3JnL3ByaXZhY3kvJztcbmV4cG9ydCBjb25zdCBUV0lUVEVSX1VSTCA9ICdodHRwczovL3R3aXR0ZXIuY29tL2RhcmtyZWFkZXJhcHAnO1xuZXhwb3J0IGNvbnN0IFVOSU5TVEFMTF9VUkwgPSAnaHR0cHM6Ly9kYXJrcmVhZGVyLm9yZy9nb29kbHVjay8nO1xuXG5jb25zdCBoZWxwTG9jYWxlcyA9IFtcbiAgICAnYmUnLFxuICAgICdjcycsXG4gICAgJ2RlJyxcbiAgICAnZW4nLFxuICAgICdlcycsXG4gICAgJ2ZyJyxcbiAgICAnbmwnLFxuICAgICdpdCcsXG4gICAgJ3B0JyxcbiAgICAncnUnLFxuICAgICd6aC1DTicsXG4gICAgJ3poLVRXJyxcbl07XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRIZWxwVVJMKCkge1xuICAgIGNvbnN0IGxvY2FsZSA9IGdldFVJTGFuZ3VhZ2UoKTtcbiAgICBjb25zdCBtYXRjaExvY2FsZSA9IGhlbHBMb2NhbGVzLmZpbmQoKGhsKSA9PiBobCA9PT0gbG9jYWxlKSB8fCBoZWxwTG9jYWxlcy5maW5kKChobCkgPT4gbG9jYWxlLnN0YXJ0c1dpdGgoaGwpKSB8fCAnZW4nO1xuICAgIHJldHVybiBgaHR0cHM6Ly9kYXJrcmVhZGVyLm9yZy9oZWxwLyR7bWF0Y2hMb2NhbGV9L2A7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRCbG9nUG9zdFVSTChwb3N0SWQ6IHN0cmluZykge1xuICAgIHJldHVybiBgJHtCTE9HX1VSTH0ke3Bvc3RJZH0vYDtcbn1cbiIsImltcG9ydCB7aXNGaXJlZm94LCBpc0VkZ2V9IGZyb20gJy4uLy4uL3V0aWxzL3BsYXRmb3JtJztcbmltcG9ydCB7aXNQREZ9IGZyb20gJy4uLy4uL3V0aWxzL3VybCc7XG5cbmRlY2xhcmUgY29uc3QgYnJvd3Nlcjoge1xuICAgIGNvbW1hbmRzOiB7XG4gICAgICAgIHVwZGF0ZSh7bmFtZSwgc2hvcnRjdXR9KTogdm9pZDtcbiAgICB9O1xufTtcblxuZXhwb3J0IGZ1bmN0aW9uIGNhbkluamVjdFNjcmlwdCh1cmw6IHN0cmluZykge1xuICAgIGlmIChpc0ZpcmVmb3goKSkge1xuICAgICAgICByZXR1cm4gKHVybFxuICAgICAgICAgICAgJiYgIXVybC5zdGFydHNXaXRoKCdhYm91dDonKVxuICAgICAgICAgICAgJiYgIXVybC5zdGFydHNXaXRoKCdtb3onKVxuICAgICAgICAgICAgJiYgIXVybC5zdGFydHNXaXRoKCd2aWV3LXNvdXJjZTonKVxuICAgICAgICAgICAgJiYgIXVybC5zdGFydHNXaXRoKCdodHRwczovL2FkZG9ucy5tb3ppbGxhLm9yZycpXG4gICAgICAgICAgICAmJiAhaXNQREYodXJsKVxuICAgICAgICApO1xuICAgIH1cbiAgICBpZiAoaXNFZGdlKCkpIHtcbiAgICAgICAgcmV0dXJuICh1cmxcbiAgICAgICAgICAgICYmICF1cmwuc3RhcnRzV2l0aCgnY2hyb21lJylcbiAgICAgICAgICAgICYmICF1cmwuc3RhcnRzV2l0aCgnZWRnZScpXG4gICAgICAgICAgICAmJiAhdXJsLnN0YXJ0c1dpdGgoJ2h0dHBzOi8vY2hyb21lLmdvb2dsZS5jb20vd2Vic3RvcmUnKVxuICAgICAgICAgICAgJiYgIXVybC5zdGFydHNXaXRoKCdodHRwczovL21pY3Jvc29mdGVkZ2UubWljcm9zb2Z0LmNvbS9hZGRvbnMnKVxuICAgICAgICApO1xuICAgIH1cbiAgICByZXR1cm4gKHVybFxuICAgICAgICAmJiAhdXJsLnN0YXJ0c1dpdGgoJ2Nocm9tZScpXG4gICAgICAgICYmICF1cmwuc3RhcnRzV2l0aCgnaHR0cHM6Ly9jaHJvbWUuZ29vZ2xlLmNvbS93ZWJzdG9yZScpXG4gICAgKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlYWRTeW5jU3RvcmFnZTxUIGV4dGVuZHMge1trZXk6IHN0cmluZ106IGFueX0+KGRlZmF1bHRzOiBUKTogUHJvbWlzZTxUPiB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlPFQ+KChyZXNvbHZlKSA9PiB7XG4gICAgICAgIGNocm9tZS5zdG9yYWdlLnN5bmMuZ2V0KGRlZmF1bHRzLCAoc3luYzogVCkgPT4ge1xuICAgICAgICAgICAgcmVzb2x2ZShzeW5jKTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWFkTG9jYWxTdG9yYWdlPFQgZXh0ZW5kcyB7W2tleTogc3RyaW5nXTogYW55fT4oZGVmYXVsdHM6IFQpOiBQcm9taXNlPFQ+IHtcbiAgICByZXR1cm4gbmV3IFByb21pc2U8VD4oKHJlc29sdmUpID0+IHtcbiAgICAgICAgY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KGRlZmF1bHRzLCAobG9jYWw6IFQpID0+IHtcbiAgICAgICAgICAgIHJlc29sdmUobG9jYWwpO1xuICAgICAgICB9KTtcbiAgICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHdyaXRlU3luY1N0b3JhZ2U8VCBleHRlbmRzIHtba2V5OiBzdHJpbmddOiBhbnl9Pih2YWx1ZXM6IFQpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICBjaHJvbWUuc3RvcmFnZS5zeW5jLnNldCh2YWx1ZXMsICgpID0+IHtcbiAgICAgICAgICAgIGlmIChjaHJvbWUucnVudGltZS5sYXN0RXJyb3IpIHtcbiAgICAgICAgICAgICAgICByZWplY3QoY2hyb21lLnJ1bnRpbWUubGFzdEVycm9yKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXNvbHZlKCk7XG4gICAgICAgIH0pO1xuICAgIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gd3JpdGVMb2NhbFN0b3JhZ2U8VCBleHRlbmRzIHtba2V5OiBzdHJpbmddOiBhbnl9Pih2YWx1ZXM6IFQpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUpID0+IHtcbiAgICAgICAgY2hyb21lLnN0b3JhZ2UubG9jYWwuc2V0KHZhbHVlcywgKCkgPT4ge1xuICAgICAgICAgICAgcmVzb2x2ZSgpO1xuICAgICAgICB9KTtcbiAgICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEZvbnRMaXN0KCkge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZTxzdHJpbmdbXT4oKHJlc29sdmUpID0+IHtcbiAgICAgICAgaWYgKCFjaHJvbWUuZm9udFNldHRpbmdzKSB7XG4gICAgICAgICAgICAvLyBUb2RvOiBSZW1vdmUgaXQgYXMgc29vbiBhcyBGaXJlZm94IGFuZCBFZGdlIGdldCBzdXBwb3J0LlxuICAgICAgICAgICAgcmVzb2x2ZShbXG4gICAgICAgICAgICAgICAgJ3NlcmlmJyxcbiAgICAgICAgICAgICAgICAnc2Fucy1zZXJpZicsXG4gICAgICAgICAgICAgICAgJ21vbm9zcGFjZScsXG4gICAgICAgICAgICAgICAgJ2N1cnNpdmUnLFxuICAgICAgICAgICAgICAgICdmYW50YXN5JyxcbiAgICAgICAgICAgICAgICAnc3lzdGVtLXVpJ1xuICAgICAgICAgICAgXSk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgY2hyb21lLmZvbnRTZXR0aW5ncy5nZXRGb250TGlzdCgobGlzdCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgZm9udHMgPSBsaXN0Lm1hcCgoZikgPT4gZi5mb250SWQpO1xuICAgICAgICAgICAgcmVzb2x2ZShmb250cyk7XG4gICAgICAgIH0pO1xuICAgIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q29tbWFuZHMoKSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlPGNocm9tZS5jb21tYW5kcy5Db21tYW5kW10+KChyZXNvbHZlKSA9PiB7XG4gICAgICAgIGlmICghY2hyb21lLmNvbW1hbmRzKSB7XG4gICAgICAgICAgICByZXNvbHZlKFtdKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBjaHJvbWUuY29tbWFuZHMuZ2V0QWxsKChjb21tYW5kcykgPT4ge1xuICAgICAgICAgICAgaWYgKGNvbW1hbmRzKSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShjb21tYW5kcyk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoW10pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNldFNob3J0Y3V0KGNvbW1hbmQ6IHN0cmluZywgc2hvcnRjdXQ6IHN0cmluZykge1xuICAgIGlmICh0eXBlb2YgYnJvd3NlciAhPT0gJ3VuZGVmaW5lZCcgJiYgYnJvd3Nlci5jb21tYW5kcyAmJiBicm93c2VyLmNvbW1hbmRzLnVwZGF0ZSkge1xuICAgICAgICBicm93c2VyLmNvbW1hbmRzLnVwZGF0ZSh7bmFtZTogY29tbWFuZCwgc2hvcnRjdXR9KTtcbiAgICB9XG59XG4iLCJpbXBvcnQge2dldEJsb2dQb3N0VVJMfSBmcm9tICcuLi91dGlscy9saW5rcyc7XG5pbXBvcnQge2dldER1cmF0aW9ufSBmcm9tICcuLi91dGlscy90aW1lJztcbmltcG9ydCB7TmV3c30gZnJvbSAnLi4vZGVmaW5pdGlvbnMnO1xuaW1wb3J0IHtyZWFkU3luY1N0b3JhZ2UsIHJlYWRMb2NhbFN0b3JhZ2UsIHdyaXRlU3luY1N0b3JhZ2UsIHdyaXRlTG9jYWxTdG9yYWdlfSBmcm9tICcuL3V0aWxzL2V4dGVuc2lvbi1hcGknO1xuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBOZXdzbWFrZXIge1xuICAgIHN0YXRpYyBVUERBVEVfSU5URVJWQUwgPSBnZXREdXJhdGlvbih7aG91cnM6IDR9KTtcblxuICAgIGxhdGVzdDogTmV3c1tdO1xuICAgIG9uVXBkYXRlOiAobmV3czogTmV3c1tdKSA9PiB2b2lkO1xuXG4gICAgY29uc3RydWN0b3Iob25VcGRhdGU6IChuZXdzOiBOZXdzW10pID0+IHZvaWQpIHtcbiAgICAgICAgdGhpcy5sYXRlc3QgPSBbXTtcbiAgICAgICAgdGhpcy5vblVwZGF0ZSA9IG9uVXBkYXRlO1xuICAgIH1cblxuICAgIHN1YnNjcmliZSgpIHtcbiAgICAgICAgdGhpcy51cGRhdGVOZXdzKCk7XG4gICAgICAgIHNldEludGVydmFsKCgpID0+IHRoaXMudXBkYXRlTmV3cygpLCBOZXdzbWFrZXIuVVBEQVRFX0lOVEVSVkFMKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIHVwZGF0ZU5ld3MoKSB7XG4gICAgICAgIGNvbnN0IG5ld3MgPSBhd2FpdCB0aGlzLmdldE5ld3MoKTtcbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkobmV3cykpIHtcbiAgICAgICAgICAgIHRoaXMubGF0ZXN0ID0gbmV3cztcbiAgICAgICAgICAgIHRoaXMub25VcGRhdGUodGhpcy5sYXRlc3QpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBnZXRSZWFkTmV3cygpOiBQcm9taXNlPHN0cmluZ1tdPiB7XG4gICAgICAgIGNvbnN0IHN5bmMgPSBhd2FpdCByZWFkU3luY1N0b3JhZ2Uoe3JlYWROZXdzOiBbXX0pO1xuICAgICAgICBjb25zdCBsb2NhbCA9IGF3YWl0IHJlYWRMb2NhbFN0b3JhZ2Uoe3JlYWROZXdzOiBbXX0pO1xuICAgICAgICByZXR1cm4gQXJyYXkuZnJvbShuZXcgU2V0KFtcbiAgICAgICAgICAgIC4uLnN5bmMgPyBzeW5jLnJlYWROZXdzIDogW10sXG4gICAgICAgICAgICAuLi5sb2NhbCA/IGxvY2FsLnJlYWROZXdzIDogW10sXG4gICAgICAgIF0pKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGdldE5ld3MoKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKGBodHRwczovL2RhcmtyZWFkZXIuZ2l0aHViLmlvL2Jsb2cvcG9zdHMuanNvbj9kYXRlPSR7KG5ldyBEYXRlKCkpLnRvSVNPU3RyaW5nKCkuc3Vic3RyaW5nKDAsIDEwKX1gLCB7Y2FjaGU6ICduby1jYWNoZSd9KTtcbiAgICAgICAgICAgIGNvbnN0ICRuZXdzID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xuICAgICAgICAgICAgY29uc3QgcmVhZE5ld3MgPSBhd2FpdCB0aGlzLmdldFJlYWROZXdzKCk7XG4gICAgICAgICAgICBjb25zdCBuZXdzOiBOZXdzW10gPSAkbmV3cy5tYXAoKHtpZCwgZGF0ZSwgaGVhZGxpbmUsIGltcG9ydGFudH0pID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCB1cmwgPSBnZXRCbG9nUG9zdFVSTChpZCk7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVhZCA9IHRoaXMuaXNSZWFkKGlkLCByZWFkTmV3cyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHtpZCwgZGF0ZSwgaGVhZGxpbmUsIHVybCwgaW1wb3J0YW50LCByZWFkfTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBuZXdzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZGF0ZSA9IG5ldyBEYXRlKG5ld3NbaV0uZGF0ZSk7XG4gICAgICAgICAgICAgICAgaWYgKGlzTmFOKGRhdGUuZ2V0VGltZSgpKSkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVuYWJsZSB0byBwYXJzZSBkYXRlICR7ZGF0ZX1gKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gbmV3cztcbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKGVycik7XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGFzeW5jIG1hcmtBc1JlYWQoLi4uaWRzOiBzdHJpbmdbXSkge1xuICAgICAgICBjb25zdCByZWFkTmV3cyA9IGF3YWl0IHRoaXMuZ2V0UmVhZE5ld3MoKTtcbiAgICAgICAgY29uc3QgcmVzdWx0cyA9IHJlYWROZXdzLnNsaWNlKCk7XG4gICAgICAgIGxldCBjaGFuZ2VkID0gZmFsc2U7XG4gICAgICAgIGlkcy5mb3JFYWNoKChpZCkgPT4ge1xuICAgICAgICAgICAgaWYgKHJlYWROZXdzLmluZGV4T2YoaWQpIDwgMCkge1xuICAgICAgICAgICAgICAgIHJlc3VsdHMucHVzaChpZCk7XG4gICAgICAgICAgICAgICAgY2hhbmdlZCA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBpZiAoY2hhbmdlZCkge1xuICAgICAgICAgICAgdGhpcy5sYXRlc3QgPSB0aGlzLmxhdGVzdC5tYXAoKHtpZCwgZGF0ZSwgdXJsLCBoZWFkbGluZSwgaW1wb3J0YW50fSkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlYWQgPSB0aGlzLmlzUmVhZChpZCwgcmVzdWx0cyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHtpZCwgZGF0ZSwgdXJsLCBoZWFkbGluZSwgaW1wb3J0YW50LCByZWFkfTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgdGhpcy5vblVwZGF0ZSh0aGlzLmxhdGVzdCk7XG4gICAgICAgICAgICBjb25zdCBvYmogPSB7cmVhZE5ld3M6IHJlc3VsdHN9O1xuICAgICAgICAgICAgYXdhaXQgd3JpdGVMb2NhbFN0b3JhZ2Uob2JqKTtcbiAgICAgICAgICAgIGF3YWl0IHdyaXRlU3luY1N0b3JhZ2Uob2JqKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlzUmVhZChpZDogc3RyaW5nLCByZWFkTmV3czogc3RyaW5nW10pIHtcbiAgICAgICAgcmV0dXJuIHJlYWROZXdzLmluY2x1ZGVzKGlkKTtcbiAgICB9XG59XG4iLCJpbXBvcnQge2NhbkluamVjdFNjcmlwdH0gZnJvbSAnLi4vYmFja2dyb3VuZC91dGlscy9leHRlbnNpb24tYXBpJztcbmltcG9ydCB7Y3JlYXRlRmlsZUxvYWRlcn0gZnJvbSAnLi91dGlscy9uZXR3b3JrJztcbmltcG9ydCB7TWVzc2FnZX0gZnJvbSAnLi4vZGVmaW5pdGlvbnMnO1xuXG5mdW5jdGlvbiBxdWVyeVRhYnMocXVlcnk6IGNocm9tZS50YWJzLlF1ZXJ5SW5mbykge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZTxjaHJvbWUudGFicy5UYWJbXT4oKHJlc29sdmUpID0+IHtcbiAgICAgICAgY2hyb21lLnRhYnMucXVlcnkocXVlcnksICh0YWJzKSA9PiByZXNvbHZlKHRhYnMpKTtcbiAgICB9KTtcbn1cblxuaW50ZXJmYWNlIENvbm5lY3Rpb25NZXNzYWdlT3B0aW9ucyB7XG4gICAgdXJsOiBzdHJpbmc7XG4gICAgZnJhbWVVUkw6IHN0cmluZztcbiAgICB1bnN1cHBvcnRlZFNlbmRlcj86IGJvb2xlYW47XG59XG5cbmludGVyZmFjZSBUYWJNYW5hZ2VyT3B0aW9ucyB7XG4gICAgZ2V0Q29ubmVjdGlvbk1lc3NhZ2U6IChvcHRpb25zOiBDb25uZWN0aW9uTWVzc2FnZU9wdGlvbnMpID0+IGFueTtcbiAgICBvbkNvbG9yU2NoZW1lQ2hhbmdlOiAoe2lzRGFya30pID0+IHZvaWQ7XG59XG5cbmludGVyZmFjZSBQb3J0SW5mbyB7XG4gICAgdXJsOiBzdHJpbmc7XG4gICAgcG9ydDogY2hyb21lLnJ1bnRpbWUuUG9ydDtcbn1cblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgVGFiTWFuYWdlciB7XG4gICAgcHJpdmF0ZSBwb3J0czogTWFwPG51bWJlciwgTWFwPG51bWJlciwgUG9ydEluZm8+PjtcblxuICAgIGNvbnN0cnVjdG9yKHtnZXRDb25uZWN0aW9uTWVzc2FnZSwgb25Db2xvclNjaGVtZUNoYW5nZX06IFRhYk1hbmFnZXJPcHRpb25zKSB7XG4gICAgICAgIHRoaXMucG9ydHMgPSBuZXcgTWFwKCk7XG4gICAgICAgIGNocm9tZS5ydW50aW1lLm9uQ29ubmVjdC5hZGRMaXN0ZW5lcigocG9ydCkgPT4ge1xuICAgICAgICAgICAgaWYgKHBvcnQubmFtZSA9PT0gJ3RhYicpIHtcbiAgICAgICAgICAgICAgICBjb25zdCByZXBseSA9IChvcHRpb25zOiBDb25uZWN0aW9uTWVzc2FnZU9wdGlvbnMpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbWVzc2FnZSA9IGdldENvbm5lY3Rpb25NZXNzYWdlKG9wdGlvbnMpO1xuICAgICAgICAgICAgICAgICAgICBpZiAobWVzc2FnZSBpbnN0YW5jZW9mIFByb21pc2UpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2UudGhlbigoYXN5bmNNZXNzYWdlKSA9PiBhc3luY01lc3NhZ2UgJiYgcG9ydC5wb3N0TWVzc2FnZShhc3luY01lc3NhZ2UpKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChtZXNzYWdlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBwb3J0LnBvc3RNZXNzYWdlKG1lc3NhZ2UpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICAgIGNvbnN0IGlzUGFuZWwgPSBwb3J0LnNlbmRlci50YWIgPT0gbnVsbDtcbiAgICAgICAgICAgICAgICBpZiAoaXNQYW5lbCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBOT1RFOiBWaXZhbGRpIGFuZCBPcGVyYSBjYW4gc2hvdyBhIHBhZ2UgaW4gYSBzaWRlIHBhbmVsLFxuICAgICAgICAgICAgICAgICAgICAvLyBidXQgaXQgaXMgbm90IHBvc3NpYmxlIHRvIGhhbmRsZSBtZXNzYWdpbmcgY29ycmVjdGx5IChubyB0YWIgSUQsIGZyYW1lIElEKS5cbiAgICAgICAgICAgICAgICAgICAgcmVwbHkoe3VybDogcG9ydC5zZW5kZXIudXJsLCBmcmFtZVVSTDogbnVsbCwgdW5zdXBwb3J0ZWRTZW5kZXI6IHRydWV9KTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGNvbnN0IHRhYklkID0gcG9ydC5zZW5kZXIudGFiLmlkO1xuICAgICAgICAgICAgICAgIGNvbnN0IHtmcmFtZUlkfSA9IHBvcnQuc2VuZGVyO1xuICAgICAgICAgICAgICAgIGNvbnN0IHNlbmRlclVSTCA9IHBvcnQuc2VuZGVyLnVybDtcbiAgICAgICAgICAgICAgICBjb25zdCB0YWJVUkwgPSBwb3J0LnNlbmRlci50YWIudXJsO1xuXG4gICAgICAgICAgICAgICAgbGV0IGZyYW1lc1BvcnRzOiBNYXA8bnVtYmVyLCBQb3J0SW5mbz47XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMucG9ydHMuaGFzKHRhYklkKSkge1xuICAgICAgICAgICAgICAgICAgICBmcmFtZXNQb3J0cyA9IHRoaXMucG9ydHMuZ2V0KHRhYklkKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBmcmFtZXNQb3J0cyA9IG5ldyBNYXAoKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wb3J0cy5zZXQodGFiSWQsIGZyYW1lc1BvcnRzKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZnJhbWVzUG9ydHMuc2V0KGZyYW1lSWQsIHt1cmw6IHNlbmRlclVSTCwgcG9ydH0pO1xuICAgICAgICAgICAgICAgIHBvcnQub25EaXNjb25uZWN0LmFkZExpc3RlbmVyKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgZnJhbWVzUG9ydHMuZGVsZXRlKGZyYW1lSWQpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoZnJhbWVzUG9ydHMuc2l6ZSA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wb3J0cy5kZWxldGUodGFiSWQpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICByZXBseSh7XG4gICAgICAgICAgICAgICAgICAgIHVybDogdGFiVVJMLFxuICAgICAgICAgICAgICAgICAgICBmcmFtZVVSTDogZnJhbWVJZCA9PT0gMCA/IG51bGwgOiBzZW5kZXJVUkwsXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IGZpbGVMb2FkZXIgPSBjcmVhdGVGaWxlTG9hZGVyKCk7XG5cbiAgICAgICAgY2hyb21lLnJ1bnRpbWUub25NZXNzYWdlLmFkZExpc3RlbmVyKGFzeW5jICh7dHlwZSwgZGF0YSwgaWR9OiBNZXNzYWdlLCBzZW5kZXIpID0+IHtcbiAgICAgICAgICAgIGlmICh0eXBlID09PSAnZmV0Y2gnKSB7XG4gICAgICAgICAgICAgICAgY29uc3Qge3VybCwgcmVzcG9uc2VUeXBlLCBtaW1lVHlwZX0gPSBkYXRhO1xuXG4gICAgICAgICAgICAgICAgLy8gVXNpbmcgY3VzdG9tIHJlc3BvbnNlIGR1ZSB0byBDaHJvbWUgYW5kIEZpcmVmb3ggaW5jb21wYXRpYmlsaXR5XG4gICAgICAgICAgICAgICAgLy8gU29tZXRpbWVzIGZldGNoIGVycm9yIGJlaGF2ZXMgbGlrZSBzeW5jaHJvbm91cyBhbmQgc2VuZHMgYHVuZGVmaW5lZGBcbiAgICAgICAgICAgICAgICBjb25zdCBzZW5kUmVzcG9uc2UgPSAocmVzcG9uc2UpID0+IGNocm9tZS50YWJzLnNlbmRNZXNzYWdlKHNlbmRlci50YWIuaWQsIHt0eXBlOiAnZmV0Y2gtcmVzcG9uc2UnLCBpZCwgLi4ucmVzcG9uc2V9KTtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZpbGVMb2FkZXIuZ2V0KHt1cmwsIHJlc3BvbnNlVHlwZSwgbWltZVR5cGV9KTtcbiAgICAgICAgICAgICAgICAgICAgc2VuZFJlc3BvbnNlKHtkYXRhOiByZXNwb25zZX0pO1xuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgICAgICAgICBzZW5kUmVzcG9uc2Uoe2Vycm9yOiBlcnIgJiYgZXJyLm1lc3NhZ2UgPyBlcnIubWVzc2FnZSA6IGVycn0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHR5cGUgPT09ICdjb2xvci1zY2hlbWUtY2hhbmdlJykge1xuICAgICAgICAgICAgICAgIG9uQ29sb3JTY2hlbWVDaGFuZ2UoZGF0YSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodHlwZSA9PT0gJ3NhdmUtZmlsZScpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB7Y29udGVudCwgbmFtZX0gPSBkYXRhO1xuICAgICAgICAgICAgICAgIGNvbnN0IGEgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7XG4gICAgICAgICAgICAgICAgYS5ocmVmID0gVVJMLmNyZWF0ZU9iamVjdFVSTChuZXcgQmxvYihbY29udGVudF0pKTtcbiAgICAgICAgICAgICAgICBhLmRvd25sb2FkID0gbmFtZTtcbiAgICAgICAgICAgICAgICBhLmNsaWNrKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodHlwZSA9PT0gJ3JlcXVlc3QtZXhwb3J0LWNzcycpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBhY3RpdmVUYWIgPSBhd2FpdCB0aGlzLmdldEFjdGl2ZVRhYigpO1xuICAgICAgICAgICAgICAgIHRoaXMucG9ydHNcbiAgICAgICAgICAgICAgICAgICAgLmdldChhY3RpdmVUYWIuaWQpXG4gICAgICAgICAgICAgICAgICAgIC5nZXQoMCkucG9ydFxuICAgICAgICAgICAgICAgICAgICAucG9zdE1lc3NhZ2Uoe3R5cGU6ICdleHBvcnQtY3NzJ30pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBhc3luYyB1cGRhdGVDb250ZW50U2NyaXB0KG9wdGlvbnM6IHtydW5PblByb3RlY3RlZFBhZ2VzOiBib29sZWFufSkge1xuICAgICAgICAoYXdhaXQgcXVlcnlUYWJzKHt9KSlcbiAgICAgICAgICAgIC5maWx0ZXIoKHRhYikgPT4gb3B0aW9ucy5ydW5PblByb3RlY3RlZFBhZ2VzIHx8IGNhbkluamVjdFNjcmlwdCh0YWIudXJsKSlcbiAgICAgICAgICAgIC5maWx0ZXIoKHRhYikgPT4gIXRoaXMucG9ydHMuaGFzKHRhYi5pZCkpXG4gICAgICAgICAgICAuZm9yRWFjaCgodGFiKSA9PiAhdGFiLmRpc2NhcmRlZCAmJiBjaHJvbWUudGFicy5leGVjdXRlU2NyaXB0KHRhYi5pZCwge1xuICAgICAgICAgICAgICAgIHJ1bkF0OiAnZG9jdW1lbnRfc3RhcnQnLFxuICAgICAgICAgICAgICAgIGZpbGU6ICcvaW5qZWN0L2luZGV4LmpzJyxcbiAgICAgICAgICAgICAgICBhbGxGcmFtZXM6IHRydWUsXG4gICAgICAgICAgICAgICAgbWF0Y2hBYm91dEJsYW5rOiB0cnVlLFxuICAgICAgICAgICAgfSkpO1xuICAgIH1cblxuICAgIGFzeW5jIHNlbmRNZXNzYWdlKGdldE1lc3NhZ2U6ICh1cmw6IHN0cmluZywgZnJhbWVVcmw6IHN0cmluZykgPT4gYW55KSB7XG4gICAgICAgIChhd2FpdCBxdWVyeVRhYnMoe30pKVxuICAgICAgICAgICAgLmZpbHRlcigodGFiKSA9PiB0aGlzLnBvcnRzLmhhcyh0YWIuaWQpKVxuICAgICAgICAgICAgLmZvckVhY2goKHRhYikgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGZyYW1lc1BvcnRzID0gdGhpcy5wb3J0cy5nZXQodGFiLmlkKTtcbiAgICAgICAgICAgICAgICBmcmFtZXNQb3J0cy5mb3JFYWNoKCh7dXJsLCBwb3J0fSwgZnJhbWVJZCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBtZXNzYWdlID0gZ2V0TWVzc2FnZSh0YWIudXJsLCBmcmFtZUlkID09PSAwID8gbnVsbCA6IHVybCk7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0YWIuYWN0aXZlICYmIGZyYW1lSWQgPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHBvcnQucG9zdE1lc3NhZ2UobWVzc2FnZSk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHBvcnQucG9zdE1lc3NhZ2UobWVzc2FnZSkpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBhc3luYyBnZXRBY3RpdmVUYWJVUkwoKSB7XG4gICAgICAgIHJldHVybiAoYXdhaXQgdGhpcy5nZXRBY3RpdmVUYWIoKSkudXJsO1xuICAgIH1cbiAgICBhc3luYyBnZXRBY3RpdmVUYWIoKSB7XG4gICAgICAgIGxldCB0YWIgPSAoYXdhaXQgcXVlcnlUYWJzKHtcbiAgICAgICAgICAgIGFjdGl2ZTogdHJ1ZSxcbiAgICAgICAgICAgIGxhc3RGb2N1c2VkV2luZG93OiB0cnVlXG4gICAgICAgIH0pKVswXTtcbiAgICAgICAgLy8gV2hlbiBEYXJrIFJlYWRlcidzIERldiBUb29scyBhcmUgb3BlbiwgcXVlcnkgY2FuIHJldHVybiBleHRlbnNpb24ncyBwYWdlIGluc3RlYWQgb2YgZXhwZWN0ZWQgcGFnZVxuICAgICAgICBjb25zdCBpc0V4dGVuc2lvblBhZ2UgPSAodXJsOiBzdHJpbmcpID0+IHVybC5zdGFydHNXaXRoKCdjaHJvbWUtZXh0ZW5zaW9uOicpIHx8IHVybC5zdGFydHNXaXRoKCdtb3otZXh0ZW5zaW9uOicpO1xuICAgICAgICBpZiAoIXRhYiB8fCBpc0V4dGVuc2lvblBhZ2UodGFiLnVybCkpIHtcbiAgICAgICAgICAgIGNvbnN0IHRhYnMgPSAoYXdhaXQgcXVlcnlUYWJzKHthY3RpdmU6IHRydWV9KSk7XG4gICAgICAgICAgICB0YWIgPSB0YWJzLmZpbmQoKHQpID0+ICFpc0V4dGVuc2lvblBhZ2UodC51cmwpKSB8fCB0YWI7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRhYjtcbiAgICB9XG59XG4iLCJleHBvcnQgZGVmYXVsdCB7XG4gICAgY3NzRmlsdGVyOiAnY3NzRmlsdGVyJyxcbiAgICBzdmdGaWx0ZXI6ICdzdmdGaWx0ZXInLFxuICAgIHN0YXRpY1RoZW1lOiAnc3RhdGljVGhlbWUnLFxuICAgIGR5bmFtaWNUaGVtZTogJ2R5bmFtaWNUaGVtZScsXG59O1xuIiwiaW1wb3J0IHtUaGVtZSwgVXNlclNldHRpbmdzfSBmcm9tICcuL2RlZmluaXRpb25zJztcbmltcG9ydCBUaGVtZUVuZ2luZXMgZnJvbSAnLi9nZW5lcmF0b3JzL3RoZW1lLWVuZ2luZXMnO1xuaW1wb3J0IHtpc01hY09TLCBpc1dpbmRvd3N9IGZyb20gJy4vdXRpbHMvcGxhdGZvcm0nO1xuXG5leHBvcnQgY29uc3QgREVGQVVMVF9DT0xPUlMgPSB7XG4gICAgZGFya1NjaGVtZToge1xuICAgICAgICBiYWNrZ3JvdW5kOiAnIzE4MWExYicsXG4gICAgICAgIHRleHQ6ICcjZThlNmUzJyxcbiAgICB9LFxuICAgIGxpZ2h0U2NoZW1lOiB7XG4gICAgICAgIGJhY2tncm91bmQ6ICcjZGNkYWQ3JyxcbiAgICAgICAgdGV4dDogJyMxODFhMWInLFxuICAgIH0sXG59O1xuXG5leHBvcnQgY29uc3QgREVGQVVMVF9USEVNRTogVGhlbWUgPSB7XG4gICAgbW9kZTogMSxcbiAgICBicmlnaHRuZXNzOiAxMDAsXG4gICAgY29udHJhc3Q6IDEwMCxcbiAgICBncmF5c2NhbGU6IDAsXG4gICAgc2VwaWE6IDAsXG4gICAgdXNlRm9udDogZmFsc2UsXG4gICAgZm9udEZhbWlseTogaXNNYWNPUygpID8gJ0hlbHZldGljYSBOZXVlJyA6IGlzV2luZG93cygpID8gJ1NlZ29lIFVJJyA6ICdPcGVuIFNhbnMnLFxuICAgIHRleHRTdHJva2U6IDAsXG4gICAgZW5naW5lOiBUaGVtZUVuZ2luZXMuZHluYW1pY1RoZW1lLFxuICAgIHN0eWxlc2hlZXQ6ICcnLFxuICAgIGRhcmtTY2hlbWVCYWNrZ3JvdW5kQ29sb3I6IERFRkFVTFRfQ09MT1JTLmRhcmtTY2hlbWUuYmFja2dyb3VuZCxcbiAgICBkYXJrU2NoZW1lVGV4dENvbG9yOiBERUZBVUxUX0NPTE9SUy5kYXJrU2NoZW1lLnRleHQsXG4gICAgbGlnaHRTY2hlbWVCYWNrZ3JvdW5kQ29sb3I6IERFRkFVTFRfQ09MT1JTLmxpZ2h0U2NoZW1lLmJhY2tncm91bmQsXG4gICAgbGlnaHRTY2hlbWVUZXh0Q29sb3I6IERFRkFVTFRfQ09MT1JTLmxpZ2h0U2NoZW1lLnRleHQsXG4gICAgc2Nyb2xsYmFyQ29sb3I6IGlzTWFjT1MoKSA/ICcnIDogJ2F1dG8nLFxuICAgIHNlbGVjdGlvbkNvbG9yOiAnYXV0bycsXG4gICAgc3R5bGVTeXN0ZW1Db250cm9sczogdHJ1ZSxcbn07XG5cbmV4cG9ydCBjb25zdCBERUZBVUxUX1NFVFRJTkdTOiBVc2VyU2V0dGluZ3MgPSB7XG4gICAgZW5hYmxlZDogdHJ1ZSxcbiAgICB0aGVtZTogREVGQVVMVF9USEVNRSxcbiAgICBwcmVzZXRzOiBbXSxcbiAgICBjdXN0b21UaGVtZXM6IFtdLFxuICAgIHNpdGVMaXN0OiBbXSxcbiAgICBzaXRlTGlzdEVuYWJsZWQ6IFtdLFxuICAgIGFwcGx5VG9MaXN0ZWRPbmx5OiBmYWxzZSxcbiAgICBjaGFuZ2VCcm93c2VyVGhlbWU6IGZhbHNlLFxuICAgIG5vdGlmeU9mTmV3czogZmFsc2UsXG4gICAgc3luY1NldHRpbmdzOiB0cnVlLFxuICAgIHN5bmNTaXRlc0ZpeGVzOiBmYWxzZSxcbiAgICBhdXRvbWF0aW9uOiAnJyxcbiAgICB0aW1lOiB7XG4gICAgICAgIGFjdGl2YXRpb246ICcxODowMCcsXG4gICAgICAgIGRlYWN0aXZhdGlvbjogJzk6MDAnLFxuICAgIH0sXG4gICAgbG9jYXRpb246IHtcbiAgICAgICAgbGF0aXR1ZGU6IG51bGwsXG4gICAgICAgIGxvbmdpdHVkZTogbnVsbCxcbiAgICB9LFxuICAgIHByZXZpZXdOZXdEZXNpZ246IGZhbHNlLFxuICAgIGVuYWJsZUZvclBERjogdHJ1ZSxcbiAgICBlbmFibGVGb3JQcm90ZWN0ZWRQYWdlczogZmFsc2UsXG59O1xuIiwiZXhwb3J0IGZ1bmN0aW9uIGRlYm91bmNlPEYgZXh0ZW5kcyguLi5hcmdzOiBhbnlbXSkgPT4gYW55PihkZWxheTogbnVtYmVyLCBmbjogRik6IEYge1xuICAgIGxldCB0aW1lb3V0SWQ6IG51bWJlciA9IG51bGw7XG4gICAgcmV0dXJuICgoLi4uYXJnczogYW55W10pID0+IHtcbiAgICAgICAgaWYgKHRpbWVvdXRJZCkge1xuICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXRJZCk7XG4gICAgICAgIH1cbiAgICAgICAgdGltZW91dElkID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgICB0aW1lb3V0SWQgPSBudWxsO1xuICAgICAgICAgICAgZm4oLi4uYXJncyk7XG4gICAgICAgIH0sIGRlbGF5KTtcbiAgICB9KSBhcyBhbnk7XG59XG4iLCJpbXBvcnQge0RFRkFVTFRfU0VUVElOR1MsIERFRkFVTFRfVEhFTUV9IGZyb20gJy4uL2RlZmF1bHRzJztcbmltcG9ydCB7ZGVib3VuY2V9IGZyb20gJy4uL3V0aWxzL2RlYm91bmNlJztcbmltcG9ydCB7aXNVUkxNYXRjaGVkfSBmcm9tICcuLi91dGlscy91cmwnO1xuaW1wb3J0IHtVc2VyU2V0dGluZ3N9IGZyb20gJy4uL2RlZmluaXRpb25zJztcbmltcG9ydCB7cmVhZFN5bmNTdG9yYWdlLCByZWFkTG9jYWxTdG9yYWdlLCB3cml0ZVN5bmNTdG9yYWdlLCB3cml0ZUxvY2FsU3RvcmFnZX0gZnJvbSAnLi91dGlscy9leHRlbnNpb24tYXBpJztcblxuY29uc3QgU0FWRV9USU1FT1VUID0gMTAwMDtcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgVXNlclN0b3JhZ2Uge1xuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICB0aGlzLnNldHRpbmdzID0gbnVsbDtcbiAgICB9XG5cbiAgICBzZXR0aW5nczogUmVhZG9ubHk8VXNlclNldHRpbmdzPjtcblxuICAgIGFzeW5jIGxvYWRTZXR0aW5ncygpIHtcbiAgICAgICAgdGhpcy5zZXR0aW5ncyA9IGF3YWl0IHRoaXMubG9hZFNldHRpbmdzRnJvbVN0b3JhZ2UoKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGZpbGxEZWZhdWx0cyhzZXR0aW5nczogVXNlclNldHRpbmdzKSB7XG4gICAgICAgIHNldHRpbmdzLnRoZW1lID0gey4uLkRFRkFVTFRfVEhFTUUsIC4uLnNldHRpbmdzLnRoZW1lfTtcbiAgICAgICAgc2V0dGluZ3MudGltZSA9IHsuLi5ERUZBVUxUX1NFVFRJTkdTLnRpbWUsIC4uLnNldHRpbmdzLnRpbWV9O1xuICAgICAgICBzZXR0aW5ncy5wcmVzZXRzLmZvckVhY2goKHByZXNldCkgPT4ge1xuICAgICAgICAgICAgcHJlc2V0LnRoZW1lID0gey4uLkRFRkFVTFRfVEhFTUUsIC4uLnByZXNldC50aGVtZX07XG4gICAgICAgIH0pO1xuICAgICAgICBzZXR0aW5ncy5jdXN0b21UaGVtZXMuZm9yRWFjaCgoc2l0ZSkgPT4ge1xuICAgICAgICAgICAgc2l0ZS50aGVtZSA9IHsuLi5ERUZBVUxUX1RIRU1FLCAuLi5zaXRlLnRoZW1lfTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBsb2FkU2V0dGluZ3NGcm9tU3RvcmFnZSgpIHtcbiAgICAgICAgY29uc3QgbG9jYWwgPSBhd2FpdCByZWFkTG9jYWxTdG9yYWdlKERFRkFVTFRfU0VUVElOR1MpO1xuICAgICAgICBpZiAobG9jYWwuc3luY1NldHRpbmdzID09IG51bGwpIHtcbiAgICAgICAgICAgIGxvY2FsLnN5bmNTZXR0aW5ncyA9IERFRkFVTFRfU0VUVElOR1Muc3luY1NldHRpbmdzO1xuICAgICAgICB9XG4gICAgICAgIGlmICghbG9jYWwuc3luY1NldHRpbmdzKSB7XG4gICAgICAgICAgICB0aGlzLmZpbGxEZWZhdWx0cyhsb2NhbCk7XG4gICAgICAgICAgICByZXR1cm4gbG9jYWw7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCAkc3luYyA9IGF3YWl0IHJlYWRTeW5jU3RvcmFnZShERUZBVUxUX1NFVFRJTkdTKTtcbiAgICAgICAgaWYgKCEkc3luYykge1xuICAgICAgICAgICAgY29uc29sZS53YXJuKCdTeW5jIHNldHRpbmdzIGFyZSBtaXNzaW5nJyk7XG4gICAgICAgICAgICBsb2NhbC5zeW5jU2V0dGluZ3MgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMuc2V0KHtzeW5jU2V0dGluZ3M6IGZhbHNlfSk7XG4gICAgICAgICAgICB0aGlzLnNhdmVTeW5jU2V0dGluZyhmYWxzZSk7XG4gICAgICAgICAgICByZXR1cm4gbG9jYWw7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBzeW5jID0gYXdhaXQgcmVhZFN5bmNTdG9yYWdlKERFRkFVTFRfU0VUVElOR1MpO1xuICAgICAgICB0aGlzLmZpbGxEZWZhdWx0cyhzeW5jKTtcbiAgICAgICAgcmV0dXJuIHN5bmM7XG4gICAgfVxuXG4gICAgYXN5bmMgc2F2ZVNldHRpbmdzKCkge1xuICAgICAgICBhd2FpdCB0aGlzLnNhdmVTZXR0aW5nc0ludG9TdG9yYWdlKCk7XG4gICAgfVxuXG4gICAgYXN5bmMgc2F2ZVN5bmNTZXR0aW5nKHN5bmM6IGJvb2xlYW4pIHtcbiAgICAgICAgY29uc3Qgb2JqID0ge3N5bmNTZXR0aW5nczogc3luY307XG4gICAgICAgIGF3YWl0IHdyaXRlTG9jYWxTdG9yYWdlKG9iaik7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBhd2FpdCB3cml0ZVN5bmNTdG9yYWdlKG9iaik7XG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgY29uc29sZS53YXJuKCdTZXR0aW5ncyBzeW5jaHJvbml6YXRpb24gd2FzIGRpc2FibGVkIGR1ZSB0byBlcnJvcjonLCBjaHJvbWUucnVudGltZS5sYXN0RXJyb3IpO1xuICAgICAgICAgICAgdGhpcy5zZXQoe3N5bmNTZXR0aW5nczogZmFsc2V9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgc2F2ZVNldHRpbmdzSW50b1N0b3JhZ2UgPSBkZWJvdW5jZShTQVZFX1RJTUVPVVQsIGFzeW5jICgpID0+IHtcbiAgICAgICAgY29uc3Qgc2V0dGluZ3MgPSB0aGlzLnNldHRpbmdzO1xuICAgICAgICBpZiAoc2V0dGluZ3Muc3luY1NldHRpbmdzKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGF3YWl0IHdyaXRlU3luY1N0b3JhZ2Uoc2V0dGluZ3MpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS53YXJuKCdTZXR0aW5ncyBzeW5jaHJvbml6YXRpb24gd2FzIGRpc2FibGVkIGR1ZSB0byBlcnJvcjonLCBjaHJvbWUucnVudGltZS5sYXN0RXJyb3IpO1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0KHtzeW5jU2V0dGluZ3M6IGZhbHNlfSk7XG4gICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5zYXZlU3luY1NldHRpbmcoZmFsc2UpO1xuICAgICAgICAgICAgICAgIGF3YWl0IHdyaXRlTG9jYWxTdG9yYWdlKHNldHRpbmdzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGF3YWl0IHdyaXRlTG9jYWxTdG9yYWdlKHNldHRpbmdzKTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgc2V0KCRzZXR0aW5nczogUGFydGlhbDxVc2VyU2V0dGluZ3M+KSB7XG4gICAgICAgIGlmICgkc2V0dGluZ3Muc2l0ZUxpc3QpIHtcbiAgICAgICAgICAgIGlmICghQXJyYXkuaXNBcnJheSgkc2V0dGluZ3Muc2l0ZUxpc3QpKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgbGlzdCA9IFtdO1xuICAgICAgICAgICAgICAgIGZvciAoY29uc3Qga2V5IGluICgkc2V0dGluZ3Muc2l0ZUxpc3QgYXMgYW55KSkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBpbmRleCA9IE51bWJlcihrZXkpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIWlzTmFOKGluZGV4KSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgbGlzdFtpbmRleF0gPSAkc2V0dGluZ3Muc2l0ZUxpc3Rba2V5XTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAkc2V0dGluZ3Muc2l0ZUxpc3QgPSBsaXN0O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3Qgc2l0ZUxpc3QgPSAkc2V0dGluZ3Muc2l0ZUxpc3QuZmlsdGVyKChwYXR0ZXJuKSA9PiB7XG4gICAgICAgICAgICAgICAgbGV0IGlzT0sgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBpc1VSTE1hdGNoZWQoJ2h0dHBzOi8vZ29vZ2xlLmNvbS8nLCBwYXR0ZXJuKTtcbiAgICAgICAgICAgICAgICAgICAgaXNVUkxNYXRjaGVkKCdbOjoxXToxMzM3JywgcGF0dGVybik7XG4gICAgICAgICAgICAgICAgICAgIGlzT0sgPSB0cnVlO1xuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oYFBhdHRlcm4gXCIke3BhdHRlcm59XCIgZXhjbHVkZWRgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIGlzT0sgJiYgcGF0dGVybiAhPT0gJy8nO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAkc2V0dGluZ3MgPSB7Li4uJHNldHRpbmdzLCBzaXRlTGlzdH07XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5zZXR0aW5ncyA9IHsuLi50aGlzLnNldHRpbmdzLCAuLi4kc2V0dGluZ3N9O1xuICAgIH1cbn1cbiIsImV4cG9ydCBpbnRlcmZhY2UgUkdCQSB7XG4gICAgcjogbnVtYmVyO1xuICAgIGc6IG51bWJlcjtcbiAgICBiOiBudW1iZXI7XG4gICAgYT86IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBIU0xBIHtcbiAgICBoOiBudW1iZXI7XG4gICAgczogbnVtYmVyO1xuICAgIGw6IG51bWJlcjtcbiAgICBhPzogbnVtYmVyO1xufVxuXG4vLyBodHRwczovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9IU0xfYW5kX0hTVlxuZXhwb3J0IGZ1bmN0aW9uIGhzbFRvUkdCKHtoLCBzLCBsLCBhID0gMX06IEhTTEEpOiBSR0JBIHtcbiAgICBpZiAocyA9PT0gMCkge1xuICAgICAgICBjb25zdCBbciwgYiwgZ10gPSBbbCwgbCwgbF0ubWFwKCh4KSA9PiBNYXRoLnJvdW5kKHggKiAyNTUpKTtcbiAgICAgICAgcmV0dXJuIHtyLCBnLCBiLCBhfTtcbiAgICB9XG5cbiAgICBjb25zdCBjID0gKDEgLSBNYXRoLmFicygyICogbCAtIDEpKSAqIHM7XG4gICAgY29uc3QgeCA9IGMgKiAoMSAtIE1hdGguYWJzKChoIC8gNjApICUgMiAtIDEpKTtcbiAgICBjb25zdCBtID0gbCAtIGMgLyAyO1xuICAgIGNvbnN0IFtyLCBnLCBiXSA9IChcbiAgICAgICAgaCA8IDYwID8gW2MsIHgsIDBdIDpcbiAgICAgICAgICAgIGggPCAxMjAgPyBbeCwgYywgMF0gOlxuICAgICAgICAgICAgICAgIGggPCAxODAgPyBbMCwgYywgeF0gOlxuICAgICAgICAgICAgICAgICAgICBoIDwgMjQwID8gWzAsIHgsIGNdIDpcbiAgICAgICAgICAgICAgICAgICAgICAgIGggPCAzMDAgPyBbeCwgMCwgY10gOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFtjLCAwLCB4XVxuICAgICkubWFwKChuKSA9PiBNYXRoLnJvdW5kKChuICsgbSkgKiAyNTUpKTtcblxuICAgIHJldHVybiB7ciwgZywgYiwgYX07XG59XG5cbi8vIGh0dHBzOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL0hTTF9hbmRfSFNWXG5leHBvcnQgZnVuY3Rpb24gcmdiVG9IU0woe3I6IHIyNTUsIGc6IGcyNTUsIGI6IGIyNTUsIGEgPSAxfTogUkdCQSk6IEhTTEEge1xuICAgIGNvbnN0IHIgPSByMjU1IC8gMjU1O1xuICAgIGNvbnN0IGcgPSBnMjU1IC8gMjU1O1xuICAgIGNvbnN0IGIgPSBiMjU1IC8gMjU1O1xuXG4gICAgY29uc3QgbWF4ID0gTWF0aC5tYXgociwgZywgYik7XG4gICAgY29uc3QgbWluID0gTWF0aC5taW4ociwgZywgYik7XG4gICAgY29uc3QgYyA9IG1heCAtIG1pbjtcblxuICAgIGNvbnN0IGwgPSAobWF4ICsgbWluKSAvIDI7XG5cbiAgICBpZiAoYyA9PT0gMCkge1xuICAgICAgICByZXR1cm4ge2g6IDAsIHM6IDAsIGwsIGF9O1xuICAgIH1cblxuICAgIGxldCBoID0gKFxuICAgICAgICBtYXggPT09IHIgPyAoKChnIC0gYikgLyBjKSAlIDYpIDpcbiAgICAgICAgICAgIG1heCA9PT0gZyA/ICgoYiAtIHIpIC8gYyArIDIpIDpcbiAgICAgICAgICAgICAgICAoKHIgLSBnKSAvIGMgKyA0KVxuICAgICkgKiA2MDtcbiAgICBpZiAoaCA8IDApIHtcbiAgICAgICAgaCArPSAzNjA7XG4gICAgfVxuXG4gICAgY29uc3QgcyA9IGMgLyAoMSAtIE1hdGguYWJzKDIgKiBsIC0gMSkpO1xuXG4gICAgcmV0dXJuIHtoLCBzLCBsLCBhfTtcbn1cblxuZnVuY3Rpb24gdG9GaXhlZChuOiBudW1iZXIsIGRpZ2l0cyA9IDApIHtcbiAgICBjb25zdCBmaXhlZCA9IG4udG9GaXhlZChkaWdpdHMpO1xuICAgIGlmIChkaWdpdHMgPT09IDApIHtcbiAgICAgICAgcmV0dXJuIGZpeGVkO1xuICAgIH1cbiAgICBjb25zdCBkb3QgPSBmaXhlZC5pbmRleE9mKCcuJyk7XG4gICAgaWYgKGRvdCA+PSAwKSB7XG4gICAgICAgIGNvbnN0IHplcm9zTWF0Y2ggPSBmaXhlZC5tYXRjaCgvMCskLyk7XG4gICAgICAgIGlmICh6ZXJvc01hdGNoKSB7XG4gICAgICAgICAgICBpZiAoemVyb3NNYXRjaC5pbmRleCA9PT0gZG90ICsgMSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmaXhlZC5zdWJzdHJpbmcoMCwgZG90KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBmaXhlZC5zdWJzdHJpbmcoMCwgemVyb3NNYXRjaC5pbmRleCk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZpeGVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmdiVG9TdHJpbmcocmdiOiBSR0JBKSB7XG4gICAgY29uc3Qge3IsIGcsIGIsIGF9ID0gcmdiO1xuICAgIGlmIChhICE9IG51bGwgJiYgYSA8IDEpIHtcbiAgICAgICAgcmV0dXJuIGByZ2JhKCR7dG9GaXhlZChyKX0sICR7dG9GaXhlZChnKX0sICR7dG9GaXhlZChiKX0sICR7dG9GaXhlZChhLCAyKX0pYDtcbiAgICB9XG4gICAgcmV0dXJuIGByZ2IoJHt0b0ZpeGVkKHIpfSwgJHt0b0ZpeGVkKGcpfSwgJHt0b0ZpeGVkKGIpfSlgO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmdiVG9IZXhTdHJpbmcoe3IsIGcsIGIsIGF9OiBSR0JBKSB7XG4gICAgcmV0dXJuIGAjJHsoYSAhPSBudWxsICYmIGEgPCAxID8gW3IsIGcsIGIsIE1hdGgucm91bmQoYSAqIDI1NSldIDogW3IsIGcsIGJdKS5tYXAoKHgpID0+IHtcbiAgICAgICAgcmV0dXJuIGAke3ggPCAxNiA/ICcwJyA6ICcnfSR7eC50b1N0cmluZygxNil9YDtcbiAgICB9KS5qb2luKCcnKX1gO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaHNsVG9TdHJpbmcoaHNsOiBIU0xBKSB7XG4gICAgY29uc3Qge2gsIHMsIGwsIGF9ID0gaHNsO1xuICAgIGlmIChhICE9IG51bGwgJiYgYSA8IDEpIHtcbiAgICAgICAgcmV0dXJuIGBoc2xhKCR7dG9GaXhlZChoKX0sICR7dG9GaXhlZChzICogMTAwKX0lLCAke3RvRml4ZWQobCAqIDEwMCl9JSwgJHt0b0ZpeGVkKGEsIDIpfSlgO1xuICAgIH1cbiAgICByZXR1cm4gYGhzbCgke3RvRml4ZWQoaCl9LCAke3RvRml4ZWQocyAqIDEwMCl9JSwgJHt0b0ZpeGVkKGwgKiAxMDApfSUpYDtcbn1cblxuY29uc3QgcmdiTWF0Y2ggPSAvXnJnYmE/XFwoW15cXChcXCldK1xcKSQvO1xuY29uc3QgaHNsTWF0Y2ggPSAvXmhzbGE/XFwoW15cXChcXCldK1xcKSQvO1xuY29uc3QgaGV4TWF0Y2ggPSAvXiNbMC05YS1mXSskL2k7XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZSgkY29sb3I6IHN0cmluZyk6IFJHQkEge1xuICAgIGNvbnN0IGMgPSAkY29sb3IudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG5cbiAgICBpZiAoYy5tYXRjaChyZ2JNYXRjaCkpIHtcbiAgICAgICAgcmV0dXJuIHBhcnNlUkdCKGMpO1xuICAgIH1cblxuICAgIGlmIChjLm1hdGNoKGhzbE1hdGNoKSkge1xuICAgICAgICByZXR1cm4gcGFyc2VIU0woYyk7XG4gICAgfVxuXG4gICAgaWYgKGMubWF0Y2goaGV4TWF0Y2gpKSB7XG4gICAgICAgIHJldHVybiBwYXJzZUhleChjKTtcbiAgICB9XG5cbiAgICBpZiAoa25vd25Db2xvcnMuaGFzKGMpKSB7XG4gICAgICAgIHJldHVybiBnZXRDb2xvckJ5TmFtZShjKTtcbiAgICB9XG5cbiAgICBpZiAoc3lzdGVtQ29sb3JzLmhhcyhjKSkge1xuICAgICAgICByZXR1cm4gZ2V0U3lzdGVtQ29sb3IoYyk7XG4gICAgfVxuXG4gICAgaWYgKCRjb2xvciA9PT0gJ3RyYW5zcGFyZW50Jykge1xuICAgICAgICByZXR1cm4ge3I6IDAsIGc6IDAsIGI6IDAsIGE6IDB9O1xuICAgIH1cblxuICAgIHRocm93IG5ldyBFcnJvcihgVW5hYmxlIHRvIHBhcnNlICR7JGNvbG9yfWApO1xufVxuXG5mdW5jdGlvbiBnZXROdW1iZXJzRnJvbVN0cmluZyhzdHI6IHN0cmluZywgc3BsaXR0ZXI6IFJlZ0V4cCwgcmFuZ2U6IG51bWJlcltdLCB1bml0czoge1t1bml0OiBzdHJpbmddOiBudW1iZXJ9KSB7XG4gICAgY29uc3QgcmF3ID0gc3RyLnNwbGl0KHNwbGl0dGVyKS5maWx0ZXIoKHgpID0+IHgpO1xuICAgIGNvbnN0IHVuaXRzTGlzdCA9IE9iamVjdC5lbnRyaWVzKHVuaXRzKTtcbiAgICBjb25zdCBudW1iZXJzID0gcmF3Lm1hcCgocikgPT4gci50cmltKCkpLm1hcCgociwgaSkgPT4ge1xuICAgICAgICBsZXQgbjogbnVtYmVyO1xuICAgICAgICBjb25zdCB1bml0ID0gdW5pdHNMaXN0LmZpbmQoKFt1XSkgPT4gci5lbmRzV2l0aCh1KSk7XG4gICAgICAgIGlmICh1bml0KSB7XG4gICAgICAgICAgICBuID0gcGFyc2VGbG9hdChyLnN1YnN0cmluZygwLCByLmxlbmd0aCAtIHVuaXRbMF0ubGVuZ3RoKSkgLyB1bml0WzFdICogcmFuZ2VbaV07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBuID0gcGFyc2VGbG9hdChyKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAocmFuZ2VbaV0gPiAxKSB7XG4gICAgICAgICAgICByZXR1cm4gTWF0aC5yb3VuZChuKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbjtcbiAgICB9KTtcbiAgICByZXR1cm4gbnVtYmVycztcbn1cblxuY29uc3QgcmdiU3BsaXR0ZXIgPSAvcmdiYT98XFwofFxcKXxcXC98LHxcXHMvaWc7XG5jb25zdCByZ2JSYW5nZSA9IFsyNTUsIDI1NSwgMjU1LCAxXTtcbmNvbnN0IHJnYlVuaXRzID0geyclJzogMTAwfTtcblxuZnVuY3Rpb24gcGFyc2VSR0IoJHJnYjogc3RyaW5nKSB7XG4gICAgY29uc3QgW3IsIGcsIGIsIGEgPSAxXSA9IGdldE51bWJlcnNGcm9tU3RyaW5nKCRyZ2IsIHJnYlNwbGl0dGVyLCByZ2JSYW5nZSwgcmdiVW5pdHMpO1xuICAgIHJldHVybiB7ciwgZywgYiwgYX07XG59XG5cbmNvbnN0IGhzbFNwbGl0dGVyID0gL2hzbGE/fFxcKHxcXCl8XFwvfCx8XFxzL2lnO1xuY29uc3QgaHNsUmFuZ2UgPSBbMzYwLCAxLCAxLCAxXTtcbmNvbnN0IGhzbFVuaXRzID0geyclJzogMTAwLCAnZGVnJzogMzYwLCAncmFkJzogMiAqIE1hdGguUEksICd0dXJuJzogMX07XG5cbmZ1bmN0aW9uIHBhcnNlSFNMKCRoc2w6IHN0cmluZykge1xuICAgIGNvbnN0IFtoLCBzLCBsLCBhID0gMV0gPSBnZXROdW1iZXJzRnJvbVN0cmluZygkaHNsLCBoc2xTcGxpdHRlciwgaHNsUmFuZ2UsIGhzbFVuaXRzKTtcbiAgICByZXR1cm4gaHNsVG9SR0Ioe2gsIHMsIGwsIGF9KTtcbn1cblxuZnVuY3Rpb24gcGFyc2VIZXgoJGhleDogc3RyaW5nKSB7XG4gICAgY29uc3QgaCA9ICRoZXguc3Vic3RyaW5nKDEpO1xuICAgIHN3aXRjaCAoaC5sZW5ndGgpIHtcbiAgICAgICAgY2FzZSAzOlxuICAgICAgICBjYXNlIDQ6IHtcbiAgICAgICAgICAgIGNvbnN0IFtyLCBnLCBiXSA9IFswLCAxLCAyXS5tYXAoKGkpID0+IHBhcnNlSW50KGAke2hbaV19JHtoW2ldfWAsIDE2KSk7XG4gICAgICAgICAgICBjb25zdCBhID0gaC5sZW5ndGggPT09IDMgPyAxIDogKHBhcnNlSW50KGAke2hbM119JHtoWzNdfWAsIDE2KSAvIDI1NSk7XG4gICAgICAgICAgICByZXR1cm4ge3IsIGcsIGIsIGF9O1xuICAgICAgICB9XG4gICAgICAgIGNhc2UgNjpcbiAgICAgICAgY2FzZSA4OiB7XG4gICAgICAgICAgICBjb25zdCBbciwgZywgYl0gPSBbMCwgMiwgNF0ubWFwKChpKSA9PiBwYXJzZUludChoLnN1YnN0cmluZyhpLCBpICsgMiksIDE2KSk7XG4gICAgICAgICAgICBjb25zdCBhID0gaC5sZW5ndGggPT09IDYgPyAxIDogKHBhcnNlSW50KGguc3Vic3RyaW5nKDYsIDgpLCAxNikgLyAyNTUpO1xuICAgICAgICAgICAgcmV0dXJuIHtyLCBnLCBiLCBhfTtcbiAgICAgICAgfVxuICAgIH1cbiAgICB0aHJvdyBuZXcgRXJyb3IoYFVuYWJsZSB0byBwYXJzZSAkeyRoZXh9YCk7XG59XG5cbmZ1bmN0aW9uIGdldENvbG9yQnlOYW1lKCRjb2xvcjogc3RyaW5nKSB7XG4gICAgY29uc3QgbiA9IGtub3duQ29sb3JzLmdldCgkY29sb3IpO1xuICAgIHJldHVybiB7XG4gICAgICAgIHI6IChuID4+IDE2KSAmIDI1NSxcbiAgICAgICAgZzogKG4gPj4gOCkgJiAyNTUsXG4gICAgICAgIGI6IChuID4+IDApICYgMjU1LFxuICAgICAgICBhOiAxXG4gICAgfTtcbn1cblxuZnVuY3Rpb24gZ2V0U3lzdGVtQ29sb3IoJGNvbG9yOiBzdHJpbmcpIHtcbiAgICBjb25zdCBuID0gc3lzdGVtQ29sb3JzLmdldCgkY29sb3IpO1xuICAgIHJldHVybiB7XG4gICAgICAgIHI6IChuID4+IDE2KSAmIDI1NSxcbiAgICAgICAgZzogKG4gPj4gOCkgJiAyNTUsXG4gICAgICAgIGI6IChuID4+IDApICYgMjU1LFxuICAgICAgICBhOiAxXG4gICAgfTtcbn1cblxuY29uc3Qga25vd25Db2xvcnM6IE1hcDxzdHJpbmcsIG51bWJlcj4gPSBuZXcgTWFwKE9iamVjdC5lbnRyaWVzKHtcbiAgICBhbGljZWJsdWU6IDB4ZjBmOGZmLFxuICAgIGFudGlxdWV3aGl0ZTogMHhmYWViZDcsXG4gICAgYXF1YTogMHgwMGZmZmYsXG4gICAgYXF1YW1hcmluZTogMHg3ZmZmZDQsXG4gICAgYXp1cmU6IDB4ZjBmZmZmLFxuICAgIGJlaWdlOiAweGY1ZjVkYyxcbiAgICBiaXNxdWU6IDB4ZmZlNGM0LFxuICAgIGJsYWNrOiAweDAwMDAwMCxcbiAgICBibGFuY2hlZGFsbW9uZDogMHhmZmViY2QsXG4gICAgYmx1ZTogMHgwMDAwZmYsXG4gICAgYmx1ZXZpb2xldDogMHg4YTJiZTIsXG4gICAgYnJvd246IDB4YTUyYTJhLFxuICAgIGJ1cmx5d29vZDogMHhkZWI4ODcsXG4gICAgY2FkZXRibHVlOiAweDVmOWVhMCxcbiAgICBjaGFydHJldXNlOiAweDdmZmYwMCxcbiAgICBjaG9jb2xhdGU6IDB4ZDI2OTFlLFxuICAgIGNvcmFsOiAweGZmN2Y1MCxcbiAgICBjb3JuZmxvd2VyYmx1ZTogMHg2NDk1ZWQsXG4gICAgY29ybnNpbGs6IDB4ZmZmOGRjLFxuICAgIGNyaW1zb246IDB4ZGMxNDNjLFxuICAgIGN5YW46IDB4MDBmZmZmLFxuICAgIGRhcmtibHVlOiAweDAwMDA4YixcbiAgICBkYXJrY3lhbjogMHgwMDhiOGIsXG4gICAgZGFya2dvbGRlbnJvZDogMHhiODg2MGIsXG4gICAgZGFya2dyYXk6IDB4YTlhOWE5LFxuICAgIGRhcmtncmV5OiAweGE5YTlhOSxcbiAgICBkYXJrZ3JlZW46IDB4MDA2NDAwLFxuICAgIGRhcmtraGFraTogMHhiZGI3NmIsXG4gICAgZGFya21hZ2VudGE6IDB4OGIwMDhiLFxuICAgIGRhcmtvbGl2ZWdyZWVuOiAweDU1NmIyZixcbiAgICBkYXJrb3JhbmdlOiAweGZmOGMwMCxcbiAgICBkYXJrb3JjaGlkOiAweDk5MzJjYyxcbiAgICBkYXJrcmVkOiAweDhiMDAwMCxcbiAgICBkYXJrc2FsbW9uOiAweGU5OTY3YSxcbiAgICBkYXJrc2VhZ3JlZW46IDB4OGZiYzhmLFxuICAgIGRhcmtzbGF0ZWJsdWU6IDB4NDgzZDhiLFxuICAgIGRhcmtzbGF0ZWdyYXk6IDB4MmY0ZjRmLFxuICAgIGRhcmtzbGF0ZWdyZXk6IDB4MmY0ZjRmLFxuICAgIGRhcmt0dXJxdW9pc2U6IDB4MDBjZWQxLFxuICAgIGRhcmt2aW9sZXQ6IDB4OTQwMGQzLFxuICAgIGRlZXBwaW5rOiAweGZmMTQ5MyxcbiAgICBkZWVwc2t5Ymx1ZTogMHgwMGJmZmYsXG4gICAgZGltZ3JheTogMHg2OTY5NjksXG4gICAgZGltZ3JleTogMHg2OTY5NjksXG4gICAgZG9kZ2VyYmx1ZTogMHgxZTkwZmYsXG4gICAgZmlyZWJyaWNrOiAweGIyMjIyMixcbiAgICBmbG9yYWx3aGl0ZTogMHhmZmZhZjAsXG4gICAgZm9yZXN0Z3JlZW46IDB4MjI4YjIyLFxuICAgIGZ1Y2hzaWE6IDB4ZmYwMGZmLFxuICAgIGdhaW5zYm9ybzogMHhkY2RjZGMsXG4gICAgZ2hvc3R3aGl0ZTogMHhmOGY4ZmYsXG4gICAgZ29sZDogMHhmZmQ3MDAsXG4gICAgZ29sZGVucm9kOiAweGRhYTUyMCxcbiAgICBncmF5OiAweDgwODA4MCxcbiAgICBncmV5OiAweDgwODA4MCxcbiAgICBncmVlbjogMHgwMDgwMDAsXG4gICAgZ3JlZW55ZWxsb3c6IDB4YWRmZjJmLFxuICAgIGhvbmV5ZGV3OiAweGYwZmZmMCxcbiAgICBob3RwaW5rOiAweGZmNjliNCxcbiAgICBpbmRpYW5yZWQ6IDB4Y2Q1YzVjLFxuICAgIGluZGlnbzogMHg0YjAwODIsXG4gICAgaXZvcnk6IDB4ZmZmZmYwLFxuICAgIGtoYWtpOiAweGYwZTY4YyxcbiAgICBsYXZlbmRlcjogMHhlNmU2ZmEsXG4gICAgbGF2ZW5kZXJibHVzaDogMHhmZmYwZjUsXG4gICAgbGF3bmdyZWVuOiAweDdjZmMwMCxcbiAgICBsZW1vbmNoaWZmb246IDB4ZmZmYWNkLFxuICAgIGxpZ2h0Ymx1ZTogMHhhZGQ4ZTYsXG4gICAgbGlnaHRjb3JhbDogMHhmMDgwODAsXG4gICAgbGlnaHRjeWFuOiAweGUwZmZmZixcbiAgICBsaWdodGdvbGRlbnJvZHllbGxvdzogMHhmYWZhZDIsXG4gICAgbGlnaHRncmF5OiAweGQzZDNkMyxcbiAgICBsaWdodGdyZXk6IDB4ZDNkM2QzLFxuICAgIGxpZ2h0Z3JlZW46IDB4OTBlZTkwLFxuICAgIGxpZ2h0cGluazogMHhmZmI2YzEsXG4gICAgbGlnaHRzYWxtb246IDB4ZmZhMDdhLFxuICAgIGxpZ2h0c2VhZ3JlZW46IDB4MjBiMmFhLFxuICAgIGxpZ2h0c2t5Ymx1ZTogMHg4N2NlZmEsXG4gICAgbGlnaHRzbGF0ZWdyYXk6IDB4Nzc4ODk5LFxuICAgIGxpZ2h0c2xhdGVncmV5OiAweDc3ODg5OSxcbiAgICBsaWdodHN0ZWVsYmx1ZTogMHhiMGM0ZGUsXG4gICAgbGlnaHR5ZWxsb3c6IDB4ZmZmZmUwLFxuICAgIGxpbWU6IDB4MDBmZjAwLFxuICAgIGxpbWVncmVlbjogMHgzMmNkMzIsXG4gICAgbGluZW46IDB4ZmFmMGU2LFxuICAgIG1hZ2VudGE6IDB4ZmYwMGZmLFxuICAgIG1hcm9vbjogMHg4MDAwMDAsXG4gICAgbWVkaXVtYXF1YW1hcmluZTogMHg2NmNkYWEsXG4gICAgbWVkaXVtYmx1ZTogMHgwMDAwY2QsXG4gICAgbWVkaXVtb3JjaGlkOiAweGJhNTVkMyxcbiAgICBtZWRpdW1wdXJwbGU6IDB4OTM3MGRiLFxuICAgIG1lZGl1bXNlYWdyZWVuOiAweDNjYjM3MSxcbiAgICBtZWRpdW1zbGF0ZWJsdWU6IDB4N2I2OGVlLFxuICAgIG1lZGl1bXNwcmluZ2dyZWVuOiAweDAwZmE5YSxcbiAgICBtZWRpdW10dXJxdW9pc2U6IDB4NDhkMWNjLFxuICAgIG1lZGl1bXZpb2xldHJlZDogMHhjNzE1ODUsXG4gICAgbWlkbmlnaHRibHVlOiAweDE5MTk3MCxcbiAgICBtaW50Y3JlYW06IDB4ZjVmZmZhLFxuICAgIG1pc3R5cm9zZTogMHhmZmU0ZTEsXG4gICAgbW9jY2FzaW46IDB4ZmZlNGI1LFxuICAgIG5hdmFqb3doaXRlOiAweGZmZGVhZCxcbiAgICBuYXZ5OiAweDAwMDA4MCxcbiAgICBvbGRsYWNlOiAweGZkZjVlNixcbiAgICBvbGl2ZTogMHg4MDgwMDAsXG4gICAgb2xpdmVkcmFiOiAweDZiOGUyMyxcbiAgICBvcmFuZ2U6IDB4ZmZhNTAwLFxuICAgIG9yYW5nZXJlZDogMHhmZjQ1MDAsXG4gICAgb3JjaGlkOiAweGRhNzBkNixcbiAgICBwYWxlZ29sZGVucm9kOiAweGVlZThhYSxcbiAgICBwYWxlZ3JlZW46IDB4OThmYjk4LFxuICAgIHBhbGV0dXJxdW9pc2U6IDB4YWZlZWVlLFxuICAgIHBhbGV2aW9sZXRyZWQ6IDB4ZGI3MDkzLFxuICAgIHBhcGF5YXdoaXA6IDB4ZmZlZmQ1LFxuICAgIHBlYWNocHVmZjogMHhmZmRhYjksXG4gICAgcGVydTogMHhjZDg1M2YsXG4gICAgcGluazogMHhmZmMwY2IsXG4gICAgcGx1bTogMHhkZGEwZGQsXG4gICAgcG93ZGVyYmx1ZTogMHhiMGUwZTYsXG4gICAgcHVycGxlOiAweDgwMDA4MCxcbiAgICByZWJlY2NhcHVycGxlOiAweDY2MzM5OSxcbiAgICByZWQ6IDB4ZmYwMDAwLFxuICAgIHJvc3licm93bjogMHhiYzhmOGYsXG4gICAgcm95YWxibHVlOiAweDQxNjllMSxcbiAgICBzYWRkbGVicm93bjogMHg4YjQ1MTMsXG4gICAgc2FsbW9uOiAweGZhODA3MixcbiAgICBzYW5keWJyb3duOiAweGY0YTQ2MCxcbiAgICBzZWFncmVlbjogMHgyZThiNTcsXG4gICAgc2Vhc2hlbGw6IDB4ZmZmNWVlLFxuICAgIHNpZW5uYTogMHhhMDUyMmQsXG4gICAgc2lsdmVyOiAweGMwYzBjMCxcbiAgICBza3libHVlOiAweDg3Y2VlYixcbiAgICBzbGF0ZWJsdWU6IDB4NmE1YWNkLFxuICAgIHNsYXRlZ3JheTogMHg3MDgwOTAsXG4gICAgc2xhdGVncmV5OiAweDcwODA5MCxcbiAgICBzbm93OiAweGZmZmFmYSxcbiAgICBzcHJpbmdncmVlbjogMHgwMGZmN2YsXG4gICAgc3RlZWxibHVlOiAweDQ2ODJiNCxcbiAgICB0YW46IDB4ZDJiNDhjLFxuICAgIHRlYWw6IDB4MDA4MDgwLFxuICAgIHRoaXN0bGU6IDB4ZDhiZmQ4LFxuICAgIHRvbWF0bzogMHhmZjYzNDcsXG4gICAgdHVycXVvaXNlOiAweDQwZTBkMCxcbiAgICB2aW9sZXQ6IDB4ZWU4MmVlLFxuICAgIHdoZWF0OiAweGY1ZGViMyxcbiAgICB3aGl0ZTogMHhmZmZmZmYsXG4gICAgd2hpdGVzbW9rZTogMHhmNWY1ZjUsXG4gICAgeWVsbG93OiAweGZmZmYwMCxcbiAgICB5ZWxsb3dncmVlbjogMHg5YWNkMzIsXG59KSk7XG5cbmNvbnN0IHN5c3RlbUNvbG9yczogTWFwPHN0cmluZywgbnVtYmVyPiA9IG5ldyBNYXAoT2JqZWN0LmVudHJpZXMoe1xuICAgIEFjdGl2ZUJvcmRlcjogMHgzYjk5ZmMsXG4gICAgQWN0aXZlQ2FwdGlvbjogMHgwMDAwMDAsXG4gICAgQXBwV29ya3NwYWNlOiAweGFhYWFhYSxcbiAgICBCYWNrZ3JvdW5kOiAweDYzNjNjZSxcbiAgICBCdXR0b25GYWNlOiAweGZmZmZmZixcbiAgICBCdXR0b25IaWdobGlnaHQ6IDB4ZTllOWU5LFxuICAgIEJ1dHRvblNoYWRvdzogMHg5ZmEwOWYsXG4gICAgQnV0dG9uVGV4dDogMHgwMDAwMDAsXG4gICAgQ2FwdGlvblRleHQ6IDB4MDAwMDAwLFxuICAgIEdyYXlUZXh0OiAweDdmN2Y3ZixcbiAgICBIaWdobGlnaHQ6IDB4YjJkN2ZmLFxuICAgIEhpZ2hsaWdodFRleHQ6IDB4MDAwMDAwLFxuICAgIEluYWN0aXZlQm9yZGVyOiAweGZmZmZmZixcbiAgICBJbmFjdGl2ZUNhcHRpb246IDB4ZmZmZmZmLFxuICAgIEluYWN0aXZlQ2FwdGlvblRleHQ6IDB4MDAwMDAwLFxuICAgIEluZm9CYWNrZ3JvdW5kOiAweGZiZmNjNSxcbiAgICBJbmZvVGV4dDogMHgwMDAwMDAsXG4gICAgTWVudTogMHhmNmY2ZjYsXG4gICAgTWVudVRleHQ6IDB4ZmZmZmZmLFxuICAgIFNjcm9sbGJhcjogMHhhYWFhYWEsXG4gICAgVGhyZWVERGFya1NoYWRvdzogMHgwMDAwMDAsXG4gICAgVGhyZWVERmFjZTogMHhjMGMwYzAsXG4gICAgVGhyZWVESGlnaGxpZ2h0OiAweGZmZmZmZixcbiAgICBUaHJlZURMaWdodFNoYWRvdzogMHhmZmZmZmYsXG4gICAgVGhyZWVEU2hhZG93OiAweDAwMDAwMCxcbiAgICBXaW5kb3c6IDB4ZWNlY2VjLFxuICAgIFdpbmRvd0ZyYW1lOiAweGFhYWFhYSxcbiAgICBXaW5kb3dUZXh0OiAweDAwMDAwMCxcbiAgICAnLXdlYmtpdC1mb2N1cy1yaW5nLWNvbG9yJzogMHhlNTk3MDBcbn0pLm1hcCgoW2tleSwgdmFsdWVdKSA9PiBba2V5LnRvTG93ZXJDYXNlKCksIHZhbHVlXSBhcyBbc3RyaW5nLCBudW1iZXJdKSk7XG4iLCJpbXBvcnQge0ZpbHRlckNvbmZpZywgVGhlbWV9IGZyb20gJy4uL2RlZmluaXRpb25zJztcbmltcG9ydCB7cGFyc2UsIHJnYlRvSFNMLCBoc2xUb1JHQiwgcmdiVG9TdHJpbmcsIHJnYlRvSGV4U3RyaW5nLCBSR0JBLCBIU0xBfSBmcm9tICcuLi91dGlscy9jb2xvcic7XG5pbXBvcnQge3NjYWxlfSBmcm9tICcuLi91dGlscy9tYXRoJztcbmltcG9ydCB7YXBwbHlDb2xvck1hdHJpeCwgY3JlYXRlRmlsdGVyTWF0cml4fSBmcm9tICcuL3V0aWxzL21hdHJpeCc7XG5cbmludGVyZmFjZSBDb2xvckZ1bmN0aW9uIHtcbiAgICAoaHNsOiBIU0xBKTogSFNMQTtcbn1cblxuZnVuY3Rpb24gZ2V0QmdQb2xlKHRoZW1lOiBUaGVtZSkge1xuICAgIGNvbnN0IGlzRGFya1NjaGVtZSA9IHRoZW1lLm1vZGUgPT09IDE7XG4gICAgY29uc3QgcHJvcDoga2V5b2YgVGhlbWUgPSBpc0RhcmtTY2hlbWUgPyAnZGFya1NjaGVtZUJhY2tncm91bmRDb2xvcicgOiAnbGlnaHRTY2hlbWVCYWNrZ3JvdW5kQ29sb3InO1xuICAgIHJldHVybiB0aGVtZVtwcm9wXTtcbn1cblxuZnVuY3Rpb24gZ2V0RmdQb2xlKHRoZW1lOiBUaGVtZSkge1xuICAgIGNvbnN0IGlzRGFya1NjaGVtZSA9IHRoZW1lLm1vZGUgPT09IDE7XG4gICAgY29uc3QgcHJvcDoga2V5b2YgVGhlbWUgPSBpc0RhcmtTY2hlbWUgPyAnZGFya1NjaGVtZVRleHRDb2xvcicgOiAnbGlnaHRTY2hlbWVUZXh0Q29sb3InO1xuICAgIHJldHVybiB0aGVtZVtwcm9wXTtcbn1cblxuY29uc3QgY29sb3JNb2RpZmljYXRpb25DYWNoZSA9IG5ldyBNYXA8Q29sb3JGdW5jdGlvbiwgTWFwPHN0cmluZywgc3RyaW5nPj4oKTtcbmNvbnN0IGNvbG9yUGFyc2VDYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBIU0xBPigpO1xuXG5mdW5jdGlvbiBwYXJzZVRvSFNMV2l0aENhY2hlKGNvbG9yOiBzdHJpbmcpIHtcbiAgICBpZiAoY29sb3JQYXJzZUNhY2hlLmhhcyhjb2xvcikpIHtcbiAgICAgICAgcmV0dXJuIGNvbG9yUGFyc2VDYWNoZS5nZXQoY29sb3IpO1xuICAgIH1cbiAgICBjb25zdCByZ2IgPSBwYXJzZShjb2xvcik7XG4gICAgY29uc3QgaHNsID0gcmdiVG9IU0wocmdiKTtcbiAgICBjb2xvclBhcnNlQ2FjaGUuc2V0KGNvbG9yLCBoc2wpO1xuICAgIHJldHVybiBoc2w7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjbGVhckNvbG9yTW9kaWZpY2F0aW9uQ2FjaGUoKSB7XG4gICAgY29sb3JNb2RpZmljYXRpb25DYWNoZS5jbGVhcigpO1xuICAgIGNvbG9yUGFyc2VDYWNoZS5jbGVhcigpO1xufVxuXG5jb25zdCByZ2JDYWNoZUtleXM6IChrZXlvZiBSR0JBKVtdID0gWydyJywgJ2cnLCAnYicsICdhJ107XG5jb25zdCB0aGVtZUNhY2hlS2V5czogKGtleW9mIFRoZW1lKVtdID0gWydtb2RlJywgJ2JyaWdodG5lc3MnLCAnY29udHJhc3QnLCAnZ3JheXNjYWxlJywgJ3NlcGlhJywgJ2RhcmtTY2hlbWVCYWNrZ3JvdW5kQ29sb3InLCAnZGFya1NjaGVtZVRleHRDb2xvcicsICdsaWdodFNjaGVtZUJhY2tncm91bmRDb2xvcicsICdsaWdodFNjaGVtZVRleHRDb2xvciddO1xuXG5mdW5jdGlvbiBnZXRDYWNoZUlkKHJnYjogUkdCQSwgdGhlbWU6IFRoZW1lKSB7XG4gICAgcmV0dXJuIHJnYkNhY2hlS2V5cy5tYXAoKGspID0+IHJnYltrXSBhcyBhbnkpXG4gICAgICAgIC5jb25jYXQodGhlbWVDYWNoZUtleXMubWFwKChrKSA9PiB0aGVtZVtrXSkpXG4gICAgICAgIC5qb2luKCc7Jyk7XG59XG5cbmZ1bmN0aW9uIG1vZGlmeUNvbG9yV2l0aENhY2hlKHJnYjogUkdCQSwgdGhlbWU6IFRoZW1lLCBtb2RpZnlIU0w6IChoc2w6IEhTTEEsIHBvbGU/OiBIU0xBLCBhbm90aGVyUG9sZT86IEhTTEEpID0+IEhTTEEsIHBvbGVDb2xvcj86IHN0cmluZywgYW5vdGhlclBvbGVDb2xvcj86IHN0cmluZykge1xuICAgIGxldCBmbkNhY2hlOiBNYXA8c3RyaW5nLCBzdHJpbmc+O1xuICAgIGlmIChjb2xvck1vZGlmaWNhdGlvbkNhY2hlLmhhcyhtb2RpZnlIU0wpKSB7XG4gICAgICAgIGZuQ2FjaGUgPSBjb2xvck1vZGlmaWNhdGlvbkNhY2hlLmdldChtb2RpZnlIU0wpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIGZuQ2FjaGUgPSBuZXcgTWFwKCk7XG4gICAgICAgIGNvbG9yTW9kaWZpY2F0aW9uQ2FjaGUuc2V0KG1vZGlmeUhTTCwgZm5DYWNoZSk7XG4gICAgfVxuICAgIGNvbnN0IGlkID0gZ2V0Q2FjaGVJZChyZ2IsIHRoZW1lKTtcbiAgICBpZiAoZm5DYWNoZS5oYXMoaWQpKSB7XG4gICAgICAgIHJldHVybiBmbkNhY2hlLmdldChpZCk7XG4gICAgfVxuXG4gICAgY29uc3QgaHNsID0gcmdiVG9IU0wocmdiKTtcbiAgICBjb25zdCBwb2xlID0gcG9sZUNvbG9yID09IG51bGwgPyBudWxsIDogcGFyc2VUb0hTTFdpdGhDYWNoZShwb2xlQ29sb3IpO1xuICAgIGNvbnN0IGFub3RoZXJQb2xlID0gYW5vdGhlclBvbGVDb2xvciA9PSBudWxsID8gbnVsbCA6IHBhcnNlVG9IU0xXaXRoQ2FjaGUoYW5vdGhlclBvbGVDb2xvcik7XG4gICAgY29uc3QgbW9kaWZpZWQgPSBtb2RpZnlIU0woaHNsLCBwb2xlLCBhbm90aGVyUG9sZSk7XG4gICAgY29uc3Qge3IsIGcsIGIsIGF9ID0gaHNsVG9SR0IobW9kaWZpZWQpO1xuICAgIGNvbnN0IG1hdHJpeCA9IGNyZWF0ZUZpbHRlck1hdHJpeCh0aGVtZSk7XG4gICAgY29uc3QgW3JmLCBnZiwgYmZdID0gYXBwbHlDb2xvck1hdHJpeChbciwgZywgYl0sIG1hdHJpeCk7XG5cbiAgICBjb25zdCBjb2xvciA9IChhID09PSAxID9cbiAgICAgICAgcmdiVG9IZXhTdHJpbmcoe3I6IHJmLCBnOiBnZiwgYjogYmZ9KSA6XG4gICAgICAgIHJnYlRvU3RyaW5nKHtyOiByZiwgZzogZ2YsIGI6IGJmLCBhfSkpO1xuXG4gICAgZm5DYWNoZS5zZXQoaWQsIGNvbG9yKTtcbiAgICByZXR1cm4gY29sb3I7XG59XG5cbmZ1bmN0aW9uIG5vb3BIU0woaHNsOiBIU0xBKSB7XG4gICAgcmV0dXJuIGhzbDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1vZGlmeUNvbG9yKHJnYjogUkdCQSwgdGhlbWU6IEZpbHRlckNvbmZpZykge1xuICAgIHJldHVybiBtb2RpZnlDb2xvcldpdGhDYWNoZShyZ2IsIHRoZW1lLCBub29wSFNMKTtcbn1cblxuZnVuY3Rpb24gbW9kaWZ5TGlnaHRTY2hlbWVDb2xvcihyZ2I6IFJHQkEsIHRoZW1lOiBUaGVtZSkge1xuICAgIGNvbnN0IHBvbGVCZyA9IGdldEJnUG9sZSh0aGVtZSk7XG4gICAgY29uc3QgcG9sZUZnID0gZ2V0RmdQb2xlKHRoZW1lKTtcbiAgICByZXR1cm4gbW9kaWZ5Q29sb3JXaXRoQ2FjaGUocmdiLCB0aGVtZSwgbW9kaWZ5TGlnaHRNb2RlSFNMLCBwb2xlRmcsIHBvbGVCZyk7XG59XG5cbmZ1bmN0aW9uIG1vZGlmeUxpZ2h0TW9kZUhTTCh7aCwgcywgbCwgYX0sIHBvbGVGZzogSFNMQSwgcG9sZUJnOiBIU0xBKSB7XG4gICAgY29uc3QgaXNEYXJrID0gbCA8IDAuNTtcbiAgICBsZXQgaXNOZXV0cmFsOiBib29sZWFuO1xuICAgIGlmIChpc0RhcmspIHtcbiAgICAgICAgaXNOZXV0cmFsID0gbCA8IDAuMiB8fCBzIDwgMC4xMjtcbiAgICB9IGVsc2Uge1xuICAgICAgICBjb25zdCBpc0JsdWUgPSBoID4gMjAwICYmIGggPCAyODA7XG4gICAgICAgIGlzTmV1dHJhbCA9IHMgPCAwLjI0IHx8IChsID4gMC44ICYmIGlzQmx1ZSk7XG4gICAgfVxuXG4gICAgbGV0IGh4ID0gaDtcbiAgICBsZXQgc3ggPSBsO1xuICAgIGlmIChpc05ldXRyYWwpIHtcbiAgICAgICAgaWYgKGlzRGFyaykge1xuICAgICAgICAgICAgaHggPSBwb2xlRmcuaDtcbiAgICAgICAgICAgIHN4ID0gcG9sZUZnLnM7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBoeCA9IHBvbGVCZy5oO1xuICAgICAgICAgICAgc3ggPSBwb2xlQmcucztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IGx4ID0gc2NhbGUobCwgMCwgMSwgcG9sZUZnLmwsIHBvbGVCZy5sKTtcblxuICAgIHJldHVybiB7aDogaHgsIHM6IHN4LCBsOiBseCwgYX07XG59XG5cbmNvbnN0IE1BWF9CR19MSUdIVE5FU1MgPSAwLjQ7XG5cbmZ1bmN0aW9uIG1vZGlmeUJnSFNMKHtoLCBzLCBsLCBhfTogSFNMQSwgcG9sZTogSFNMQSkge1xuICAgIGNvbnN0IGlzRGFyayA9IGwgPCAwLjU7XG4gICAgY29uc3QgaXNCbHVlID0gaCA+IDIwMCAmJiBoIDwgMjgwO1xuICAgIGNvbnN0IGlzTmV1dHJhbCA9IHMgPCAwLjEyIHx8IChsID4gMC44ICYmIGlzQmx1ZSk7XG4gICAgaWYgKGlzRGFyaykge1xuICAgICAgICBjb25zdCBseCA9IHNjYWxlKGwsIDAsIDAuNSwgMCwgTUFYX0JHX0xJR0hUTkVTUyk7XG4gICAgICAgIGlmIChpc05ldXRyYWwpIHtcbiAgICAgICAgICAgIGNvbnN0IGh4ID0gcG9sZS5oO1xuICAgICAgICAgICAgY29uc3Qgc3ggPSBwb2xlLnM7XG4gICAgICAgICAgICByZXR1cm4ge2g6IGh4LCBzOiBzeCwgbDogbHgsIGF9O1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7aCwgcywgbDogbHgsIGF9O1xuICAgIH1cblxuICAgIGNvbnN0IGx4ID0gc2NhbGUobCwgMC41LCAxLCBNQVhfQkdfTElHSFRORVNTLCBwb2xlLmwpO1xuXG4gICAgaWYgKGlzTmV1dHJhbCkge1xuICAgICAgICBjb25zdCBoeCA9IHBvbGUuaDtcbiAgICAgICAgY29uc3Qgc3ggPSBwb2xlLnM7XG4gICAgICAgIHJldHVybiB7aDogaHgsIHM6IHN4LCBsOiBseCwgYX07XG4gICAgfVxuXG4gICAgbGV0IGh4ID0gaDtcbiAgICBjb25zdCBpc1llbGxvdyA9IGggPiA2MCAmJiBoIDwgMTgwO1xuICAgIGlmIChpc1llbGxvdykge1xuICAgICAgICBjb25zdCBpc0Nsb3NlclRvR3JlZW4gPSBoID4gMTIwO1xuICAgICAgICBpZiAoaXNDbG9zZXJUb0dyZWVuKSB7XG4gICAgICAgICAgICBoeCA9IHNjYWxlKGgsIDEyMCwgMTgwLCAxMzUsIDE4MCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBoeCA9IHNjYWxlKGgsIDYwLCAxMjAsIDYwLCAxMDUpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHtoOiBoeCwgcywgbDogbHgsIGF9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbW9kaWZ5QmFja2dyb3VuZENvbG9yKHJnYjogUkdCQSwgdGhlbWU6IFRoZW1lKSB7XG4gICAgaWYgKHRoZW1lLm1vZGUgPT09IDApIHtcbiAgICAgICAgcmV0dXJuIG1vZGlmeUxpZ2h0U2NoZW1lQ29sb3IocmdiLCB0aGVtZSk7XG4gICAgfVxuICAgIGNvbnN0IHBvbGUgPSBnZXRCZ1BvbGUodGhlbWUpO1xuICAgIHJldHVybiBtb2RpZnlDb2xvcldpdGhDYWNoZShyZ2IsIHsuLi50aGVtZSwgbW9kZTogMH0sIG1vZGlmeUJnSFNMLCBwb2xlKTtcbn1cblxuY29uc3QgTUlOX0ZHX0xJR0hUTkVTUyA9IDAuNTU7XG5cbmZ1bmN0aW9uIG1vZGlmeUJsdWVGZ0h1ZShodWU6IG51bWJlcikge1xuICAgIHJldHVybiBzY2FsZShodWUsIDIwNSwgMjQ1LCAyMDUsIDIyMCk7XG59XG5cbmZ1bmN0aW9uIG1vZGlmeUZnSFNMKHtoLCBzLCBsLCBhfTogSFNMQSwgcG9sZTogSFNMQSkge1xuICAgIGNvbnN0IGlzTGlnaHQgPSBsID4gMC41O1xuICAgIGNvbnN0IGlzTmV1dHJhbCA9IGwgPCAwLjIgfHwgcyA8IDAuMjQ7XG4gICAgY29uc3QgaXNCbHVlID0gIWlzTmV1dHJhbCAmJiBoID4gMjA1ICYmIGggPCAyNDU7XG4gICAgaWYgKGlzTGlnaHQpIHtcbiAgICAgICAgY29uc3QgbHggPSBzY2FsZShsLCAwLjUsIDEsIE1JTl9GR19MSUdIVE5FU1MsIHBvbGUubCk7XG4gICAgICAgIGlmIChpc05ldXRyYWwpIHtcbiAgICAgICAgICAgIGNvbnN0IGh4ID0gcG9sZS5oO1xuICAgICAgICAgICAgY29uc3Qgc3ggPSBwb2xlLnM7XG4gICAgICAgICAgICByZXR1cm4ge2g6IGh4LCBzOiBzeCwgbDogbHgsIGF9O1xuICAgICAgICB9XG4gICAgICAgIGxldCBoeCA9IGg7XG4gICAgICAgIGlmIChpc0JsdWUpIHtcbiAgICAgICAgICAgIGh4ID0gbW9kaWZ5Qmx1ZUZnSHVlKGgpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7aDogaHgsIHMsIGw6IGx4LCBhfTtcbiAgICB9XG5cbiAgICBpZiAoaXNOZXV0cmFsKSB7XG4gICAgICAgIGNvbnN0IGh4ID0gcG9sZS5oO1xuICAgICAgICBjb25zdCBzeCA9IHBvbGUucztcbiAgICAgICAgY29uc3QgbHggPSBzY2FsZShsLCAwLCAwLjUsIHBvbGUubCwgTUlOX0ZHX0xJR0hUTkVTUyk7XG4gICAgICAgIHJldHVybiB7aDogaHgsIHM6IHN4LCBsOiBseCwgYX07XG4gICAgfVxuXG4gICAgbGV0IGh4ID0gaDtcbiAgICBsZXQgbHggPSBsO1xuICAgIGlmIChpc0JsdWUpIHtcbiAgICAgICAgaHggPSBtb2RpZnlCbHVlRmdIdWUoaCk7XG4gICAgICAgIGx4ID0gc2NhbGUobCwgMCwgMC41LCBwb2xlLmwsIE1hdGgubWluKDEsIE1JTl9GR19MSUdIVE5FU1MgKyAwLjA1KSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgbHggPSBzY2FsZShsLCAwLCAwLjUsIHBvbGUubCwgTUlOX0ZHX0xJR0hUTkVTUyk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtoOiBoeCwgcywgbDogbHgsIGF9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbW9kaWZ5Rm9yZWdyb3VuZENvbG9yKHJnYjogUkdCQSwgdGhlbWU6IFRoZW1lKSB7XG4gICAgaWYgKHRoZW1lLm1vZGUgPT09IDApIHtcbiAgICAgICAgcmV0dXJuIG1vZGlmeUxpZ2h0U2NoZW1lQ29sb3IocmdiLCB0aGVtZSk7XG4gICAgfVxuICAgIGNvbnN0IHBvbGUgPSBnZXRGZ1BvbGUodGhlbWUpO1xuICAgIHJldHVybiBtb2RpZnlDb2xvcldpdGhDYWNoZShyZ2IsIHsuLi50aGVtZSwgbW9kZTogMH0sIG1vZGlmeUZnSFNMLCBwb2xlKTtcbn1cblxuZnVuY3Rpb24gbW9kaWZ5Qm9yZGVySFNMKHtoLCBzLCBsLCBhfSwgcG9sZUZnOiBIU0xBLCBwb2xlQmc6IEhTTEEpIHtcbiAgICBjb25zdCBpc0RhcmsgPSBsIDwgMC41O1xuICAgIGNvbnN0IGlzTmV1dHJhbCA9IGwgPCAwLjIgfHwgcyA8IDAuMjQ7XG5cbiAgICBsZXQgaHggPSBoO1xuICAgIGxldCBzeCA9IHM7XG5cbiAgICBpZiAoaXNOZXV0cmFsKSB7XG4gICAgICAgIGlmIChpc0RhcmspIHtcbiAgICAgICAgICAgIGh4ID0gcG9sZUZnLmg7XG4gICAgICAgICAgICBzeCA9IHBvbGVGZy5zO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaHggPSBwb2xlQmcuaDtcbiAgICAgICAgICAgIHN4ID0gcG9sZUJnLnM7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBseCA9IHNjYWxlKGwsIDAsIDEsIDAuNSwgMC4yKTtcblxuICAgIHJldHVybiB7aDogaHgsIHM6IHN4LCBsOiBseCwgYX07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtb2RpZnlCb3JkZXJDb2xvcihyZ2I6IFJHQkEsIHRoZW1lOiBUaGVtZSkge1xuICAgIGlmICh0aGVtZS5tb2RlID09PSAwKSB7XG4gICAgICAgIHJldHVybiBtb2RpZnlMaWdodFNjaGVtZUNvbG9yKHJnYiwgdGhlbWUpO1xuICAgIH1cbiAgICBjb25zdCBwb2xlRmcgPSBnZXRGZ1BvbGUodGhlbWUpO1xuICAgIGNvbnN0IHBvbGVCZyA9IGdldEJnUG9sZSh0aGVtZSk7XG4gICAgcmV0dXJuIG1vZGlmeUNvbG9yV2l0aENhY2hlKHJnYiwgey4uLnRoZW1lLCBtb2RlOiAwfSwgbW9kaWZ5Qm9yZGVySFNMLCBwb2xlRmcsIHBvbGVCZyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtb2RpZnlTaGFkb3dDb2xvcihyZ2I6IFJHQkEsIGZpbHRlcjogRmlsdGVyQ29uZmlnKSB7XG4gICAgcmV0dXJuIG1vZGlmeUJhY2tncm91bmRDb2xvcihyZ2IsIGZpbHRlcik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtb2RpZnlHcmFkaWVudENvbG9yKHJnYjogUkdCQSwgZmlsdGVyOiBGaWx0ZXJDb25maWcpIHtcbiAgICByZXR1cm4gbW9kaWZ5QmFja2dyb3VuZENvbG9yKHJnYiwgZmlsdGVyKTtcbn1cbiIsImltcG9ydCB7cGFyc2UsIFJHQkF9IGZyb20gJy4uL3V0aWxzL2NvbG9yJztcbmltcG9ydCB7bW9kaWZ5QmFja2dyb3VuZENvbG9yLCBtb2RpZnlGb3JlZ3JvdW5kQ29sb3IsIG1vZGlmeUJvcmRlckNvbG9yfSBmcm9tICcuLi9nZW5lcmF0b3JzL21vZGlmeS1jb2xvcnMnO1xuaW1wb3J0IHtGaWx0ZXJDb25maWd9IGZyb20gJy4uL2RlZmluaXRpb25zJztcblxuZGVjbGFyZSBjb25zdCBicm93c2VyOiB7XG4gICAgdGhlbWU6IHtcbiAgICAgICAgdXBkYXRlOiAoKHRoZW1lOiBhbnkpID0+IFByb21pc2U8dm9pZD4pO1xuICAgICAgICByZXNldDogKCgpID0+IFByb21pc2U8dm9pZD4pO1xuICAgIH07XG59O1xuXG5jb25zdCB0aGVtZUNvbG9yVHlwZXMgPSB7XG4gICAgYWNjZW50Y29sb3I6ICdiZycsXG4gICAgYnV0dG9uX2JhY2tncm91bmRfYWN0aXZlOiAndGV4dCcsXG4gICAgYnV0dG9uX2JhY2tncm91bmRfaG92ZXI6ICd0ZXh0JyxcbiAgICBmcmFtZTogJ2JnJyxcbiAgICBpY29uczogJ3RleHQnLFxuICAgIGljb25zX2F0dGVudGlvbjogJ3RleHQnLFxuICAgIHBvcHVwOiAnYmcnLFxuICAgIHBvcHVwX2JvcmRlcjogJ2JnJyxcbiAgICBwb3B1cF9oaWdobGlnaHQ6ICdiZycsXG4gICAgcG9wdXBfaGlnaGxpZ2h0X3RleHQ6ICd0ZXh0JyxcbiAgICBwb3B1cF90ZXh0OiAndGV4dCcsXG4gICAgdGFiX2JhY2tncm91bmRfdGV4dDogJ3RleHQnLFxuICAgIHRhYl9saW5lOiAnYmcnLFxuICAgIHRhYl9sb2FkaW5nOiAnYmcnLFxuICAgIHRhYl9zZWxlY3RlZDogJ2JnJyxcbiAgICB0ZXh0Y29sb3I6ICd0ZXh0JyxcbiAgICB0b29sYmFyOiAnYmcnLFxuICAgIHRvb2xiYXJfYm90dG9tX3NlcGFyYXRvcjogJ2JvcmRlcicsXG4gICAgdG9vbGJhcl9maWVsZDogJ2JnJyxcbiAgICB0b29sYmFyX2ZpZWxkX2JvcmRlcjogJ2JvcmRlcicsXG4gICAgdG9vbGJhcl9maWVsZF9ib3JkZXJfZm9jdXM6ICdib3JkZXInLFxuICAgIHRvb2xiYXJfZmllbGRfZm9jdXM6ICdiZycsXG4gICAgdG9vbGJhcl9maWVsZF9zZXBhcmF0b3I6ICdib3JkZXInLFxuICAgIHRvb2xiYXJfZmllbGRfdGV4dDogJ3RleHQnLFxuICAgIHRvb2xiYXJfZmllbGRfdGV4dF9mb2N1czogJ3RleHQnLFxuICAgIHRvb2xiYXJfdGV4dDogJ3RleHQnLFxuICAgIHRvb2xiYXJfdG9wX3NlcGFyYXRvcjogJ2JvcmRlcicsXG4gICAgdG9vbGJhcl92ZXJ0aWNhbF9zZXBhcmF0b3I6ICdib3JkZXInLFxufTtcblxuY29uc3QgJGNvbG9ycyA9IHtcbiAgICAvLyAnYWNjZW50Y29sb3InIGlzIHRoZSBkZXByZWNhdGVkIHByZWRlY2Vzc29yIG9mICdmcmFtZScuXG4gICAgLy8gaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9Nb3ppbGxhL0FkZC1vbnMvV2ViRXh0ZW5zaW9ucy9tYW5pZmVzdC5qc29uL3RoZW1lI2NvbG9yc1xuICAgIGFjY2VudGNvbG9yOiAnIzExMTExMScsXG4gICAgZnJhbWU6ICcjMTExMTExJyxcbiAgICBwb3B1cDogJyNjY2NjY2MnLFxuICAgIHBvcHVwX3RleHQ6ICdibGFjaycsXG4gICAgdGFiX2JhY2tncm91bmRfdGV4dDogJ3doaXRlJyxcbiAgICB0YWJfbGluZTogJyMyM2FlZmYnLFxuICAgIHRhYl9sb2FkaW5nOiAnIzIzYWVmZicsXG4gICAgLy8gJ3RleHRjb2xvcicgaXMgdGhlIHByZWRlY2Vzc29yIG9mICd0YWJfYmFja2dyb3VuZF90ZXh0Jy5cbiAgICAvLyBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL01vemlsbGEvQWRkLW9ucy9XZWJFeHRlbnNpb25zL21hbmlmZXN0Lmpzb24vdGhlbWUjY29sb3JzXG4gICAgdGV4dGNvbG9yOiAnd2hpdGUnLFxuICAgIHRvb2xiYXI6ICcjNzA3MDcwJyxcbiAgICB0b29sYmFyX2ZpZWxkOiAnbGlnaHRncmF5JyxcbiAgICB0b29sYmFyX2ZpZWxkX3RleHQ6ICdibGFjaycsXG59O1xuXG5leHBvcnQgZnVuY3Rpb24gc2V0V2luZG93VGhlbWUoZmlsdGVyOiBGaWx0ZXJDb25maWcpIHtcbiAgICBjb25zdCBjb2xvcnMgPSBPYmplY3QuZW50cmllcygkY29sb3JzKS5yZWR1Y2UoKG9iaiwgW2tleSwgdmFsdWVdKSA9PiB7XG4gICAgICAgIGNvbnN0IHR5cGUgPSB0aGVtZUNvbG9yVHlwZXNba2V5XTtcbiAgICAgICAgY29uc3QgbW9kaWZ5OiAoKHJnYjogUkdCQSwgZmlsdGVyOiBGaWx0ZXJDb25maWcpID0+IHN0cmluZykgPSB7XG4gICAgICAgICAgICAnYmcnOiBtb2RpZnlCYWNrZ3JvdW5kQ29sb3IsXG4gICAgICAgICAgICAndGV4dCc6IG1vZGlmeUZvcmVncm91bmRDb2xvcixcbiAgICAgICAgICAgICdib3JkZXInOiBtb2RpZnlCb3JkZXJDb2xvcixcbiAgICAgICAgfVt0eXBlXTtcbiAgICAgICAgY29uc3QgcmdiID0gcGFyc2UodmFsdWUpO1xuICAgICAgICBjb25zdCBtb2RpZmllZCA9IG1vZGlmeShyZ2IsIGZpbHRlcik7XG4gICAgICAgIG9ialtrZXldID0gbW9kaWZpZWQ7XG4gICAgICAgIHJldHVybiBvYmo7XG4gICAgfSwge30pO1xuICAgIGlmICh0eXBlb2YgYnJvd3NlciAhPT0gJ3VuZGVmaW5lZCcgJiYgYnJvd3Nlci50aGVtZSAmJiBicm93c2VyLnRoZW1lLnVwZGF0ZSkge1xuICAgICAgICBicm93c2VyLnRoZW1lLnVwZGF0ZSh7Y29sb3JzfSk7XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVzZXRXaW5kb3dUaGVtZSgpIHtcbiAgICBpZiAodHlwZW9mIGJyb3dzZXIgIT09ICd1bmRlZmluZWQnICYmIGJyb3dzZXIudGhlbWUgJiYgYnJvd3Nlci50aGVtZS5yZXNldCkge1xuICAgICAgICAvLyBCVUc6IHJlc2V0cyBicm93c2VyIHRoZW1lIHRvIGVudGlyZVxuICAgICAgICAvLyBodHRwczovL2J1Z3ppbGxhLm1vemlsbGEub3JnL3Nob3dfYnVnLmNnaT9pZD0xNDE1MjY3XG4gICAgICAgIGJyb3dzZXIudGhlbWUucmVzZXQoKTtcbiAgICB9XG59XG4iLCJpbXBvcnQge2NyZWF0ZUZpbHRlck1hdHJpeCwgTWF0cml4fSBmcm9tICcuL3V0aWxzL21hdHJpeCc7XG5pbXBvcnQge2lzRmlyZWZveH0gZnJvbSAnLi4vdXRpbHMvcGxhdGZvcm0nO1xuaW1wb3J0IHtjc3NGaWx0ZXJTdHlsZWhlZXRUZW1wbGF0ZX0gZnJvbSAnLi9jc3MtZmlsdGVyJztcbmltcG9ydCB7RmlsdGVyQ29uZmlnLCBJbnZlcnNpb25GaXh9IGZyb20gJy4uL2RlZmluaXRpb25zJztcblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVNWR0ZpbHRlclN0eWxlc2hlZXQoY29uZmlnOiBGaWx0ZXJDb25maWcsIHVybDogc3RyaW5nLCBmcmFtZVVSTDogc3RyaW5nLCBpbnZlcnNpb25GaXhlczogSW52ZXJzaW9uRml4W10pIHtcbiAgICBsZXQgZmlsdGVyVmFsdWU6IHN0cmluZztcbiAgICBsZXQgcmV2ZXJzZUZpbHRlclZhbHVlOiBzdHJpbmc7XG4gICAgaWYgKGlzRmlyZWZveCgpKSB7XG4gICAgICAgIGZpbHRlclZhbHVlID0gZ2V0RW1iZWRkZWRTVkdGaWx0ZXJWYWx1ZShnZXRTVkdGaWx0ZXJNYXRyaXhWYWx1ZShjb25maWcpKTtcbiAgICAgICAgcmV2ZXJzZUZpbHRlclZhbHVlID0gZ2V0RW1iZWRkZWRTVkdGaWx0ZXJWYWx1ZShnZXRTVkdSZXZlcnNlRmlsdGVyTWF0cml4VmFsdWUoKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgLy8gQ2hyb21lIGZhaWxzIHdpdGggXCJVbnNhZmUgYXR0ZW1wdCB0byBsb2FkIFVSTCAuLi4gRG9tYWlucywgcHJvdG9jb2xzIGFuZCBwb3J0cyBtdXN0IG1hdGNoLlxuICAgICAgICBmaWx0ZXJWYWx1ZSA9ICd1cmwoI2RhcmstcmVhZGVyLWZpbHRlciknO1xuICAgICAgICByZXZlcnNlRmlsdGVyVmFsdWUgPSAndXJsKCNkYXJrLXJlYWRlci1yZXZlcnNlLWZpbHRlciknO1xuICAgIH1cbiAgICByZXR1cm4gY3NzRmlsdGVyU3R5bGVoZWV0VGVtcGxhdGUoZmlsdGVyVmFsdWUsIHJldmVyc2VGaWx0ZXJWYWx1ZSwgY29uZmlnLCB1cmwsIGZyYW1lVVJMLCBpbnZlcnNpb25GaXhlcyk7XG59XG5cbmZ1bmN0aW9uIGdldEVtYmVkZGVkU1ZHRmlsdGVyVmFsdWUobWF0cml4VmFsdWU6IHN0cmluZykge1xuICAgIGNvbnN0IGlkID0gJ2RhcmstcmVhZGVyLWZpbHRlcic7XG4gICAgY29uc3Qgc3ZnID0gW1xuICAgICAgICAnPHN2ZyB4bWxucz1cImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCI+JyxcbiAgICAgICAgYDxmaWx0ZXIgaWQ9XCIke2lkfVwiIHN0eWxlPVwiY29sb3ItaW50ZXJwb2xhdGlvbi1maWx0ZXJzOiBzUkdCO1wiPmAsXG4gICAgICAgIGA8ZmVDb2xvck1hdHJpeCB0eXBlPVwibWF0cml4XCIgdmFsdWVzPVwiJHttYXRyaXhWYWx1ZX1cIiAvPmAsXG4gICAgICAgICc8L2ZpbHRlcj4nLFxuICAgICAgICAnPC9zdmc+JyxcbiAgICBdLmpvaW4oJycpO1xuICAgIHJldHVybiBgdXJsKGRhdGE6aW1hZ2Uvc3ZnK3htbDtiYXNlNjQsJHtidG9hKHN2Zyl9IyR7aWR9KWA7XG59XG5cbmZ1bmN0aW9uIHRvU1ZHTWF0cml4KG1hdHJpeDogbnVtYmVyW11bXSkge1xuICAgIHJldHVybiBtYXRyaXguc2xpY2UoMCwgNCkubWFwKG0gPT4gbS5tYXAobSA9PiBtLnRvRml4ZWQoMykpLmpvaW4oJyAnKSkuam9pbignICcpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0U1ZHRmlsdGVyTWF0cml4VmFsdWUoY29uZmlnOiBGaWx0ZXJDb25maWcpIHtcbiAgICByZXR1cm4gdG9TVkdNYXRyaXgoY3JlYXRlRmlsdGVyTWF0cml4KGNvbmZpZykpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0U1ZHUmV2ZXJzZUZpbHRlck1hdHJpeFZhbHVlKCkge1xuICAgIHJldHVybiB0b1NWR01hdHJpeChNYXRyaXguaW52ZXJ0Tkh1ZSgpKTtcbn1cbiIsImNvbnN0IG1hdGNoZXNNZWRpYVF1ZXJ5ID0gKHF1ZXJ5OiBzdHJpbmcpID0+IEJvb2xlYW4od2luZG93Lm1hdGNoTWVkaWEocXVlcnkpLm1hdGNoZXMpO1xuXG5jb25zdCBtYXRjaGVzRGFya1RoZW1lID0gKCkgPT4gbWF0Y2hlc01lZGlhUXVlcnkoJyhwcmVmZXJzLWNvbG9yLXNjaGVtZTogZGFyayknKTtcbmNvbnN0IG1hdGNoZXNMaWdodFRoZW1lID0gKCkgPT4gbWF0Y2hlc01lZGlhUXVlcnkoJyhwcmVmZXJzLWNvbG9yLXNjaGVtZTogbGlnaHQpJyk7XG5cbmNvbnN0IGlzQ29sb3JTY2hlbWVTdXBwb3J0ZWQgPSBtYXRjaGVzRGFya1RoZW1lKCkgfHwgbWF0Y2hlc0xpZ2h0VGhlbWUoKTtcblxuZXhwb3J0IGZ1bmN0aW9uIGlzU3lzdGVtRGFya01vZGVFbmFibGVkKCkge1xuICAgIGlmICghaXNDb2xvclNjaGVtZVN1cHBvcnRlZCkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHJldHVybiBtYXRjaGVzRGFya1RoZW1lKCk7XG59XG4iLCJpbXBvcnQgQ29uZmlnTWFuYWdlciBmcm9tICcuL2NvbmZpZy1tYW5hZ2VyJztcbmltcG9ydCBEZXZUb29scyBmcm9tICcuL2RldnRvb2xzJztcbmltcG9ydCBJY29uTWFuYWdlciBmcm9tICcuL2ljb24tbWFuYWdlcic7XG5pbXBvcnQgTWVzc2VuZ2VyLCB7RXh0ZW5zaW9uQWRhcHRlcn0gZnJvbSAnLi9tZXNzZW5nZXInO1xuaW1wb3J0IE5ld3NtYWtlciBmcm9tICcuL25ld3NtYWtlcic7XG5pbXBvcnQgVGFiTWFuYWdlciBmcm9tICcuL3RhYi1tYW5hZ2VyJztcbmltcG9ydCBVc2VyU3RvcmFnZSBmcm9tICcuL3VzZXItc3RvcmFnZSc7XG5pbXBvcnQge3NldFdpbmRvd1RoZW1lLCByZXNldFdpbmRvd1RoZW1lfSBmcm9tICcuL3dpbmRvdy10aGVtZSc7XG5pbXBvcnQge2dldEZvbnRMaXN0LCBnZXRDb21tYW5kcywgc2V0U2hvcnRjdXQsIGNhbkluamVjdFNjcmlwdH0gZnJvbSAnLi91dGlscy9leHRlbnNpb24tYXBpJztcbmltcG9ydCB7aXNGaXJlZm94fSBmcm9tICcuLi91dGlscy9wbGF0Zm9ybSc7XG5pbXBvcnQge2lzSW5UaW1lSW50ZXJ2YWwsIGdldER1cmF0aW9uLCBpc05pZ2h0QXRMb2NhdGlvbn0gZnJvbSAnLi4vdXRpbHMvdGltZSc7XG5pbXBvcnQge2lzVVJMSW5MaXN0LCBnZXRVUkxIb3N0T3JQcm90b2NvbCwgaXNVUkxFbmFibGVkfSBmcm9tICcuLi91dGlscy91cmwnO1xuaW1wb3J0IFRoZW1lRW5naW5lcyBmcm9tICcuLi9nZW5lcmF0b3JzL3RoZW1lLWVuZ2luZXMnO1xuaW1wb3J0IGNyZWF0ZUNTU0ZpbHRlclN0eWxlc2hlZXQgZnJvbSAnLi4vZ2VuZXJhdG9ycy9jc3MtZmlsdGVyJztcbmltcG9ydCB7Z2V0RHluYW1pY1RoZW1lRml4ZXNGb3J9IGZyb20gJy4uL2dlbmVyYXRvcnMvZHluYW1pYy10aGVtZSc7XG5pbXBvcnQgY3JlYXRlU3RhdGljU3R5bGVzaGVldCBmcm9tICcuLi9nZW5lcmF0b3JzL3N0YXRpYy10aGVtZSc7XG5pbXBvcnQge2NyZWF0ZVNWR0ZpbHRlclN0eWxlc2hlZXQsIGdldFNWR0ZpbHRlck1hdHJpeFZhbHVlLCBnZXRTVkdSZXZlcnNlRmlsdGVyTWF0cml4VmFsdWV9IGZyb20gJy4uL2dlbmVyYXRvcnMvc3ZnLWZpbHRlcic7XG5pbXBvcnQge0V4dGVuc2lvbkRhdGEsIEZpbHRlckNvbmZpZywgTmV3cywgU2hvcnRjdXRzLCBVc2VyU2V0dGluZ3MsIFRhYkluZm99IGZyb20gJy4uL2RlZmluaXRpb25zJztcbmltcG9ydCB7aXNTeXN0ZW1EYXJrTW9kZUVuYWJsZWR9IGZyb20gJy4uL3V0aWxzL21lZGlhLXF1ZXJ5JztcblxuY29uc3QgQVVUT19USU1FX0NIRUNLX0lOVEVSVkFMID0gZ2V0RHVyYXRpb24oe3NlY29uZHM6IDEwfSk7XG5cbmV4cG9ydCBjbGFzcyBFeHRlbnNpb24ge1xuICAgIHJlYWR5OiBib29sZWFuO1xuXG4gICAgY29uZmlnOiBDb25maWdNYW5hZ2VyO1xuICAgIGRldnRvb2xzOiBEZXZUb29scztcbiAgICBmb250czogc3RyaW5nW107XG4gICAgaWNvbjogSWNvbk1hbmFnZXI7XG4gICAgbWVzc2VuZ2VyOiBNZXNzZW5nZXI7XG4gICAgbmV3czogTmV3c21ha2VyO1xuICAgIHRhYnM6IFRhYk1hbmFnZXI7XG4gICAgdXNlcjogVXNlclN0b3JhZ2U7XG5cbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgdGhpcy5yZWFkeSA9IGZhbHNlO1xuXG4gICAgICAgIHRoaXMuaWNvbiA9IG5ldyBJY29uTWFuYWdlcigpO1xuICAgICAgICB0aGlzLmNvbmZpZyA9IG5ldyBDb25maWdNYW5hZ2VyKCk7XG4gICAgICAgIHRoaXMuZGV2dG9vbHMgPSBuZXcgRGV2VG9vbHModGhpcy5jb25maWcsICgpID0+IHRoaXMub25TZXR0aW5nc0NoYW5nZWQoKSk7XG4gICAgICAgIHRoaXMubWVzc2VuZ2VyID0gbmV3IE1lc3Nlbmdlcih0aGlzLmdldE1lc3NlbmdlckFkYXB0ZXIoKSk7XG4gICAgICAgIHRoaXMubmV3cyA9IG5ldyBOZXdzbWFrZXIoKG5ld3MpID0+IHRoaXMub25OZXdzVXBkYXRlKG5ld3MpKTtcbiAgICAgICAgdGhpcy50YWJzID0gbmV3IFRhYk1hbmFnZXIoe1xuICAgICAgICAgICAgZ2V0Q29ubmVjdGlvbk1lc3NhZ2U6ICh7dXJsLCBmcmFtZVVSTCwgdW5zdXBwb3J0ZWRTZW5kZXJ9KSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKHVuc3VwcG9ydGVkU2VuZGVyKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmdldFVuc3VwcG9ydGVkU2VuZGVyTWVzc2FnZSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5nZXRDb25uZWN0aW9uTWVzc2FnZSh1cmwsIGZyYW1lVVJMKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBvbkNvbG9yU2NoZW1lQ2hhbmdlOiB0aGlzLm9uQ29sb3JTY2hlbWVDaGFuZ2UsXG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLnVzZXIgPSBuZXcgVXNlclN0b3JhZ2UoKTtcbiAgICAgICAgdGhpcy5hd2FpdGluZyA9IFtdO1xuICAgIH1cblxuICAgIGlzRW5hYmxlZCgpIHtcbiAgICAgICAgY29uc3Qge2F1dG9tYXRpb259ID0gdGhpcy51c2VyLnNldHRpbmdzO1xuICAgICAgICBpZiAoYXV0b21hdGlvbiA9PT0gJ3RpbWUnKSB7XG4gICAgICAgICAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpO1xuICAgICAgICAgICAgcmV0dXJuIGlzSW5UaW1lSW50ZXJ2YWwobm93LCB0aGlzLnVzZXIuc2V0dGluZ3MudGltZS5hY3RpdmF0aW9uLCB0aGlzLnVzZXIuc2V0dGluZ3MudGltZS5kZWFjdGl2YXRpb24pO1xuICAgICAgICB9IGVsc2UgaWYgKGF1dG9tYXRpb24gPT09ICdzeXN0ZW0nKSB7XG4gICAgICAgICAgICBpZiAoaXNGaXJlZm94KCkpIHtcbiAgICAgICAgICAgICAgICAvLyBCVUc6IEZpcmVmb3ggYmFja2dyb3VuZCBwYWdlIGFsd2F5cyBtYXRjaGVzIGluaXRpYWwgY29sb3Igc2NoZW1lLlxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLndhc0xhc3RDb2xvclNjaGVtZURhcmsgPT0gbnVsbFxuICAgICAgICAgICAgICAgICAgICA/IGlzU3lzdGVtRGFya01vZGVFbmFibGVkKClcbiAgICAgICAgICAgICAgICAgICAgOiB0aGlzLndhc0xhc3RDb2xvclNjaGVtZURhcms7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gaXNTeXN0ZW1EYXJrTW9kZUVuYWJsZWQoKTtcbiAgICAgICAgfSBlbHNlIGlmIChhdXRvbWF0aW9uID09PSAnbG9jYXRpb24nKSB7XG4gICAgICAgICAgICBjb25zdCBsYXRpdHVkZSA9IHRoaXMudXNlci5zZXR0aW5ncy5sb2NhdGlvbi5sYXRpdHVkZTtcbiAgICAgICAgICAgIGNvbnN0IGxvbmdpdHVkZSA9IHRoaXMudXNlci5zZXR0aW5ncy5sb2NhdGlvbi5sb25naXR1ZGU7XG5cbiAgICAgICAgICAgIGlmIChsYXRpdHVkZSAhPSBudWxsICYmIGxvbmdpdHVkZSAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgbm93ID0gbmV3IERhdGUoKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gaXNOaWdodEF0TG9jYXRpb24obm93LCBsYXRpdHVkZSwgbG9uZ2l0dWRlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0aGlzLnVzZXIuc2V0dGluZ3MuZW5hYmxlZDtcbiAgICB9XG5cbiAgICBwcml2YXRlIGF3YWl0aW5nOiAoKCkgPT4gdm9pZClbXTtcblxuICAgIGFzeW5jIHN0YXJ0KCkge1xuICAgICAgICBhd2FpdCB0aGlzLmNvbmZpZy5sb2FkKHtsb2NhbDogdHJ1ZX0pO1xuICAgICAgICB0aGlzLmZvbnRzID0gYXdhaXQgZ2V0Rm9udExpc3QoKTtcblxuICAgICAgICBhd2FpdCB0aGlzLnVzZXIubG9hZFNldHRpbmdzKCk7XG4gICAgICAgIGlmICh0aGlzLnVzZXIuc2V0dGluZ3Muc3luY1NpdGVzRml4ZXMpIHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuY29uZmlnLmxvYWQoe2xvY2FsOiBmYWxzZX0pO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMub25BcHBUb2dnbGUoKTtcbiAgICAgICAgdGhpcy5jaGFuZ2VTZXR0aW5ncyh0aGlzLnVzZXIuc2V0dGluZ3MpO1xuICAgICAgICBjb25zb2xlLmxvZygnbG9hZGVkJywgdGhpcy51c2VyLnNldHRpbmdzKTtcblxuICAgICAgICB0aGlzLnJlZ2lzdGVyQ29tbWFuZHMoKTtcblxuICAgICAgICB0aGlzLnJlYWR5ID0gdHJ1ZTtcbiAgICAgICAgdGhpcy50YWJzLnVwZGF0ZUNvbnRlbnRTY3JpcHQoe3J1bk9uUHJvdGVjdGVkUGFnZXM6IHRoaXMudXNlci5zZXR0aW5ncy5lbmFibGVGb3JQcm90ZWN0ZWRQYWdlc30pO1xuXG4gICAgICAgIHRoaXMuYXdhaXRpbmcuZm9yRWFjaCgocmVhZHkpID0+IHJlYWR5KCkpO1xuICAgICAgICB0aGlzLmF3YWl0aW5nID0gbnVsbDtcblxuICAgICAgICB0aGlzLnN0YXJ0QXV0b1RpbWVDaGVjaygpO1xuICAgICAgICB0aGlzLm5ld3Muc3Vic2NyaWJlKCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBwb3B1cE9wZW5pbmdMaXN0ZW5lcjogKCkgPT4gdm9pZCA9IG51bGw7XG5cbiAgICBwcml2YXRlIGdldE1lc3NlbmdlckFkYXB0ZXIoKTogRXh0ZW5zaW9uQWRhcHRlciB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBjb2xsZWN0OiBhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKCF0aGlzLnJlYWR5KSB7XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB0aGlzLmF3YWl0aW5nLnB1c2gocmVzb2x2ZSkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5jb2xsZWN0RGF0YSgpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGdldEFjdGl2ZVRhYkluZm86IGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoIXRoaXMucmVhZHkpIHtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHRoaXMuYXdhaXRpbmcucHVzaChyZXNvbHZlKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IHVybCA9IGF3YWl0IHRoaXMudGFicy5nZXRBY3RpdmVUYWJVUkwoKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5nZXRVUkxJbmZvKHVybCk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgY2hhbmdlU2V0dGluZ3M6IChzZXR0aW5ncykgPT4gdGhpcy5jaGFuZ2VTZXR0aW5ncyhzZXR0aW5ncyksXG4gICAgICAgICAgICBzZXRUaGVtZTogKHRoZW1lKSA9PiB0aGlzLnNldFRoZW1lKHRoZW1lKSxcbiAgICAgICAgICAgIHNldFNob3J0Y3V0OiAoe2NvbW1hbmQsIHNob3J0Y3V0fSkgPT4gdGhpcy5zZXRTaG9ydGN1dChjb21tYW5kLCBzaG9ydGN1dCksXG4gICAgICAgICAgICB0b2dnbGVVUkw6ICh1cmwpID0+IHRoaXMudG9nZ2xlVVJMKHVybCksXG4gICAgICAgICAgICBtYXJrTmV3c0FzUmVhZDogKGlkcykgPT4gdGhpcy5uZXdzLm1hcmtBc1JlYWQoLi4uaWRzKSxcbiAgICAgICAgICAgIG9uUG9wdXBPcGVuOiAoKSA9PiB0aGlzLnBvcHVwT3BlbmluZ0xpc3RlbmVyICYmIHRoaXMucG9wdXBPcGVuaW5nTGlzdGVuZXIoKSxcbiAgICAgICAgICAgIGxvYWRDb25maWc6IGFzeW5jIChvcHRpb25zKSA9PiBhd2FpdCB0aGlzLmNvbmZpZy5sb2FkKG9wdGlvbnMpLFxuICAgICAgICAgICAgYXBwbHlEZXZEeW5hbWljVGhlbWVGaXhlczogKHRleHQpID0+IHRoaXMuZGV2dG9vbHMuYXBwbHlEeW5hbWljVGhlbWVGaXhlcyh0ZXh0KSxcbiAgICAgICAgICAgIHJlc2V0RGV2RHluYW1pY1RoZW1lRml4ZXM6ICgpID0+IHRoaXMuZGV2dG9vbHMucmVzZXREeW5hbWljVGhlbWVGaXhlcygpLFxuICAgICAgICAgICAgYXBwbHlEZXZJbnZlcnNpb25GaXhlczogKHRleHQpID0+IHRoaXMuZGV2dG9vbHMuYXBwbHlJbnZlcnNpb25GaXhlcyh0ZXh0KSxcbiAgICAgICAgICAgIHJlc2V0RGV2SW52ZXJzaW9uRml4ZXM6ICgpID0+IHRoaXMuZGV2dG9vbHMucmVzZXRJbnZlcnNpb25GaXhlcygpLFxuICAgICAgICAgICAgYXBwbHlEZXZTdGF0aWNUaGVtZXM6ICh0ZXh0KSA9PiB0aGlzLmRldnRvb2xzLmFwcGx5U3RhdGljVGhlbWVzKHRleHQpLFxuICAgICAgICAgICAgcmVzZXREZXZTdGF0aWNUaGVtZXM6ICgpID0+IHRoaXMuZGV2dG9vbHMucmVzZXRTdGF0aWNUaGVtZXMoKSxcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHJlZ2lzdGVyQ29tbWFuZHMoKSB7XG4gICAgICAgIGlmICghY2hyb21lLmNvbW1hbmRzKSB7XG4gICAgICAgICAgICAvLyBGaXggZm9yIEZpcmVmb3ggQW5kcm9pZFxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGNocm9tZS5jb21tYW5kcy5vbkNvbW1hbmQuYWRkTGlzdGVuZXIoKGNvbW1hbmQpID0+IHtcbiAgICAgICAgICAgIGlmIChjb21tYW5kID09PSAndG9nZ2xlJykge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKCdUb2dnbGUgY29tbWFuZCBlbnRlcmVkJyk7XG4gICAgICAgICAgICAgICAgdGhpcy5jaGFuZ2VTZXR0aW5ncyh7XG4gICAgICAgICAgICAgICAgICAgIGVuYWJsZWQ6ICF0aGlzLmlzRW5hYmxlZCgpLFxuICAgICAgICAgICAgICAgICAgICBhdXRvbWF0aW9uOiAnJyxcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChjb21tYW5kID09PSAnYWRkU2l0ZScpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZygnQWRkIFNpdGUgY29tbWFuZCBlbnRlcmVkJyk7XG4gICAgICAgICAgICAgICAgdGhpcy50b2dnbGVDdXJyZW50U2l0ZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGNvbW1hbmQgPT09ICdzd2l0Y2hFbmdpbmUnKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coJ1N3aXRjaCBFbmdpbmUgY29tbWFuZCBlbnRlcmVkJyk7XG4gICAgICAgICAgICAgICAgY29uc3QgZW5naW5lcyA9IE9iamVjdC52YWx1ZXMoVGhlbWVFbmdpbmVzKTtcbiAgICAgICAgICAgICAgICBjb25zdCBpbmRleCA9IGVuZ2luZXMuaW5kZXhPZih0aGlzLnVzZXIuc2V0dGluZ3MudGhlbWUuZW5naW5lKTtcbiAgICAgICAgICAgICAgICBjb25zdCBuZXh0ID0gaW5kZXggPT09IGVuZ2luZXMubGVuZ3RoIC0gMSA/IGVuZ2luZXNbMF0gOiBlbmdpbmVzW2luZGV4ICsgMV07XG4gICAgICAgICAgICAgICAgdGhpcy5zZXRUaGVtZSh7ZW5naW5lOiBuZXh0fSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZ2V0U2hvcnRjdXRzKCkge1xuICAgICAgICBjb25zdCBjb21tYW5kcyA9IGF3YWl0IGdldENvbW1hbmRzKCk7XG4gICAgICAgIHJldHVybiBjb21tYW5kcy5yZWR1Y2UoKG1hcCwgY21kKSA9PiBPYmplY3QuYXNzaWduKG1hcCwge1tjbWQubmFtZV06IGNtZC5zaG9ydGN1dH0pLCB7fSBhcyBTaG9ydGN1dHMpO1xuICAgIH1cblxuICAgIHNldFNob3J0Y3V0KGNvbW1hbmQ6IHN0cmluZywgc2hvcnRjdXQ6IHN0cmluZykge1xuICAgICAgICBzZXRTaG9ydGN1dChjb21tYW5kLCBzaG9ydGN1dCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBjb2xsZWN0RGF0YSgpOiBQcm9taXNlPEV4dGVuc2lvbkRhdGE+IHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGlzRW5hYmxlZDogdGhpcy5pc0VuYWJsZWQoKSxcbiAgICAgICAgICAgIGlzUmVhZHk6IHRoaXMucmVhZHksXG4gICAgICAgICAgICBzZXR0aW5nczogdGhpcy51c2VyLnNldHRpbmdzLFxuICAgICAgICAgICAgZm9udHM6IHRoaXMuZm9udHMsXG4gICAgICAgICAgICBuZXdzOiB0aGlzLm5ld3MubGF0ZXN0LFxuICAgICAgICAgICAgc2hvcnRjdXRzOiBhd2FpdCB0aGlzLmdldFNob3J0Y3V0cygpLFxuICAgICAgICAgICAgZGV2dG9vbHM6IHtcbiAgICAgICAgICAgICAgICBkeW5hbWljRml4ZXNUZXh0OiB0aGlzLmRldnRvb2xzLmdldER5bmFtaWNUaGVtZUZpeGVzVGV4dCgpLFxuICAgICAgICAgICAgICAgIGZpbHRlckZpeGVzVGV4dDogdGhpcy5kZXZ0b29scy5nZXRJbnZlcnNpb25GaXhlc1RleHQoKSxcbiAgICAgICAgICAgICAgICBzdGF0aWNUaGVtZXNUZXh0OiB0aGlzLmRldnRvb2xzLmdldFN0YXRpY1RoZW1lc1RleHQoKSxcbiAgICAgICAgICAgICAgICBoYXNDdXN0b21EeW5hbWljRml4ZXM6IHRoaXMuZGV2dG9vbHMuaGFzQ3VzdG9tRHluYW1pY1RoZW1lRml4ZXMoKSxcbiAgICAgICAgICAgICAgICBoYXNDdXN0b21GaWx0ZXJGaXhlczogdGhpcy5kZXZ0b29scy5oYXNDdXN0b21GaWx0ZXJGaXhlcygpLFxuICAgICAgICAgICAgICAgIGhhc0N1c3RvbVN0YXRpY0ZpeGVzOiB0aGlzLmRldnRvb2xzLmhhc0N1c3RvbVN0YXRpY0ZpeGVzKCksXG4gICAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgIH1cblxuICAgIHByaXZhdGUgb25OZXdzVXBkYXRlKG5ld3M6IE5ld3NbXSkge1xuICAgICAgICBjb25zdCBsYXRlc3ROZXdzID0gbmV3cy5sZW5ndGggPiAwICYmIG5ld3NbMF07XG4gICAgICAgIGlmIChsYXRlc3ROZXdzICYmIGxhdGVzdE5ld3MuaW1wb3J0YW50ICYmICFsYXRlc3ROZXdzLnJlYWQpIHtcbiAgICAgICAgICAgIHRoaXMuaWNvbi5zaG93SW1wb3J0YW50QmFkZ2UoKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHVucmVhZCA9IG5ld3MuZmlsdGVyKCh7cmVhZH0pID0+ICFyZWFkKTtcbiAgICAgICAgaWYgKHVucmVhZC5sZW5ndGggPiAwICYmIHRoaXMudXNlci5zZXR0aW5ncy5ub3RpZnlPZk5ld3MpIHtcbiAgICAgICAgICAgIHRoaXMuaWNvbi5zaG93VW5yZWFkUmVsZWFzZU5vdGVzQmFkZ2UodW5yZWFkLmxlbmd0aCk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmljb24uaGlkZUJhZGdlKCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBnZXRDb25uZWN0aW9uTWVzc2FnZSh1cmwsIGZyYW1lVVJMKSB7XG4gICAgICAgIGlmICh0aGlzLnJlYWR5KSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5nZXRUYWJNZXNzYWdlKHVybCwgZnJhbWVVUkwpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgICAgICAgdGhpcy5hd2FpdGluZy5wdXNoKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSh0aGlzLmdldFRhYk1lc3NhZ2UodXJsLCBmcmFtZVVSTCkpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGdldFVuc3VwcG9ydGVkU2VuZGVyTWVzc2FnZSgpIHtcbiAgICAgICAgcmV0dXJuIHt0eXBlOiAndW5zdXBwb3J0ZWQtc2VuZGVyJ307XG4gICAgfVxuXG4gICAgcHJpdmF0ZSB3YXNFbmFibGVkT25MYXN0Q2hlY2s6IGJvb2xlYW47XG5cbiAgICBwcml2YXRlIHN0YXJ0QXV0b1RpbWVDaGVjaygpIHtcbiAgICAgICAgc2V0SW50ZXJ2YWwoKCkgPT4ge1xuICAgICAgICAgICAgaWYgKCF0aGlzLnJlYWR5IHx8IHRoaXMudXNlci5zZXR0aW5ncy5hdXRvbWF0aW9uID09PSAnJykge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuaGFuZGxlQXV0b0NoZWNrKCk7XG4gICAgICAgIH0sIEFVVE9fVElNRV9DSEVDS19JTlRFUlZBTCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSB3YXNMYXN0Q29sb3JTY2hlbWVEYXJrID0gbnVsbDtcblxuICAgIHByaXZhdGUgb25Db2xvclNjaGVtZUNoYW5nZSA9ICh7aXNEYXJrfSkgPT4ge1xuICAgICAgICB0aGlzLndhc0xhc3RDb2xvclNjaGVtZURhcmsgPSBpc0Rhcms7XG4gICAgICAgIGlmICh0aGlzLnVzZXIuc2V0dGluZ3MuYXV0b21hdGlvbiAhPT0gJ3N5c3RlbScpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmhhbmRsZUF1dG9DaGVjaygpO1xuICAgIH07XG5cbiAgICBwcml2YXRlIGhhbmRsZUF1dG9DaGVjayA9ICgpID0+IHtcbiAgICAgICAgaWYgKCF0aGlzLnJlYWR5KSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgaXNFbmFibGVkID0gdGhpcy5pc0VuYWJsZWQoKTtcbiAgICAgICAgaWYgKHRoaXMud2FzRW5hYmxlZE9uTGFzdENoZWNrICE9PSBpc0VuYWJsZWQpIHtcbiAgICAgICAgICAgIHRoaXMud2FzRW5hYmxlZE9uTGFzdENoZWNrID0gaXNFbmFibGVkO1xuICAgICAgICAgICAgdGhpcy5vbkFwcFRvZ2dsZSgpO1xuICAgICAgICAgICAgdGhpcy50YWJzLnNlbmRNZXNzYWdlKHRoaXMuZ2V0VGFiTWVzc2FnZSk7XG4gICAgICAgICAgICB0aGlzLnJlcG9ydENoYW5nZXMoKTtcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICBjaGFuZ2VTZXR0aW5ncygkc2V0dGluZ3M6IFBhcnRpYWw8VXNlclNldHRpbmdzPikge1xuICAgICAgICBjb25zdCBwcmV2ID0gey4uLnRoaXMudXNlci5zZXR0aW5nc307XG5cbiAgICAgICAgdGhpcy51c2VyLnNldCgkc2V0dGluZ3MpO1xuXG4gICAgICAgIGlmIChcbiAgICAgICAgICAgIChwcmV2LmVuYWJsZWQgIT09IHRoaXMudXNlci5zZXR0aW5ncy5lbmFibGVkKSB8fFxuICAgICAgICAgICAgKHByZXYuYXV0b21hdGlvbiAhPT0gdGhpcy51c2VyLnNldHRpbmdzLmF1dG9tYXRpb24pIHx8XG4gICAgICAgICAgICAocHJldi50aW1lLmFjdGl2YXRpb24gIT09IHRoaXMudXNlci5zZXR0aW5ncy50aW1lLmFjdGl2YXRpb24pIHx8XG4gICAgICAgICAgICAocHJldi50aW1lLmRlYWN0aXZhdGlvbiAhPT0gdGhpcy51c2VyLnNldHRpbmdzLnRpbWUuZGVhY3RpdmF0aW9uKSB8fFxuICAgICAgICAgICAgKHByZXYubG9jYXRpb24ubGF0aXR1ZGUgIT09IHRoaXMudXNlci5zZXR0aW5ncy5sb2NhdGlvbi5sYXRpdHVkZSkgfHxcbiAgICAgICAgICAgIChwcmV2LmxvY2F0aW9uLmxvbmdpdHVkZSAhPT0gdGhpcy51c2VyLnNldHRpbmdzLmxvY2F0aW9uLmxvbmdpdHVkZSlcbiAgICAgICAgKSB7XG4gICAgICAgICAgICB0aGlzLm9uQXBwVG9nZ2xlKCk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHByZXYuc3luY1NldHRpbmdzICE9PSB0aGlzLnVzZXIuc2V0dGluZ3Muc3luY1NldHRpbmdzKSB7XG4gICAgICAgICAgICB0aGlzLnVzZXIuc2F2ZVN5bmNTZXR0aW5nKHRoaXMudXNlci5zZXR0aW5ncy5zeW5jU2V0dGluZ3MpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLmlzRW5hYmxlZCgpICYmICRzZXR0aW5ncy5jaGFuZ2VCcm93c2VyVGhlbWUgIT0gbnVsbCAmJiBwcmV2LmNoYW5nZUJyb3dzZXJUaGVtZSAhPT0gJHNldHRpbmdzLmNoYW5nZUJyb3dzZXJUaGVtZSkge1xuICAgICAgICAgICAgaWYgKCRzZXR0aW5ncy5jaGFuZ2VCcm93c2VyVGhlbWUpIHtcbiAgICAgICAgICAgICAgICBzZXRXaW5kb3dUaGVtZSh0aGlzLnVzZXIuc2V0dGluZ3MudGhlbWUpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXNldFdpbmRvd1RoZW1lKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLm9uU2V0dGluZ3NDaGFuZ2VkKCk7XG4gICAgfVxuXG4gICAgc2V0VGhlbWUoJHRoZW1lOiBQYXJ0aWFsPEZpbHRlckNvbmZpZz4pIHtcbiAgICAgICAgdGhpcy51c2VyLnNldCh7dGhlbWU6IHsuLi50aGlzLnVzZXIuc2V0dGluZ3MudGhlbWUsIC4uLiR0aGVtZX19KTtcblxuICAgICAgICBpZiAodGhpcy5pc0VuYWJsZWQoKSAmJiB0aGlzLnVzZXIuc2V0dGluZ3MuY2hhbmdlQnJvd3NlclRoZW1lKSB7XG4gICAgICAgICAgICBzZXRXaW5kb3dUaGVtZSh0aGlzLnVzZXIuc2V0dGluZ3MudGhlbWUpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5vblNldHRpbmdzQ2hhbmdlZCgpO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgcmVwb3J0Q2hhbmdlcygpIHtcbiAgICAgICAgY29uc3QgaW5mbyA9IGF3YWl0IHRoaXMuY29sbGVjdERhdGEoKTtcbiAgICAgICAgdGhpcy5tZXNzZW5nZXIucmVwb3J0Q2hhbmdlcyhpbmZvKTtcbiAgICB9XG5cbiAgICB0b2dnbGVVUkwodXJsOiBzdHJpbmcpIHtcbiAgICAgICAgY29uc3QgaXNJbkRhcmtMaXN0ID0gaXNVUkxJbkxpc3QodXJsLCB0aGlzLmNvbmZpZy5EQVJLX1NJVEVTKTtcbiAgICAgICAgY29uc3Qgc2l0ZUxpc3QgPSBpc0luRGFya0xpc3QgP1xuICAgICAgICAgICAgdGhpcy51c2VyLnNldHRpbmdzLnNpdGVMaXN0RW5hYmxlZC5zbGljZSgpIDpcbiAgICAgICAgICAgIHRoaXMudXNlci5zZXR0aW5ncy5zaXRlTGlzdC5zbGljZSgpO1xuICAgICAgICBjb25zdCBwYXR0ZXJuID0gZ2V0VVJMSG9zdE9yUHJvdG9jb2wodXJsKTtcbiAgICAgICAgY29uc3QgaW5kZXggPSBzaXRlTGlzdC5pbmRleE9mKHBhdHRlcm4pO1xuICAgICAgICBpZiAoaW5kZXggPCAwKSB7XG4gICAgICAgICAgICBzaXRlTGlzdC5wdXNoKHBhdHRlcm4pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc2l0ZUxpc3Quc3BsaWNlKGluZGV4LCAxKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoaXNJbkRhcmtMaXN0KSB7XG4gICAgICAgICAgICB0aGlzLmNoYW5nZVNldHRpbmdzKHtzaXRlTGlzdEVuYWJsZWQ6IHNpdGVMaXN0fSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmNoYW5nZVNldHRpbmdzKHtzaXRlTGlzdH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQWRkcyBob3N0IG5hbWUgb2YgbGFzdCBmb2N1c2VkIHRhYlxuICAgICAqIGludG8gU2l0ZXMgTGlzdCAob3IgcmVtb3ZlcykuXG4gICAgICovXG4gICAgYXN5bmMgdG9nZ2xlQ3VycmVudFNpdGUoKSB7XG4gICAgICAgIGNvbnN0IHVybCA9IGF3YWl0IHRoaXMudGFicy5nZXRBY3RpdmVUYWJVUkwoKTtcbiAgICAgICAgdGhpcy50b2dnbGVVUkwodXJsKTtcbiAgICB9XG5cblxuICAgIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy9cbiAgICAvLyAgICAgICBIYW5kbGUgY29uZmlnIGNoYW5nZXNcbiAgICAvL1xuXG4gICAgcHJpdmF0ZSBvbkFwcFRvZ2dsZSgpIHtcbiAgICAgICAgaWYgKHRoaXMuaXNFbmFibGVkKCkpIHtcbiAgICAgICAgICAgIHRoaXMuaWNvbi5zZXRBY3RpdmUoKTtcbiAgICAgICAgICAgIGlmICh0aGlzLnVzZXIuc2V0dGluZ3MuY2hhbmdlQnJvd3NlclRoZW1lKSB7XG4gICAgICAgICAgICAgICAgc2V0V2luZG93VGhlbWUodGhpcy51c2VyLnNldHRpbmdzLnRoZW1lKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuaWNvbi5zZXRJbmFjdGl2ZSgpO1xuICAgICAgICAgICAgaWYgKHRoaXMudXNlci5zZXR0aW5ncy5jaGFuZ2VCcm93c2VyVGhlbWUpIHtcbiAgICAgICAgICAgICAgICByZXNldFdpbmRvd1RoZW1lKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIG9uU2V0dGluZ3NDaGFuZ2VkKCkge1xuICAgICAgICBpZiAoIXRoaXMucmVhZHkpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMud2FzRW5hYmxlZE9uTGFzdENoZWNrID0gdGhpcy5pc0VuYWJsZWQoKTtcbiAgICAgICAgdGhpcy50YWJzLnNlbmRNZXNzYWdlKHRoaXMuZ2V0VGFiTWVzc2FnZSk7XG4gICAgICAgIHRoaXMuc2F2ZVVzZXJTZXR0aW5ncygpO1xuICAgICAgICB0aGlzLnJlcG9ydENoYW5nZXMoKTtcbiAgICB9XG5cblxuICAgIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vXG4gICAgLy8gQWRkL3JlbW92ZSBjc3MgdG8gdGFiXG4gICAgLy9cbiAgICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICAgIHByaXZhdGUgZ2V0VVJMSW5mbyh1cmw6IHN0cmluZyk6IFRhYkluZm8ge1xuICAgICAgICBjb25zdCB7REFSS19TSVRFU30gPSB0aGlzLmNvbmZpZztcbiAgICAgICAgY29uc3QgaXNJbkRhcmtMaXN0ID0gaXNVUkxJbkxpc3QodXJsLCBEQVJLX1NJVEVTKTtcbiAgICAgICAgY29uc3QgaXNQcm90ZWN0ZWQgPSAhY2FuSW5qZWN0U2NyaXB0KHVybCk7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICB1cmwsXG4gICAgICAgICAgICBpc0luRGFya0xpc3QsXG4gICAgICAgICAgICBpc1Byb3RlY3RlZCxcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGdldFRhYk1lc3NhZ2UgPSAodXJsOiBzdHJpbmcsIGZyYW1lVVJMOiBzdHJpbmcpID0+IHtcbiAgICAgICAgY29uc3QgdXJsSW5mbyA9IHRoaXMuZ2V0VVJMSW5mbyh1cmwpO1xuICAgICAgICBpZiAodGhpcy5pc0VuYWJsZWQoKSAmJiBpc1VSTEVuYWJsZWQodXJsLCB0aGlzLnVzZXIuc2V0dGluZ3MsIHVybEluZm8pKSB7XG4gICAgICAgICAgICBjb25zdCBjdXN0b20gPSB0aGlzLnVzZXIuc2V0dGluZ3MuY3VzdG9tVGhlbWVzLmZpbmQoKHt1cmw6IHVybExpc3R9KSA9PiBpc1VSTEluTGlzdCh1cmwsIHVybExpc3QpKTtcbiAgICAgICAgICAgIGNvbnN0IHByZXNldCA9IGN1c3RvbSA/IG51bGwgOiB0aGlzLnVzZXIuc2V0dGluZ3MucHJlc2V0cy5maW5kKCh7dXJsc30pID0+IGlzVVJMSW5MaXN0KHVybCwgdXJscykpO1xuICAgICAgICAgICAgY29uc3QgdGhlbWUgPSBjdXN0b20gPyBjdXN0b20udGhlbWUgOiBwcmVzZXQgPyBwcmVzZXQudGhlbWUgOiB0aGlzLnVzZXIuc2V0dGluZ3MudGhlbWU7XG5cbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGBDcmVhdGluZyBDU1MgZm9yIHVybDogJHt1cmx9YCk7XG4gICAgICAgICAgICBzd2l0Y2ggKHRoZW1lLmVuZ2luZSkge1xuICAgICAgICAgICAgICAgIGNhc2UgVGhlbWVFbmdpbmVzLmNzc0ZpbHRlcjoge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogJ2FkZC1jc3MtZmlsdGVyJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIGRhdGE6IGNyZWF0ZUNTU0ZpbHRlclN0eWxlc2hlZXQodGhlbWUsIHVybCwgZnJhbWVVUkwsIHRoaXMuY29uZmlnLklOVkVSU0lPTl9GSVhFUyksXG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNhc2UgVGhlbWVFbmdpbmVzLnN2Z0ZpbHRlcjoge1xuICAgICAgICAgICAgICAgICAgICBpZiAoaXNGaXJlZm94KCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogJ2FkZC1jc3MtZmlsdGVyJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkYXRhOiBjcmVhdGVTVkdGaWx0ZXJTdHlsZXNoZWV0KHRoZW1lLCB1cmwsIGZyYW1lVVJMLCB0aGlzLmNvbmZpZy5JTlZFUlNJT05fRklYRVMpLFxuICAgICAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogJ2FkZC1zdmctZmlsdGVyJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjc3M6IGNyZWF0ZVNWR0ZpbHRlclN0eWxlc2hlZXQodGhlbWUsIHVybCwgZnJhbWVVUkwsIHRoaXMuY29uZmlnLklOVkVSU0lPTl9GSVhFUyksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3ZnTWF0cml4OiBnZXRTVkdGaWx0ZXJNYXRyaXhWYWx1ZSh0aGVtZSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3ZnUmV2ZXJzZU1hdHJpeDogZ2V0U1ZHUmV2ZXJzZUZpbHRlck1hdHJpeFZhbHVlKCksXG4gICAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjYXNlIFRoZW1lRW5naW5lcy5zdGF0aWNUaGVtZToge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogJ2FkZC1zdGF0aWMtdGhlbWUnLFxuICAgICAgICAgICAgICAgICAgICAgICAgZGF0YTogdGhlbWUuc3R5bGVzaGVldCAmJiB0aGVtZS5zdHlsZXNoZWV0LnRyaW0oKSA/XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhlbWUuc3R5bGVzaGVldCA6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY3JlYXRlU3RhdGljU3R5bGVzaGVldCh0aGVtZSwgdXJsLCBmcmFtZVVSTCwgdGhpcy5jb25maWcuU1RBVElDX1RIRU1FUyksXG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNhc2UgVGhlbWVFbmdpbmVzLmR5bmFtaWNUaGVtZToge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBmaWx0ZXIgPSB7Li4udGhlbWV9O1xuICAgICAgICAgICAgICAgICAgICBkZWxldGUgZmlsdGVyLmVuZ2luZTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZml4ZXMgPSBnZXREeW5hbWljVGhlbWVGaXhlc0Zvcih1cmwsIGZyYW1lVVJMLCB0aGlzLmNvbmZpZy5EWU5BTUlDX1RIRU1FX0ZJWEVTLCB0aGlzLnVzZXIuc2V0dGluZ3MuZW5hYmxlRm9yUERGKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaXNJRnJhbWUgPSBmcmFtZVVSTCAhPSBudWxsO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogJ2FkZC1keW5hbWljLXRoZW1lJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIGRhdGE6IHtmaWx0ZXIsIGZpeGVzLCBpc0lGcmFtZX0sXG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGRlZmF1bHQ6IHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIGVuZ2luZSAke3RoZW1lLmVuZ2luZX1gKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBjb25zb2xlLmxvZyhgU2l0ZSBpcyBub3QgaW52ZXJ0ZWQ6ICR7dXJsfWApO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgdHlwZTogJ2NsZWFuLXVwJyxcbiAgICAgICAgfTtcbiAgICB9O1xuXG5cbiAgICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyAgICAgICAgICBVc2VyIHNldHRpbmdzXG5cbiAgICBwcml2YXRlIGFzeW5jIHNhdmVVc2VyU2V0dGluZ3MoKSB7XG4gICAgICAgIGF3YWl0IHRoaXMudXNlci5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgY29uc29sZS5sb2coJ3NhdmVkJywgdGhpcy51c2VyLnNldHRpbmdzKTtcbiAgICB9XG59XG4iLCJpbXBvcnQge0V4dGVuc2lvbn0gZnJvbSAnLi9leHRlbnNpb24nO1xuaW1wb3J0IHtnZXRIZWxwVVJMLCBVTklOU1RBTExfVVJMfSBmcm9tICcuLi91dGlscy9saW5rcyc7XG5cbi8vIEluaXRpYWxpemUgZXh0ZW5zaW9uXG5jb25zdCBleHRlbnNpb24gPSBuZXcgRXh0ZW5zaW9uKCk7XG5leHRlbnNpb24uc3RhcnQoKTtcblxuY2hyb21lLnJ1bnRpbWUub25JbnN0YWxsZWQuYWRkTGlzdGVuZXIoKHtyZWFzb259KSA9PiB7XG4gICAgaWYgKHJlYXNvbiA9PT0gJ2luc3RhbGwnKSB7XG4gICAgICAgIGNocm9tZS50YWJzLmNyZWF0ZSh7dXJsOiBnZXRIZWxwVVJMKCl9KTtcbiAgICB9XG59KTtcblxuY2hyb21lLnJ1bnRpbWUuc2V0VW5pbnN0YWxsVVJMKFVOSU5TVEFMTF9VUkwpO1xuXG5kZWNsYXJlIGNvbnN0IF9fV0FUQ0hfXzogYm9vbGVhbjtcbmRlY2xhcmUgY29uc3QgX19QT1JUX186IG51bWJlcjtcbmNvbnN0IFdBVENIID0gX19XQVRDSF9fO1xuXG5pZiAoV0FUQ0gpIHtcbiAgICBjb25zdCBQT1JUID0gX19QT1JUX187XG4gICAgY29uc3QgbGlzdGVuID0gKCkgPT4ge1xuICAgICAgICBjb25zdCBzb2NrZXQgPSBuZXcgV2ViU29ja2V0KGB3czovL2xvY2FsaG9zdDoke1BPUlR9YCk7XG4gICAgICAgIGNvbnN0IHNlbmQgPSAobWVzc2FnZTogYW55KSA9PiBzb2NrZXQuc2VuZChKU09OLnN0cmluZ2lmeShtZXNzYWdlKSk7XG4gICAgICAgIHNvY2tldC5vbm1lc3NhZ2UgPSAoZSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgbWVzc2FnZSA9IEpTT04ucGFyc2UoZS5kYXRhKTtcbiAgICAgICAgICAgIGlmIChtZXNzYWdlLnR5cGUuc3RhcnRzV2l0aCgncmVsb2FkOicpKSB7XG4gICAgICAgICAgICAgICAgc2VuZCh7dHlwZTogJ3JlbG9hZGluZyd9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHN3aXRjaCAobWVzc2FnZS50eXBlKSB7XG4gICAgICAgICAgICAgICAgY2FzZSAncmVsb2FkOmNzcyc6IHtcbiAgICAgICAgICAgICAgICAgICAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe3R5cGU6ICdjc3MtdXBkYXRlJ30pO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2FzZSAncmVsb2FkOnVpJzoge1xuICAgICAgICAgICAgICAgICAgICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7dHlwZTogJ3VpLXVwZGF0ZSd9KTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNhc2UgJ3JlbG9hZDpmdWxsJzoge1xuICAgICAgICAgICAgICAgICAgICBjaHJvbWUucnVudGltZS5yZWxvYWQoKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICBzb2NrZXQub25jbG9zZSA9ICgpID0+IHNldFRpbWVvdXQobGlzdGVuLCAxMDAwKTtcbiAgICB9O1xuICAgIGxpc3RlbigpO1xufVxuIl0sIm5hbWVzIjpbImNyZWF0ZUNTU0ZpbHRlclN0eWxlc2hlZXQiXSwibWFwcGluZ3MiOiI7OzthQUFnQixlQUFlO1FBQzNCLE9BQU8sU0FBUyxDQUFDLFNBQVMsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLElBQUksU0FBUyxDQUFDLFNBQVMsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxR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QUssQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLHFCQUFxQixHQUFHLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNqRixhQUFhLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLHFCQUFxQixHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssR0FBRyxDQUFDLFFBQVEsQ0FBQztRQUN0SSxhQUFhLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLHFCQUFxQixHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssR0FBRyxDQUFDLFlBQVksQ0FBQyxRQUFRLENBQUM7UUFDcEosYUFBYSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxVQUFVLEdBQUcsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ3BFLGFBQWEsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsYUFBYSxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsVUFBVSxHQUFHLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUMxRSxhQUFhLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLGFBQWEsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLFVBQVUsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsT0FBTyxFQUFFLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLEdBQUcsQ0FBQyxRQUFRLENBQUM7UUFDaEksYUFBYSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxhQUFhLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxVQUFVLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsS0FBSyxHQUFHLENBQUMsWUFBWSxDQUFDLFFBQVEsQ0FBQztRQUM5SSxhQUFhLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLGlCQUFpQixHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7UUFFdEcsYUFBYSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxxQkFBcUIsR0FBRyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDL0UsYUFBYSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxhQUFhLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxxQkFBcUIsR0FBRyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDckYsYUFBYSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxhQUFhLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxxQkFBcUIsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsT0FBTyxFQUFFLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLEdBQUcsQ0FBQyxRQUFRLENBQUM7UUFDN0ksYUFBYSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxhQUFhLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxxQkFBcUIsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsT0FBTyxFQUFFLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxLQUFLLEdBQUcsQ0FBQyxZQUFZLENBQUMsUUFBUSxDQUFDO1FBQzNKLGFBQWEsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsVUFBVSxHQUFHLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUN4RSxhQUFhLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLGVBQWUsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLFVBQVUsR0FBRyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDOUUsYUFBYSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxlQUFlLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxVQUFVLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLFNBQVMsRUFBRSxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsS0FBSyxHQUFHLENBQUMsUUFBUSxDQUFDO1FBQ3RJLGFBQWEsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsZUFBZSxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsVUFBVSxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssR0FBRyxDQUFDLFlBQVksQ0FBQyxRQUFRLENBQUM7UUFDcEosYUFBYSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxpQkFBaUIsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQyxTQUFTLEVBQUUsRUFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBRTVHLGFBQWEsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMscUJBQXFCLEdBQUcsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQzdFLGFBQWEsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsWUFBWSxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMscUJBQXFCLEdBQUcsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ25GLGFBQWEsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsWUFBWSxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMscUJBQXFCLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsS0FBSyxHQUFHLENBQUMsUUFBUSxDQUFDO1FBQ3pJLGFBQWEsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsWUFBWSxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMscUJBQXFCLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsS0FBSyxHQUFHLENBQUMsWUFBWSxDQUFDLFFBQVEsQ0FBQztRQUN2SixhQUFhLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLFVBQVUsR0FBRyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDdEUsYUFBYSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxVQUFVLEdBQUcsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQzVFLGFBQWEsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsY0FBYyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsVUFBVSxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssR0FBRyxDQUFDLFFBQVEsQ0FBQztRQUNwSSxhQUFhLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLGNBQWMsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLFVBQVUsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsUUFBUSxFQUFFLENB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
