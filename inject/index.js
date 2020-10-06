(function () {
    'use strict'

    function logInfo(...args) {
        console.info(...args)
    }
    function logWarn(...args) {
        console.warn(...args)
    }

    function throttle(callback) {
        let pending = false
        let frameId = null
        let lastArgs
        const throttled = ((...args) => {
            lastArgs = args
            if (frameId) {
                pending = true
            }
            else {
                callback(...lastArgs)
                frameId = requestAnimationFrame(() => {
                    frameId = null
                    if (pending) {
                        callback(...lastArgs)
                        pending = false
                    }
                })
            }
        })
        const cancel = () => {
            cancelAnimationFrame(frameId)
            pending = false
            frameId = null
        }
        return Object.assign(throttled, { cancel })
    }
    function createAsyncTasksQueue() {
        const tasks = []
        let frameId = null
        function runTasks() {
            let task
            while (task = tasks.shift()) {
                task()
            }
            frameId = null
        }
        function add(task) {
            tasks.push(task)
            if (!frameId) {
                frameId = requestAnimationFrame(runTasks)
            }
        }
        function cancel() {
            tasks.splice(0)
            cancelAnimationFrame(frameId)
            frameId = null
        }
        return { add, cancel }
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
    function toArray(items) {
        const results = []
        for (let i = 0, len = items.length;i < len;i++) {
            results.push(items[i])
        }
        return results
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

    function createNodeAsap({ selectNode, createNode, updateNode, selectTarget, createTarget, isTargetMutation, }) {
        const target = selectTarget()
        if (target) {
            const prev = selectNode()
            if (prev) {
                updateNode(prev)
            }
            else {
                createNode(target)
            }
        }
        else {
            const observer = new MutationObserver((mutations) => {
                const mutation = mutations.find(isTargetMutation)
                if (mutation) {
                    unsubscribe()
                    const target = selectTarget()
                    selectNode() || createNode(target)
                }
            })
            const ready = () => {
                if (document.readyState !== 'complete') {
                    return
                }
                unsubscribe()
                const target = selectTarget() || createTarget()
                selectNode() || createNode(target)
            }
            const unsubscribe = () => {
                document.removeEventListener('readystatechange', ready)
                observer.disconnect()
            }
            if (document.readyState === 'complete') {
                ready()
            }
            else {
                document.addEventListener('readystatechange', ready)
                observer.observe(document, { childList: true, subtree: true })
            }
        }
    }
    function removeNode(node) {
        node && node.parentNode && node.parentNode.removeChild(node)
    }
    function watchForNodePosition(node, mode, onRestore = Function.prototype) {
        const MAX_ATTEMPTS_COUNT = 10
        const RETRY_TIMEOUT = getDuration({ seconds: 2 })
        const ATTEMPTS_INTERVAL = getDuration({ seconds: 10 })
        const prevSibling = node.previousSibling
        let parent = node.parentNode
        if (!parent) {
            throw new Error('Unable to watch for node position: parent element not found')
        }
        if (mode === 'prev-sibling' && !prevSibling) {
            throw new Error('Unable to watch for node position: there is no previous sibling')
        }
        let attempts = 0
        let start = null
        let timeoutId = null
        const restore = throttle(() => {
            if (timeoutId) {
                return
            }
            attempts++
            const now = Date.now()
            if (start == null) {
                start = now
            }
            else if (attempts >= MAX_ATTEMPTS_COUNT) {
                if (now - start < ATTEMPTS_INTERVAL) {
                    logWarn(`Node position watcher paused: retry in ${RETRY_TIMEOUT}ms`, node, prevSibling)
                    timeoutId = setTimeout(() => {
                        start = null
                        attempts = 0
                        timeoutId = null
                        restore()
                    }, RETRY_TIMEOUT)
                    return
                }
                start = now
                attempts = 1
            }
            if (mode === 'parent') {
                if (prevSibling && prevSibling.parentNode !== parent) {
                    logWarn('Unable to restore node position: sibling parent changed', node, prevSibling, parent)
                    stop()
                    return
                }
            }
            if (mode === 'prev-sibling') {
                if (prevSibling.parentNode == null) {
                    logWarn('Unable to restore node position: sibling was removed', node, prevSibling, parent)
                    stop()
                    return
                }
                if (prevSibling.parentNode !== parent) {
                    logWarn('Style was moved to another parent', node, prevSibling, parent)
                    updateParent(prevSibling.parentNode)
                }
            }
            logWarn('Restoring node position', node, prevSibling, parent)
            parent.insertBefore(node, prevSibling ? prevSibling.nextSibling : parent.firstChild)
            observer.takeRecords()
            onRestore && onRestore()
        })
        const observer = new MutationObserver(() => {
            if ((mode === 'parent' && node.parentNode !== parent) ||
                (mode === 'prev-sibling' && node.previousSibling !== prevSibling)) {
                restore()
            }
        })
        const run = () => {
            observer.observe(parent, { childList: true })
        }
        const stop = () => {
            clearTimeout(timeoutId)
            observer.disconnect()
            restore.cancel()
        }
        const skip = () => {
            observer.takeRecords()
        }
        const updateParent = (parentNode) => {
            parent = parentNode
            stop()
            run()
        }
        run()
        return { run, stop, skip }
    }
    function iterateShadowHosts(root, iterator) {
        if (root == null) {
            return
        }
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
            acceptNode(node) {
                return node.shadowRoot == null ? NodeFilter.FILTER_SKIP : NodeFilter.FILTER_ACCEPT
            }
        }, false)
        for (let node = (root.shadowRoot ? walker.currentNode : walker.nextNode());node != null;node = walker.nextNode()) {
            iterator(node)
            iterateShadowHosts(node.shadowRoot, iterator)
        }
    }
    function isDOMReady() {
        return document.readyState === 'complete' || document.readyState === 'interactive'
    }
    const readyStateListeners = new Set()
    function addDOMReadyListener(listener) {
        readyStateListeners.add(listener)
    }
    function removeDOMReadyListener(listener) {
        readyStateListeners.delete(listener)
    }
    if (!isDOMReady()) {
        const onReadyStateChange = () => {
            if (isDOMReady()) {
                document.removeEventListener('readystatechange', onReadyStateChange)
                readyStateListeners.forEach((listener) => listener())
                readyStateListeners.clear()
            }
        }
        document.addEventListener('readystatechange', onReadyStateChange)
    }
    const HUGE_MUTATIONS_COUNT = 1000
    function isHugeMutation(mutations) {
        if (mutations.length > HUGE_MUTATIONS_COUNT) {
            return true
        }
        let addedNodesCount = 0
        for (let i = 0;i < mutations.length;i++) {
            addedNodesCount += mutations[i].addedNodes.length
            if (addedNodesCount > HUGE_MUTATIONS_COUNT) {
                return true
            }
        }
        return false
    }
    function getElementsTreeOperations(mutations) {
        const additions = new Set()
        const deletions = new Set()
        const moves = new Set()
        mutations.forEach((m) => {
            forEach(m.addedNodes, (n) => {
                if (n instanceof Element && n.isConnected) {
                    additions.add(n)
                }
            })
            forEach(m.removedNodes, (n) => {
                if (n instanceof Element) {
                    if (n.isConnected) {
                        moves.add(n)
                    }
                    else {
                        deletions.add(n)
                    }
                }
            })
        })
        moves.forEach((n) => additions.delete(n))
        const duplicateAdditions = []
        const duplicateDeletions = []
        additions.forEach((node) => {
            if (additions.has(node.parentElement)) {
                duplicateAdditions.push(node)
            }
        })
        deletions.forEach((node) => {
            if (deletions.has(node.parentElement)) {
                duplicateDeletions.push(node)
            }
        })
        duplicateAdditions.forEach((node) => additions.delete(node))
        duplicateDeletions.forEach((node) => deletions.delete(node))
        return { additions, moves, deletions }
    }
    const optimizedTreeObservers = new Map()
    const optimizedTreeCallbacks = new WeakMap()
    function createOptimizedTreeObserver(root, callbacks) {
        let observer
        let observerCallbacks
        let domReadyListener
        if (optimizedTreeObservers.has(root)) {
            observer = optimizedTreeObservers.get(root)
            observerCallbacks = optimizedTreeCallbacks.get(observer)
        }
        else {
            let hadHugeMutationsBefore = false
            let subscribedForReadyState = false
            observer = new MutationObserver((mutations) => {
                if (isHugeMutation(mutations)) {
                    if (!hadHugeMutationsBefore || isDOMReady()) {
                        observerCallbacks.forEach(({ onHugeMutations }) => onHugeMutations(root))
                    }
                    else {
                        if (!subscribedForReadyState) {
                            domReadyListener = () => observerCallbacks.forEach(({ onHugeMutations }) => onHugeMutations(root))
                            addDOMReadyListener(domReadyListener)
                            subscribedForReadyState = true
                        }
                    }
                    hadHugeMutationsBefore = true
                }
                else {
                    const elementsOperations = getElementsTreeOperations(mutations)
                    observerCallbacks.forEach(({ onMinorMutations }) => onMinorMutations(elementsOperations))
                }
            })
            observer.observe(root, { childList: true, subtree: true })
            optimizedTreeObservers.set(root, observer)
            observerCallbacks = new Set()
            optimizedTreeCallbacks.set(observer, observerCallbacks)
        }
        observerCallbacks.add(callbacks)
        return {
            disconnect() {
                observerCallbacks.delete(callbacks)
                if (domReadyListener) {
                    removeDOMReadyListener(domReadyListener)
                }
                if (observerCallbacks.size === 0) {
                    observer.disconnect()
                    optimizedTreeCallbacks.delete(observer)
                    optimizedTreeObservers.delete(root)
                }
            },
        }
    }

    function createOrUpdateStyle(css) {
        createNodeAsap({
            selectNode: () => document.getElementById('dark-mode-style'),
            createNode: (target) => {
                const style = document.createElement('style')
                style.id = 'dark-mode-style'
                style.type = 'text/css'
                style.textContent = css
                target.appendChild(style)
            },
            updateNode: (existing) => {
                if (css.replace(/^\s+/gm, '') !== existing.textContent.replace(/^\s+/gm, '')) {
                    existing.textContent = css
                }
            },
            selectTarget: () => document.head,
            createTarget: () => {
                const head = document.createElement('head')
                document.documentElement.insertBefore(head, document.documentElement.firstElementChild)
                return head
            },
            isTargetMutation: (mutation) => mutation.target.nodeName.toLowerCase() === 'head',
        })
    }
    function removeStyle() {
        removeNode(document.getElementById('dark-mode-style'))
    }

    function createOrUpdateSVGFilter(svgMatrix, svgReverseMatrix) {
        createNodeAsap({
            selectNode: () => document.getElementById('dark-mode-svg'),
            createNode: (target) => {
                const SVG_NS = 'http://www.w3.org/2000/svg'
                const createMatrixFilter = (id, matrix) => {
                    const filter = document.createElementNS(SVG_NS, 'filter')
                    filter.id = id
                    filter.style.colorInterpolationFilters = 'sRGB'
                    filter.setAttribute('x', '0')
                    filter.setAttribute('y', '0')
                    filter.setAttribute('width', '99999')
                    filter.setAttribute('height', '99999')
                    filter.appendChild(createColorMatrix(matrix))
                    return filter
                }
                const createColorMatrix = (matrix) => {
                    const colorMatrix = document.createElementNS(SVG_NS, 'feColorMatrix')
                    colorMatrix.setAttribute('type', 'matrix')
                    colorMatrix.setAttribute('values', matrix)
                    return colorMatrix
                }
                const svg = document.createElementNS(SVG_NS, 'svg')
                svg.id = 'dark-mode-svg'
                svg.style.height = '0'
                svg.style.width = '0'
                svg.appendChild(createMatrixFilter('dark-mode-filter', svgMatrix))
                svg.appendChild(createMatrixFilter('dark-mode-reverse-filter', svgReverseMatrix))
                target.appendChild(svg)
            },
            updateNode: (existing) => {
                const existingMatrix = existing.firstChild.firstChild
                if (existingMatrix.getAttribute('values') !== svgMatrix) {
                    existingMatrix.setAttribute('values', svgMatrix)
                    const style = document.getElementById('dark-mode-style')
                    const css = style.textContent
                    style.textContent = ''
                    style.textContent = css
                }
            },
            selectTarget: () => document.head,
            createTarget: () => {
                const head = document.createElement('head')
                document.documentElement.insertBefore(head, document.documentElement.firstElementChild)
                return head
            },
            isTargetMutation: (mutation) => mutation.target.nodeName.toLowerCase() === 'head',
        })
    }
    function removeSVGFilter() {
        removeNode(document.getElementById('dark-mode-svg'))
    }

    function fixBaseURL($url) {
        const a = document.createElement('a')
        a.href = $url
        return a.href
    }
    function parseURL($url, $base = null) {
        if ($base) {
            $base = fixBaseURL($base)
            return new URL($url, $base)
        }
        $url = fixBaseURL($url)
        return new URL($url)
    }
    function getAbsoluteURL($base, $relative) {
        if ($relative.match(/^data\:/)) {
            return $relative
        }
        const b = parseURL($base)
        const a = parseURL($relative, b.href)
        return a.href
    }

    function iterateCSSRules(rules, iterate) {
        forEach(rules, (rule) => {
            if (rule instanceof CSSMediaRule) {
                const media = Array.from(rule.media)
                if (media.includes('screen') || media.includes('all') || !(media.includes('print') || media.includes('speech'))) {
                    iterateCSSRules(rule.cssRules, iterate)
                }
            }
            else if (rule instanceof CSSStyleRule) {
                iterate(rule)
            }
            else if (rule instanceof CSSImportRule) {
                try {
                    iterateCSSRules(rule.styleSheet.cssRules, iterate)
                }
                catch (err) {
                    logWarn(err)
                }
            }
            else {
                logWarn(`CSSRule type not supported`, rule)
            }
        })
    }
    function iterateCSSDeclarations(style, iterate) {
        forEach(style, (property) => {
            const value = style.getPropertyValue(property).trim()
            if (!value) {
                return
            }
            iterate(property, value)
        })
    }
    function isCSSVariable(property) {
        return property.startsWith('--') && !property.startsWith('--darkmode')
    }
    function getCSSVariables(rules) {
        const variables = new Map()
        rules && iterateCSSRules(rules, (rule) => {
            rule.style && iterateCSSDeclarations(rule.style, (property, value) => {
                if (isCSSVariable(property)) {
                    variables.set(property, value)
                }
            })
        })
        return variables
    }
    function getElementCSSVariables(element) {
        const variables = new Map()
        iterateCSSDeclarations(element.style, (property, value) => {
            if (isCSSVariable(property)) {
                variables.set(property, value)
            }
        })
        return variables
    }
    const cssURLRegex = /url\((('.+?')|(".+?")|([^\)]*?))\)/g
    const cssImportRegex = /@import (url\()?(('.+?')|(".+?")|([^\)]*?))\)?;?/g
    function getCSSURLValue(cssURL) {
        return cssURL.replace(/^url\((.*)\)$/, '$1').replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1')
    }
    function getCSSBaseBath(url) {
        const cssURL = parseURL(url)
        return `${cssURL.origin}${cssURL.pathname.replace(/\?.*$/, '').replace(/(\/)([^\/]+)$/i, '$1')}`
    }
    function replaceCSSRelativeURLsWithAbsolute($css, cssBasePath) {
        return $css.replace(cssURLRegex, (match) => {
            const pathValue = getCSSURLValue(match)
            return `url("${getAbsoluteURL(cssBasePath, pathValue)}")`
        })
    }
    const cssCommentsRegex = /\/\*[\s\S]*?\*\//g
    function removeCSSComments($css) {
        return $css.replace(cssCommentsRegex, '')
    }
    const varRegex = /var\((--[^\s,\(\)]+),?\s*([^\(\)]*(\([^\(\)]*\)[^\(\)]*)*\s*)\)/g
    function replaceCSSVariables(value, variables, stack = new Set()) {
        let missing = false
        const unresolvable = new Set()
        const result = value.replace(varRegex, (match, name, fallback) => {
            if (stack.has(name)) {
                logWarn(`Circular reference to variable ${name}`)
                if (fallback) {
                    return fallback
                }
                missing = true
                return match
            }
            if (variables.has(name)) {
                const value = variables.get(name)
                if (value.match(varRegex)) {
                    unresolvable.add(name)
                }
                return value
            }
            else if (fallback) {
                return fallback
            }
            else {
                logWarn(`Variable ${name} not found`)
                missing = true
            }
            return match
        })
        if (missing) {
            return result
        }
        if (result.match(varRegex)) {
            unresolvable.forEach((v) => stack.add(v))
            return replaceCSSVariables(result, variables, stack)
        }
        return result
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
    function hslToString(hsl) {
        const { h, s, l, a } = hsl
        if (a != null && a < 1) {
            return `hsla(${toFixed(h)}, ${toFixed(s * 100)}%, ${toFixed(l * 100)}%, ${toFixed(a, 2)})`
        }
        return `hsl(${toFixed(h)}, ${toFixed(s * 100)}%, ${toFixed(l * 100)}%)`
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

    function getMatches(regex, input, group = 0) {
        const matches = []
        let m
        while (m = regex.exec(input)) {
            matches.push(m[group])
        }
        return matches
    }
    function formatCSS(text) {
        function trimLeft(text) {
            return text.replace(/^\s+/, '')
        }
        function getIndent(depth) {
            if (depth === 0) {
                return ''
            }
            return ' '.repeat(4 * depth)
        }
        const emptyRuleRegexp = /[^{}]+{\s*}/g
        while (emptyRuleRegexp.test(text)) {
            text = text.replace(emptyRuleRegexp, '')
        }
        const css = (text
            .replace(/\s{2,}/g, ' ')
            .replace(/\{/g, '{\n')
            .replace(/\}/g, '\n}\n')
            .replace(/\;(?![^(\(|\")]*(\)|\"))/g, ';\n')
            .replace(/\,(?![^(\(|\")]*(\)|\"))/g, ',\n')
            .replace(/\n\s*\n/g, '\n')
            .split('\n'))
        let depth = 0
        const formatted = []
        for (let x = 0, len = css.length;x < len;x++) {
            const line = css[x] + '\n'
            if (line.match(/\{/)) {
                formatted.push(getIndent(depth++) + trimLeft(line))
            }
            else if (line.match(/\}/)) {
                formatted.push(getIndent(--depth) + trimLeft(line))
            }
            else {
                formatted.push(getIndent(depth) + trimLeft(line))
            }
        }
        return formatted.join('').trim()
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
    function clearColorModificationCache() {
        colorModificationCache.clear()
        colorParseCache.clear()
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
    function noopHSL(hsl) {
        return hsl
    }
    function modifyColor(rgb, theme) {
        return modifyColorWithCache(rgb, theme, noopHSL)
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
    function modifyShadowColor(rgb, filter) {
        return modifyBackgroundColor(rgb, filter)
    }
    function modifyGradientColor(rgb, filter) {
        return modifyBackgroundColor(rgb, filter)
    }

    function isFirefox() {
        return navigator.userAgent.includes('Firefox')
    }
    function isDefinedSelectorSupported() {
        try {
            document.querySelector(':defined')
            return true
        }
        catch (err) {
            return false
        }
    }
    const IS_SHADOW_DOM_SUPPORTED = typeof ShadowRoot === 'function'
    function isCSSStyleSheetConstructorSupported() {
        try {
            new CSSStyleSheet()
            return true
        }
        catch (err) {
            return false
        }
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

    function toSVGMatrix(matrix) {
        return matrix.slice(0, 4).map(m => m.map(m => m.toFixed(3)).join(' ')).join(' ')
    }
    function getSVGFilterMatrixValue(config) {
        return toSVGMatrix(createFilterMatrix(config))
    }

    let counter = 0
    const resolvers = new Map()
    const rejectors = new Map()
    function bgFetch(request) {
        return new Promise((resolve, reject) => {
            const id = ++counter
            resolvers.set(id, resolve)
            rejectors.set(id, reject)
            chrome.runtime.sendMessage({ type: 'fetch', data: request, id })
        })
    }
    chrome.runtime.onMessage.addListener(({ type, data, error, id }) => {
        if (type === 'fetch-response') {
            const resolve = resolvers.get(id)
            const reject = rejectors.get(id)
            resolvers.delete(id)
            rejectors.delete(id)
            if (error) {
                reject && reject(error)
            }
            else {
                resolve && resolve(data)
            }
        }
    })

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

    async function getImageDetails(url) {
        let dataURL
        if (url.startsWith('data:')) {
            dataURL = url
        }
        else {
            dataURL = await getImageDataURL(url)
        }
        const image = await urlToImage(dataURL)
        const info = analyzeImage(image)
        return {
            src: url,
            dataURL,
            width: image.naturalWidth,
            height: image.naturalHeight,
            ...info,
        }
    }
    async function getImageDataURL(url) {
        if (getURLHostOrProtocol(url) === (location.host || location.protocol)) {
            return await loadAsDataURL(url)
        }
        return await bgFetch({ url, responseType: 'data-url' })
    }
    async function urlToImage(url) {
        return new Promise((resolve, reject) => {
            const image = new Image()
            image.onload = () => resolve(image)
            image.onerror = () => reject(`Unable to load image ${url}`)
            image.src = url
        })
    }
    const MAX_ANALIZE_PIXELS_COUNT = 32 * 32
    let canvas
    let context
    function createCanvas() {
        const maxWidth = MAX_ANALIZE_PIXELS_COUNT
        const maxHeight = MAX_ANALIZE_PIXELS_COUNT
        canvas = document.createElement('canvas')
        canvas.width = maxWidth
        canvas.height = maxHeight
        context = canvas.getContext('2d')
        context.imageSmoothingEnabled = false
    }
    function removeCanvas() {
        canvas = null
        context = null
    }
    function analyzeImage(image) {
        if (!canvas) {
            createCanvas()
        }
        const { naturalWidth, naturalHeight } = image
        const naturalPixelsCount = naturalWidth * naturalHeight
        const k = Math.min(1, Math.sqrt(MAX_ANALIZE_PIXELS_COUNT / naturalPixelsCount))
        const width = Math.ceil(naturalWidth * k)
        const height = Math.ceil(naturalHeight * k)
        context.clearRect(0, 0, width, height)
        context.drawImage(image, 0, 0, naturalWidth, naturalHeight, 0, 0, width, height)
        const imageData = context.getImageData(0, 0, width, height)
        const d = imageData.data
        const TRANSPARENT_ALPHA_THRESHOLD = 0.05
        const DARK_LIGHTNESS_THRESHOLD = 0.4
        const LIGHT_LIGHTNESS_THRESHOLD = 0.7
        let transparentPixelsCount = 0
        let darkPixelsCount = 0
        let lightPixelsCount = 0
        let i, x, y
        let r, g, b, a
        let l
        for (y = 0;y < height;y++) {
            for (x = 0;x < width;x++) {
                i = 4 * (y * width + x)
                r = d[i + 0] / 255
                g = d[i + 1] / 255
                b = d[i + 2] / 255
                a = d[i + 3] / 255
                if (a < TRANSPARENT_ALPHA_THRESHOLD) {
                    transparentPixelsCount++
                }
                else {
                    l = 0.2126 * r + 0.7152 * g + 0.0722 * b
                    if (l < DARK_LIGHTNESS_THRESHOLD) {
                        darkPixelsCount++
                    }
                    if (l > LIGHT_LIGHTNESS_THRESHOLD) {
                        lightPixelsCount++
                    }
                }
            }
        }
        const totalPixelsCount = width * height
        const opaquePixelsCount = totalPixelsCount - transparentPixelsCount
        const DARK_IMAGE_THRESHOLD = 0.7
        const LIGHT_IMAGE_THRESHOLD = 0.7
        const TRANSPARENT_IMAGE_THRESHOLD = 0.1
        const LARGE_IMAGE_PIXELS_COUNT = 800 * 600
        return {
            isDark: ((darkPixelsCount / opaquePixelsCount) >= DARK_IMAGE_THRESHOLD),
            isLight: ((lightPixelsCount / opaquePixelsCount) >= LIGHT_IMAGE_THRESHOLD),
            isTransparent: ((transparentPixelsCount / totalPixelsCount) >= TRANSPARENT_IMAGE_THRESHOLD),
            isLarge: (naturalPixelsCount >= LARGE_IMAGE_PIXELS_COUNT),
        }
    }
    const objectURLs = new Set()
    function getFilteredImageDataURL({ dataURL, width, height }, filter) {
        const matrix = getSVGFilterMatrixValue(filter)
        const svg = [
            `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}">`,
            '<defs>',
            '<filter id="darkmode-image-filter">',
            `<feColorMatrix type="matrix" values="${matrix}" />`,
            '</filter>',
            '</defs>',
            `<image width="${width}" height="${height}" filter="url(#darkmode-image-filter)" xlink:href="${dataURL}" />`,
            '</svg>',
        ].join('')
        const bytes = new Uint8Array(svg.length)
        for (let i = 0;i < svg.length;i++) {
            bytes[i] = svg.charCodeAt(i)
        }
        const blob = new Blob([bytes], { type: 'image/svg+xml' })
        const objectURL = URL.createObjectURL(blob)
        objectURLs.add(objectURL)
        return objectURL
    }
    function cleanImageProcessingCache() {
        removeCanvas()
        objectURLs.forEach((u) => URL.revokeObjectURL(u))
        objectURLs.clear()
    }

    function getModifiableCSSDeclaration(property, value, rule, ignoreImageSelectors, isCancelled) {
        const important = Boolean(rule && rule.style && rule.style.getPropertyPriority(property))
        const sourceValue = value
        if (property.startsWith('--')) {
            return null
        }
        else if ((property.indexOf('color') >= 0 && property !== '-webkit-print-color-adjust') ||
            property === 'fill' ||
            property === 'stroke') {
            const modifier = getColorModifier(property, value)
            if (modifier) {
                return { property, value: modifier, important, sourceValue }
            }
        }
        else if (property === 'background-image' || property === 'list-style-image') {
            const modifier = getBgImageModifier(value, rule, ignoreImageSelectors, isCancelled)
            if (modifier) {
                return { property, value: modifier, important, sourceValue }
            }
        }
        else if (property.indexOf('shadow') >= 0) {
            const modifier = getShadowModifier(property, value)
            if (modifier) {
                return { property, value: modifier, important, sourceValue }
            }
        }
        return null
    }
    function getModifiedUserAgentStyle(theme, isIFrame, styleSystemControls) {
        const lines = []
        if (!isIFrame) {
            lines.push('html {')
            lines.push(`    background-color: ${modifyBackgroundColor({ r: 255, g: 255, b: 255 }, theme)} !important;`)
            lines.push('}')
        }
        lines.push(`${isIFrame ? '' : 'html, body, '}${styleSystemControls ? 'input, textarea, select, button' : ''} {`)
        lines.push(`    background-color: ${modifyBackgroundColor({ r: 255, g: 255, b: 255 }, theme)};`)
        lines.push('}')
        lines.push(`html, body, ${styleSystemControls ? 'input, textarea, select, button' : ''} {`)
        lines.push(`    border-color: ${modifyBorderColor({ r: 76, g: 76, b: 76 }, theme)};`)
        lines.push(`    color: ${modifyForegroundColor({ r: 0, g: 0, b: 0 }, theme)};`)
        lines.push('}')
        lines.push('a {')
        lines.push(`    color: ${modifyForegroundColor({ r: 0, g: 64, b: 255 }, theme)};`)
        lines.push('}')
        lines.push('table {')
        lines.push(`    border-color: ${modifyBorderColor({ r: 128, g: 128, b: 128 }, theme)};`)
        lines.push('}')
        lines.push('::placeholder {')
        lines.push(`    color: ${modifyForegroundColor({ r: 169, g: 169, b: 169 }, theme)};`)
        lines.push('}')
        lines.push('input:-webkit-autofill,')
        lines.push('textarea:-webkit-autofill,')
        lines.push('select:-webkit-autofill {')
        lines.push(`    background-color: ${modifyBackgroundColor({ r: 250, g: 255, b: 189 }, theme)} !important;`)
        lines.push(`    color: ${modifyForegroundColor({ r: 0, g: 0, b: 0 }, theme)} !important;`)
        lines.push('}')
        if (theme.scrollbarColor) {
            lines.push(getModifiedScrollbarStyle(theme))
        }
        if (theme.selectionColor) {
            lines.push(getModifiedSelectionStyle(theme))
        }
        return lines.join('\n')
    }
    function getSelectionColor(theme) {
        let backgroundColorSelection
        let foregroundColorSelection
        if (theme.selectionColor === 'auto') {
            backgroundColorSelection = modifyBackgroundColor({ r: 0, g: 96, b: 212 }, { ...theme, grayscale: 0 })
            foregroundColorSelection = modifyForegroundColor({ r: 255, g: 255, b: 255 }, { ...theme, grayscale: 0 })
        }
        else {
            const rgb = parse(theme.selectionColor)
            const hsl = rgbToHSL(rgb)
            backgroundColorSelection = theme.selectionColor
            if (hsl.l < 0.5) {
                foregroundColorSelection = '#FFF'
            }
            else {
                foregroundColorSelection = '#000'
            }
        }
        return { backgroundColorSelection, foregroundColorSelection }
    }
    function getModifiedSelectionStyle(theme) {
        const lines = []
        const modifiedSelectionColor = getSelectionColor(theme)
        const backgroundColorSelection = modifiedSelectionColor.backgroundColorSelection
        const foregroundColorSelection = modifiedSelectionColor.foregroundColorSelection;
        ['::selection', '::-moz-selection'].forEach((selection) => {
            lines.push(`${selection} {`)
            lines.push(`    background-color: ${backgroundColorSelection} !important;`)
            lines.push(`    color: ${foregroundColorSelection} !important;`)
            lines.push('}')
        })
        return lines.join('\n')
    }
    function getModifiedScrollbarStyle(theme) {
        const lines = []
        let colorTrack
        let colorIcons
        let colorThumb
        let colorThumbHover
        let colorThumbActive
        let colorCorner
        if (theme.scrollbarColor === 'auto') {
            colorTrack = modifyBackgroundColor({ r: 241, g: 241, b: 241 }, theme)
            colorIcons = modifyForegroundColor({ r: 96, g: 96, b: 96 }, theme)
            colorThumb = modifyBackgroundColor({ r: 176, g: 176, b: 176 }, theme)
            colorThumbHover = modifyBackgroundColor({ r: 144, g: 144, b: 144 }, theme)
            colorThumbActive = modifyBackgroundColor({ r: 96, g: 96, b: 96 }, theme)
            colorCorner = modifyBackgroundColor({ r: 255, g: 255, b: 255 }, theme)
        }
        else {
            const rgb = parse(theme.scrollbarColor)
            const hsl = rgbToHSL(rgb)
            const isLight = hsl.l > 0.5
            const lighten = (lighter) => ({ ...hsl, l: clamp(hsl.l + lighter, 0, 1) })
            const darken = (darker) => ({ ...hsl, l: clamp(hsl.l - darker, 0, 1) })
            colorTrack = hslToString(darken(0.4))
            colorIcons = hslToString(isLight ? darken(0.4) : lighten(0.4))
            colorThumb = hslToString(hsl)
            colorThumbHover = hslToString(lighten(0.1))
            colorThumbActive = hslToString(lighten(0.2))
        }
        lines.push('::-webkit-scrollbar {')
        lines.push(`    background-color: ${colorTrack};`)
        lines.push(`    color: ${colorIcons};`)
        lines.push('}')
        lines.push('::-webkit-scrollbar-thumb {')
        lines.push(`    background-color: ${colorThumb};`)
        lines.push('}')
        lines.push('::-webkit-scrollbar-thumb:hover {')
        lines.push(`    background-color: ${colorThumbHover};`)
        lines.push('}')
        lines.push('::-webkit-scrollbar-thumb:active {')
        lines.push(`    background-color: ${colorThumbActive};`)
        lines.push('}')
        lines.push('::-webkit-scrollbar-corner {')
        lines.push(`    background-color: ${colorCorner};`)
        lines.push('}')
        lines.push('* {')
        lines.push(`    scrollbar-color: ${colorTrack} ${colorThumb};`)
        lines.push('}')
        return lines.join('\n')
    }
    function getModifiedFallbackStyle(filter, { strict }) {
        const lines = []
        lines.push(`html, body, ${strict ? 'body :not(iframe)' : 'body > :not(iframe)'} {`)
        lines.push(`    background-color: ${modifyBackgroundColor({ r: 255, g: 255, b: 255 }, filter)} !important;`)
        lines.push(`    border-color: ${modifyBorderColor({ r: 64, g: 64, b: 64 }, filter)} !important;`)
        lines.push(`    color: ${modifyForegroundColor({ r: 0, g: 0, b: 0 }, filter)} !important;`)
        lines.push('}')
        return lines.join('\n')
    }
    const unparsableColors = new Set([
        'inherit',
        'transparent',
        'initial',
        'currentcolor',
        'none',
        'unset',
    ])
    const colorParseCache$1 = new Map()
    function parseColorWithCache($color) {
        $color = $color.trim()
        if (colorParseCache$1.has($color)) {
            return colorParseCache$1.get($color)
        }
        const color = parse($color)
        colorParseCache$1.set($color, color)
        return color
    }
    function tryParseColor($color) {
        try {
            return parseColorWithCache($color)
        }
        catch (err) {
            return null
        }
    }
    function getColorModifier(prop, value) {
        if (unparsableColors.has(value.toLowerCase())) {
            return value
        }
        try {
            const rgb = parseColorWithCache(value)
            if (prop.indexOf('background') >= 0) {
                return (filter) => modifyBackgroundColor(rgb, filter)
            }
            if (prop.indexOf('border') >= 0 || prop.indexOf('outline') >= 0) {
                return (filter) => modifyBorderColor(rgb, filter)
            }
            return (filter) => modifyForegroundColor(rgb, filter)
        }
        catch (err) {
            logWarn('Color parse error', err)
            return null
        }
    }
    const gradientRegex = /[\-a-z]+gradient\(([^\(\)]*(\(([^\(\)]*(\(.*?\)))*[^\(\)]*\))){0,15}[^\(\)]*\)/g
    const imageDetailsCache = new Map()
    const awaitingForImageLoading = new Map()
    function shouldIgnoreImage(element, selectors) {
        if (!element) {
            return false
        }
        for (let i = 0;i < selectors.length;i++) {
            const ingnoredSelector = selectors[i]
            if (element.selectorText.match(ingnoredSelector)) {
                return true
            }
        }
        return false
    }
    function getBgImageModifier(value, rule, ignoreImageSelectors, isCancelled) {
        try {
            const gradients = getMatches(gradientRegex, value)
            const urls = getMatches(cssURLRegex, value)
            if (urls.length === 0 && gradients.length === 0) {
                return value
            }
            const getIndices = (matches) => {
                let index = 0
                return matches.map((match) => {
                    const valueIndex = value.indexOf(match, index)
                    index = valueIndex + match.length
                    return { match, index: valueIndex }
                })
            }
            const matches = getIndices(urls).map((i) => ({ type: 'url', ...i }))
                .concat(getIndices(gradients).map((i) => ({ type: 'gradient', ...i })))
                .sort((a, b) => a.index - b.index)
            const getGradientModifier = (gradient) => {
                const match = gradient.match(/^(.*-gradient)\((.*)\)$/)
                const type = match[1]
                const content = match[2]
                const partsRegex = /([^\(\),]+(\([^\(\)]*(\([^\(\)]*\)*[^\(\)]*)?\))?[^\(\),]*),?/g
                const colorStopRegex = /^(from|color-stop|to)\(([^\(\)]*?,\s*)?(.*?)\)$/
                const parts = getMatches(partsRegex, content, 1).map((part) => {
                    part = part.trim()
                    let rgb = tryParseColor(part)
                    if (rgb) {
                        return (filter) => modifyGradientColor(rgb, filter)
                    }
                    const space = part.lastIndexOf(' ')
                    rgb = tryParseColor(part.substring(0, space))
                    if (rgb) {
                        return (filter) => `${modifyGradientColor(rgb, filter)} ${part.substring(space + 1)}`
                    }
                    const colorStopMatch = part.match(colorStopRegex)
                    if (colorStopMatch) {
                        rgb = tryParseColor(colorStopMatch[3])
                        if (rgb) {
                            return (filter) => `${colorStopMatch[1]}(${colorStopMatch[2] ? `${colorStopMatch[2]}, ` : ''}${modifyGradientColor(rgb, filter)})`
                        }
                    }
                    return () => part
                })
                return (filter) => {
                    return `${type}(${parts.map((modify) => modify(filter)).join(', ')})`
                }
            }
            const getURLModifier = (urlValue) => {
                let url = getCSSURLValue(urlValue)
                if (rule.parentStyleSheet.href) {
                    const basePath = getCSSBaseBath(rule.parentStyleSheet.href)
                    url = getAbsoluteURL(basePath, url)
                }
                else if (rule.parentStyleSheet.ownerNode && rule.parentStyleSheet.ownerNode.baseURI) {
                    url = getAbsoluteURL(rule.parentStyleSheet.ownerNode.baseURI, url)
                }
                else {
                    url = getAbsoluteURL(location.origin, url)
                }
                const absoluteValue = `url("${url}")`
                return async (filter) => {
                    let imageDetails
                    if (imageDetailsCache.has(url)) {
                        imageDetails = imageDetailsCache.get(url)
                    }
                    else {
                        try {
                            if (shouldIgnoreImage(rule, ignoreImageSelectors)) {
                                return null
                            }
                            if (awaitingForImageLoading.has(url)) {
                                const awaiters = awaitingForImageLoading.get(url)
                                imageDetails = await new Promise((resolve) => awaiters.push(resolve))
                                if (!imageDetails) {
                                    return null
                                }
                            }
                            else {
                                awaitingForImageLoading.set(url, [])
                                imageDetails = await getImageDetails(url)
                                imageDetailsCache.set(url, imageDetails)
                                awaitingForImageLoading.get(url).forEach((resolve) => resolve(imageDetails))
                                awaitingForImageLoading.delete(url)
                            }
                            if (isCancelled()) {
                                return null
                            }
                        }
                        catch (err) {
                            logWarn(err)
                            if (awaitingForImageLoading.has(url)) {
                                awaitingForImageLoading.get(url).forEach((resolve) => resolve(null))
                                awaitingForImageLoading.delete(url)
                            }
                            return absoluteValue
                        }
                    }
                    const bgImageValue = getBgImageValue(imageDetails, filter) || absoluteValue
                    return bgImageValue
                }
            }
            const getBgImageValue = (imageDetails, filter) => {
                const { isDark, isLight, isTransparent, isLarge, width } = imageDetails
                let result
                if (isDark && isTransparent && filter.mode === 1 && !isLarge && width > 2) {
                    logInfo(`Inverting dark image ${imageDetails.src}`)
                    const inverted = getFilteredImageDataURL(imageDetails, { ...filter, sepia: clamp(filter.sepia + 10, 0, 100) })
                    result = `url("${inverted}")`
                }
                else if (isLight && !isTransparent && filter.mode === 1) {
                    if (isLarge) {
                        result = 'none'
                    }
                    else {
                        logInfo(`Dimming light image ${imageDetails.src}`)
                        const dimmed = getFilteredImageDataURL(imageDetails, filter)
                        result = `url("${dimmed}")`
                    }
                }
                else if (filter.mode === 0 && isLight && !isLarge) {
                    logInfo(`Applying filter to image ${imageDetails.src}`)
                    const filtered = getFilteredImageDataURL(imageDetails, { ...filter, brightness: clamp(filter.brightness - 10, 5, 200), sepia: clamp(filter.sepia + 10, 0, 100) })
                    result = `url("${filtered}")`
                }
                else {
                    result = null
                }
                return result
            }
            const modifiers = []
            let index = 0
            matches.forEach(({ match, type, index: matchStart }, i) => {
                const prefixStart = index
                const matchEnd = matchStart + match.length
                index = matchEnd
                modifiers.push(() => value.substring(prefixStart, matchStart))
                modifiers.push(type === 'url' ? getURLModifier(match) : getGradientModifier(match))
                if (i === matches.length - 1) {
                    modifiers.push(() => value.substring(matchEnd))
                }
            })
            return (filter) => {
                const results = modifiers.map((modify) => modify(filter))
                if (results.some((r) => r instanceof Promise)) {
                    return Promise.all(results)
                        .then((asyncResults) => {
                            return asyncResults.join('')
                        })
                }
                return results.join('')
            }
        }
        catch (err) {
            logWarn(`Unable to parse gradient ${value}`, err)
            return null
        }
    }
    function getShadowModifier(prop, value) {
        try {
            let index = 0
            const colorMatches = getMatches(/(^|\s)([a-z]+\(.+?\)|#[0-9a-f]+|[a-z]+)(.*?(inset|outset)?($|,))/ig, value, 2)
            const modifiers = colorMatches.map((match, i) => {
                const prefixIndex = index
                const matchIndex = value.indexOf(match, index)
                const matchEnd = matchIndex + match.length
                index = matchEnd
                const rgb = tryParseColor(match)
                if (!rgb) {
                    return () => value.substring(prefixIndex, matchEnd)
                }
                return (filter) => `${value.substring(prefixIndex, matchIndex)}${modifyShadowColor(rgb, filter)}${i === colorMatches.length - 1 ? value.substring(matchEnd) : ''}`
            })
            return (filter) => modifiers.map((modify) => modify(filter)).join('')
        }
        catch (err) {
            logWarn(`Unable to parse shadow ${value}`, err)
            return null
        }
    }
    function cleanModificationCache() {
        colorParseCache$1.clear()
        clearColorModificationCache()
        imageDetailsCache.clear()
        cleanImageProcessingCache()
        awaitingForImageLoading.clear()
    }

    const overrides = {
        'background-color': {
            customProp: '--darkmode-inline-bgcolor',
            cssProp: 'background-color',
            dataAttr: 'data-darkmode-inline-bgcolor',
            store: new WeakSet(),
        },
        'background-image': {
            customProp: '--darkmode-inline-bgimage',
            cssProp: 'background-image',
            dataAttr: 'data-darkmode-inline-bgimage',
            store: new WeakSet(),
        },
        'border-color': {
            customProp: '--darkmode-inline-border',
            cssProp: 'border-color',
            dataAttr: 'data-darkmode-inline-border',
            store: new WeakSet(),
        },
        'border-bottom-color': {
            customProp: '--darkmode-inline-border-bottom',
            cssProp: 'border-bottom-color',
            dataAttr: 'data-darkmode-inline-border-bottom',
            store: new WeakSet(),
        },
        'border-left-color': {
            customProp: '--darkmode-inline-border-left',
            cssProp: 'border-left-color',
            dataAttr: 'data-darkmode-inline-border-left',
            store: new WeakSet(),
        },
        'border-right-color': {
            customProp: '--darkmode-inline-border-right',
            cssProp: 'border-right-color',
            dataAttr: 'data-darkmode-inline-border-right',
            store: new WeakSet(),
        },
        'border-top-color': {
            customProp: '--darkmode-inline-border-top',
            cssProp: 'border-top-color',
            dataAttr: 'data-darkmode-inline-border-top',
            store: new WeakSet(),
        },
        'box-shadow': {
            customProp: '--darkmode-inline-boxshadow',
            cssProp: 'box-shadow',
            dataAttr: 'data-darkmode-inline-boxshadow',
            store: new WeakSet(),
        },
        'color': {
            customProp: '--darkmode-inline-color',
            cssProp: 'color',
            dataAttr: 'data-darkmode-inline-color',
            store: new WeakSet(),
        },
        'fill': {
            customProp: '--darkmode-inline-fill',
            cssProp: 'fill',
            dataAttr: 'data-darkmode-inline-fill',
            store: new WeakSet(),
        },
        'stroke': {
            customProp: '--darkmode-inline-stroke',
            cssProp: 'stroke',
            dataAttr: 'data-darkmode-inline-stroke',
            store: new WeakSet(),
        },
        'outline-color': {
            customProp: '--darkmode-inline-outline',
            cssProp: 'outline-color',
            dataAttr: 'data-darkmode-inline-outline',
            store: new WeakSet(),
        },
    }
    const overridesList = Object.values(overrides)
    const INLINE_STYLE_ATTRS = ['style', 'fill', 'stroke', 'bgcolor', 'color']
    const INLINE_STYLE_SELECTOR = INLINE_STYLE_ATTRS.map((attr) => `[${attr}]`).join(', ')
    function getInlineOverrideStyle() {
        return overridesList.map(({ dataAttr, customProp, cssProp }) => {
            return [
                `[${dataAttr}] {`,
                `  ${cssProp}: var(${customProp}) !important;`,
                '}',
            ].join('\n')
        }).join('\n')
    }
    function getInlineStyleElements(root) {
        const results = []
        if (root instanceof Element && root.matches(INLINE_STYLE_SELECTOR)) {
            results.push(root)
        }
        if (root instanceof Element || (IS_SHADOW_DOM_SUPPORTED && root instanceof ShadowRoot) || root instanceof Document) {
            push(results, root.querySelectorAll(INLINE_STYLE_SELECTOR))
        }
        return results
    }
    const treeObservers = new Map()
    const attrObservers = new Map()
    function watchForInlineStyles(elementStyleDidChange, shadowRootDiscovered) {
        deepWatchForInlineStyles(document, elementStyleDidChange, shadowRootDiscovered)
        iterateShadowHosts(document.documentElement, (host) => {
            deepWatchForInlineStyles(host.shadowRoot, elementStyleDidChange, shadowRootDiscovered)
        })
    }
    function deepWatchForInlineStyles(root, elementStyleDidChange, shadowRootDiscovered) {
        if (treeObservers.has(root)) {
            treeObservers.get(root).disconnect()
            attrObservers.get(root).disconnect()
        }
        const discoveredNodes = new WeakSet()
        function discoverNodes(node) {
            getInlineStyleElements(node).forEach((el) => {
                if (discoveredNodes.has(el)) {
                    return
                }
                discoveredNodes.add(el)
                elementStyleDidChange(el)
            })
            iterateShadowHosts(node, (n) => {
                if (discoveredNodes.has(node)) {
                    return
                }
                discoveredNodes.add(node)
                shadowRootDiscovered(n.shadowRoot)
                deepWatchForInlineStyles(n.shadowRoot, elementStyleDidChange, shadowRootDiscovered)
            })
        }
        const treeObserver = createOptimizedTreeObserver(root, {
            onMinorMutations: ({ additions }) => {
                additions.forEach((added) => discoverNodes(added))
            },
            onHugeMutations: () => {
                discoverNodes(root)
            },
        })
        treeObservers.set(root, treeObserver)
        const attrObserver = new MutationObserver((mutations) => {
            mutations.forEach((m) => {
                if (INLINE_STYLE_ATTRS.includes(m.attributeName)) {
                    elementStyleDidChange(m.target)
                }
                overridesList
                    .filter(({ store, dataAttr }) => store.has(m.target) && !m.target.hasAttribute(dataAttr))
                    .forEach(({ dataAttr }) => m.target.setAttribute(dataAttr, ''))
            })
        })
        attrObserver.observe(root, {
            attributes: true,
            attributeFilter: INLINE_STYLE_ATTRS.concat(overridesList.map(({ dataAttr }) => dataAttr)),
            subtree: true,
        })
        attrObservers.set(root, attrObserver)
    }
    function stopWatchingForInlineStyles() {
        treeObservers.forEach((o) => o.disconnect())
        attrObservers.forEach((o) => o.disconnect())
        treeObservers.clear()
        attrObservers.clear()
    }
    const inlineStyleCache = new WeakMap()
    const filterProps = ['brightness', 'contrast', 'grayscale', 'sepia', 'mode']
    function getInlineStyleCacheKey(el, theme) {
        return INLINE_STYLE_ATTRS
            .map((attr) => `${attr}="${el.getAttribute(attr)}"`)
            .concat(filterProps.map((prop) => `${prop}="${theme[prop]}"`))
            .join(' ')
    }
    function shouldIgnoreInlineStyle(element, selectors) {
        for (let i = 0, len = selectors.length;i < len;i++) {
            const ingnoredSelector = selectors[i]
            if (element.matches(ingnoredSelector)) {
                return true
            }
        }
        return false
    }
    function overrideInlineStyle(element, theme, ignoreInlineSelectors, ignoreImageSelectors) {
        const cacheKey = getInlineStyleCacheKey(element, theme)
        if (cacheKey === inlineStyleCache.get(element)) {
            return
        }
        const unsetProps = new Set(Object.keys(overrides))
        function setCustomProp(targetCSSProp, modifierCSSProp, cssVal) {
            const { customProp, dataAttr } = overrides[targetCSSProp]
            const mod = getModifiableCSSDeclaration(modifierCSSProp, cssVal, null, ignoreImageSelectors, null)
            if (!mod) {
                return
            }
            let value = mod.value
            if (typeof value === 'function') {
                value = value(theme)
            }
            element.style.setProperty(customProp, value)
            if (!element.hasAttribute(dataAttr)) {
                element.setAttribute(dataAttr, '')
            }
            unsetProps.delete(targetCSSProp)
        }
        if (ignoreInlineSelectors.length > 0) {
            if (shouldIgnoreInlineStyle(element, ignoreInlineSelectors)) {
                unsetProps.forEach((cssProp) => {
                    const { store, dataAttr } = overrides[cssProp]
                    store.delete(element)
                    element.removeAttribute(dataAttr)
                })
                return
            }
        }
        if (element.hasAttribute('bgcolor')) {
            let value = element.getAttribute('bgcolor')
            if (value.match(/^[0-9a-f]{3}$/i) || value.match(/^[0-9a-f]{6}$/i)) {
                value = `#${value}`
            }
            setCustomProp('background-color', 'background-color', value)
        }
        if (element.hasAttribute('color')) {
            let value = element.getAttribute('color')
            if (value.match(/^[0-9a-f]{3}$/i) || value.match(/^[0-9a-f]{6}$/i)) {
                value = `#${value}`
            }
            setCustomProp('color', 'color', value)
        }
        if (element.hasAttribute('fill') && element instanceof SVGElement) {
            const SMALL_SVG_LIMIT = 32
            const value = element.getAttribute('fill')
            let isBg = false
            if (!(element instanceof SVGTextElement)) {
                const { width, height } = element.getBoundingClientRect()
                isBg = (width > SMALL_SVG_LIMIT || height > SMALL_SVG_LIMIT)
            }
            setCustomProp('fill', isBg ? 'background-color' : 'color', value)
        }
        if (element.hasAttribute('stroke')) {
            const value = element.getAttribute('stroke')
            setCustomProp('stroke', element instanceof SVGLineElement || element instanceof SVGTextElement ? 'border-color' : 'color', value)
        }
        element.style && iterateCSSDeclarations(element.style, (property, value) => {
            if (property === 'background-image' && value.indexOf('url') >= 0) {
                return
            }
            if (overrides.hasOwnProperty(property)) {
                setCustomProp(property, property, value)
            }
        })
        if (element.style && element instanceof SVGTextElement && element.style.fill) {
            setCustomProp('fill', 'color', element.style.getPropertyValue('fill'))
        }
        forEach(unsetProps, (cssProp) => {
            const { store, dataAttr } = overrides[cssProp]
            store.delete(element)
            element.removeAttribute(dataAttr)
        })
        inlineStyleCache.set(element, getInlineStyleCacheKey(element, theme))
    }

    const metaThemeColorName = 'theme-color'
    const metaThemeColorSelector = `meta[name="${metaThemeColorName}"]`
    let srcMetaThemeColor = null
    let observer = null
    function changeMetaThemeColor(meta, theme) {
        srcMetaThemeColor = srcMetaThemeColor || meta.content
        try {
            const color = parse(srcMetaThemeColor)
            meta.content = modifyBackgroundColor(color, theme)
        }
        catch (err) {
            logWarn(err)
        }
    }
    function changeMetaThemeColorWhenAvailable(theme) {
        const meta = document.querySelector(metaThemeColorSelector)
        if (meta) {
            changeMetaThemeColor(meta, theme)
        }
        else {
            if (observer) {
                observer.disconnect()
            }
            observer = new MutationObserver((mutations) => {
                loop: for (let i = 0;i < mutations.length;i++) {
                    const { addedNodes } = mutations[i]
                    for (let j = 0;j < addedNodes.length;j++) {
                        const node = addedNodes[j]
                        if (node instanceof HTMLMetaElement && node.name === metaThemeColorName) {
                            observer.disconnect()
                            observer = null
                            changeMetaThemeColor(node, theme)
                            break loop
                        }
                    }
                }
            })
            observer.observe(document.head, { childList: true })
        }
    }
    function restoreMetaThemeColor() {
        if (observer) {
            observer.disconnect()
            observer = null
        }
        const meta = document.querySelector(metaThemeColorSelector)
        if (meta && srcMetaThemeColor) {
            meta.content = srcMetaThemeColor
        }
    }

    const themeCacheKeys$1 = [
        'mode',
        'brightness',
        'contrast',
        'grayscale',
        'sepia',
        'darkSchemeBackgroundColor',
        'darkSchemeTextColor',
        'lightSchemeBackgroundColor',
        'lightSchemeTextColor',
    ]
    function getThemeKey(theme) {
        return themeCacheKeys$1.map((p) => `${p}:${theme[p]}`).join(';')
    }
    function getTempCSSStyleSheet() {
        if (isCSSStyleSheetConstructorSupported()) {
            return { sheet: new CSSStyleSheet(), remove: () => null }
        }
        const style = document.createElement('style')
        style.classList.add('darkmode')
        style.classList.add('darkmode--temp')
        style.media = 'screen';
        (document.head || document).append(style)
        return { sheet: style.sheet, remove: () => style.remove() }
    }
    const asyncQueue = createAsyncTasksQueue()
    function createStyleSheetModifier() {
        let renderId = 0
        const rulesTextCache = new Map()
        const rulesModCache = new Map()
        let prevFilterKey = null
        function modifySheet(options) {
            const rules = options.sourceCSSRules
            const { theme, variables, ignoreImageAnalysis, force, prepareSheet, isAsyncCancelled } = options
            let rulesChanged = (rulesModCache.size === 0)
            const notFoundCacheKeys = new Set(rulesModCache.keys())
            const themeKey = getThemeKey(theme)
            const themeChanged = (themeKey !== prevFilterKey)
            const modRules = []
            iterateCSSRules(rules, (rule) => {
                const cssText = rule.cssText
                let textDiffersFromPrev = false
                notFoundCacheKeys.delete(cssText)
                if (!rulesTextCache.has(cssText)) {
                    rulesTextCache.set(cssText, cssText)
                    textDiffersFromPrev = true
                }
                let vars
                let varsRule = null
                if (variables.size > 0 || cssText.includes('var(')) {
                    const cssTextWithVariables = replaceCSSVariables(cssText, variables)
                    if (rulesTextCache.get(cssText) !== cssTextWithVariables) {
                        rulesTextCache.set(cssText, cssTextWithVariables)
                        textDiffersFromPrev = true
                        vars = getTempCSSStyleSheet()
                        vars.sheet.insertRule(cssTextWithVariables)
                        varsRule = vars.sheet.cssRules[0]
                    }
                }
                if (textDiffersFromPrev) {
                    rulesChanged = true
                }
                else {
                    modRules.push(rulesModCache.get(cssText))
                    return
                }
                const modDecs = []
                const targetRule = varsRule || rule
                targetRule && targetRule.style && iterateCSSDeclarations(targetRule.style, (property, value) => {
                    const mod = getModifiableCSSDeclaration(property, value, rule, ignoreImageAnalysis, isAsyncCancelled)
                    if (mod) {
                        modDecs.push(mod)
                    }
                })
                let modRule = null
                if (modDecs.length > 0) {
                    const parentRule = rule.parentRule
                    modRule = { selector: rule.selectorText, declarations: modDecs, parentRule }
                    modRules.push(modRule)
                }
                rulesModCache.set(cssText, modRule)
                vars && vars.remove()
            })
            notFoundCacheKeys.forEach((key) => {
                rulesTextCache.delete(key)
                rulesModCache.delete(key)
            })
            prevFilterKey = themeKey
            if (!force && !rulesChanged && !themeChanged) {
                return
            }
            renderId++
            function setRule(target, index, rule) {
                const { selector, declarations } = rule
                target.insertRule(`${selector} {}`, index)
                const style = target.cssRules.item(index).style
                declarations.forEach(({ property, value, important, sourceValue }) => {
                    style.setProperty(property, value == null ? sourceValue : value, important ? 'important' : '')
                })
            }
            const asyncDeclarations = new Map()
            let asyncDeclarationCounter = 0
            const rootReadyGroup = { rule: null, rules: [], isGroup: true }
            const groupRefs = new WeakMap()
            function getGroup(rule) {
                if (rule == null) {
                    return rootReadyGroup
                }
                if (groupRefs.has(rule)) {
                    return groupRefs.get(rule)
                }
                const group = { rule, rules: [], isGroup: true }
                groupRefs.set(rule, group)
                const parentGroup = getGroup(rule.parentRule)
                parentGroup.rules.push(group)
                return group
            }
            modRules.filter((r) => r).forEach(({ selector, declarations, parentRule }) => {
                const group = getGroup(parentRule)
                const readyStyleRule = { selector, declarations: [], isGroup: false }
                const readyDeclarations = readyStyleRule.declarations
                group.rules.push(readyStyleRule)
                declarations.forEach(({ property, value, important, sourceValue }) => {
                    if (typeof value === 'function') {
                        const modified = value(theme)
                        if (modified instanceof Promise) {
                            const asyncKey = asyncDeclarationCounter++
                            const asyncDeclaration = { property, value: null, important, asyncKey, sourceValue }
                            readyDeclarations.push(asyncDeclaration)
                            const promise = modified
                            const currentRenderId = renderId
                            promise.then((asyncValue) => {
                                if (!asyncValue || isAsyncCancelled() || currentRenderId !== renderId) {
                                    return
                                }
                                asyncDeclaration.value = asyncValue
                                asyncQueue.add(() => {
                                    if (isAsyncCancelled() || currentRenderId !== renderId) {
                                        return
                                    }
                                    rebuildAsyncRule(asyncKey)
                                })
                            })
                        }
                        else {
                            readyDeclarations.push({ property, value: modified, important, sourceValue })
                        }
                    }
                    else {
                        readyDeclarations.push({ property, value, important, sourceValue })
                    }
                })
            })
            const sheet = prepareSheet()
            function buildStyleSheet() {
                function createTarget(group, parent) {
                    const { rule } = group
                    if (rule instanceof CSSMediaRule) {
                        const { media } = rule
                        const index = parent.cssRules.length
                        parent.insertRule(`@media ${media} {}`, index)
                        return parent.cssRules[index]
                    }
                    return parent
                }
                function iterateReadyRules(group, target, styleIterator) {
                    group.rules.forEach((r) => {
                        if (r.isGroup) {
                            const t = createTarget(r, target)
                            iterateReadyRules(r, t, styleIterator)
                        }
                        else {
                            styleIterator(r, target)
                        }
                    })
                }
                iterateReadyRules(rootReadyGroup, sheet, (rule, target) => {
                    const index = target.cssRules.length
                    rule.declarations
                        .filter(({ value }) => value == null)
                        .forEach(({ asyncKey }) => asyncDeclarations.set(asyncKey, { rule, target, index }))
                    setRule(target, index, rule)
                })
            }
            function rebuildAsyncRule(key) {
                const { rule, target, index } = asyncDeclarations.get(key)
                target.deleteRule(index)
                setRule(target, index, rule)
                asyncDeclarations.delete(key)
            }
            buildStyleSheet()
        }
        return { modifySheet }
    }

    const STYLE_SELECTOR = 'style, link[rel*="stylesheet" i]:not([disabled])'
    function shouldManageStyle(element) {
        return (((element instanceof HTMLStyleElement) ||
            (element instanceof SVGStyleElement) ||
            (element instanceof HTMLLinkElement &&
                element.rel &&
                element.rel.toLowerCase().includes('stylesheet') &&
                !element.disabled)) &&
            !element.classList.contains('darkmode') &&
            element.media !== 'print' &&
            !element.classList.contains('stylus'))
    }
    function getManageableStyles(node, results = [], deep = true) {
        if (shouldManageStyle(node)) {
            results.push(node)
        }
        else if (node instanceof Element || (IS_SHADOW_DOM_SUPPORTED && node instanceof ShadowRoot) || node === document) {
            forEach(node.querySelectorAll(STYLE_SELECTOR), (style) => getManageableStyles(style, results, false))
            if (deep) {
                iterateShadowHosts(node, (host) => getManageableStyles(host.shadowRoot, results, false))
            }
        }
        return results
    }
    function manageStyle(element, { update, loadingStart, loadingEnd }) {
        const prevStyles = []
        let next = element
        while ((next = next.nextElementSibling) && next.matches('.darkmode')) {
            prevStyles.push(next)
        }
        let corsCopy = prevStyles.find((el) => el.matches('.darkmode--cors')) || null
        let syncStyle = prevStyles.find((el) => el.matches('.darkmode--sync')) || null
        let corsCopyPositionWatcher = null
        let syncStylePositionWatcher = null
        let cancelAsyncOperations = false
        const sheetModifier = createStyleSheetModifier()
        const observer = new MutationObserver(() => {
            update()
        })
        const observerOptions = { attributes: true, childList: true, characterData: true }
        function containsCSSImport() {
            return element instanceof HTMLStyleElement && element.textContent.trim().match(cssImportRegex)
        }
        function getRulesSync() {
            if (corsCopy) {
                return corsCopy.sheet.cssRules
            }
            if (containsCSSImport()) {
                return null
            }
            return safeGetSheetRules()
        }
        function insertStyle() {
            if (corsCopy) {
                if (element.nextSibling !== corsCopy) {
                    element.parentNode.insertBefore(corsCopy, element.nextSibling)
                }
                if (corsCopy.nextSibling !== syncStyle) {
                    element.parentNode.insertBefore(syncStyle, corsCopy.nextSibling)
                }
            }
            else if (element.nextSibling !== syncStyle) {
                element.parentNode.insertBefore(syncStyle, element.nextSibling)
            }
        }
        function createSyncStyle() {
            syncStyle = element instanceof SVGStyleElement ?
                document.createElementNS('http://www.w3.org/2000/svg', 'style') :
                document.createElement('style')
            syncStyle.classList.add('darkmode')
            syncStyle.classList.add('darkmode--sync')
            syncStyle.media = 'screen'
        }
        let isLoadingRules = false
        let wasLoadingError = false
        async function getRulesAsync() {
            let cssText
            let cssBasePath
            if (element instanceof HTMLLinkElement) {
                let [cssRules, accessError] = getRulesOrError()
                if (accessError) {
                    logWarn(accessError)
                }
                if ((cssRules && !accessError) || isStillLoadingError(accessError)) {
                    try {
                        await linkLoading(element)
                    }
                    catch (err) {
                        logWarn(err)
                        wasLoadingError = true
                    }
                    if (cancelAsyncOperations) {
                        return null
                    }
                    [cssRules, accessError] = getRulesOrError()
                    if (accessError) {
                        logWarn(accessError)
                    }
                }
                if (cssRules != null) {
                    return cssRules
                }
                cssText = await loadText(element.href)
                cssBasePath = getCSSBaseBath(element.href)
                if (cancelAsyncOperations) {
                    return null
                }
            }
            else if (containsCSSImport()) {
                cssText = element.textContent.trim()
                cssBasePath = getCSSBaseBath(location.href)
            }
            else {
                return null
            }
            if (cssText) {
                try {
                    const fullCSSText = await replaceCSSImports(cssText, cssBasePath)
                    corsCopy = createCORSCopy(element, fullCSSText)
                }
                catch (err) {
                    logWarn(err)
                }
                if (corsCopy) {
                    corsCopyPositionWatcher = watchForNodePosition(corsCopy, 'prev-sibling')
                    return corsCopy.sheet.cssRules
                }
            }
            return null
        }
        function details() {
            const rules = getRulesSync()
            if (!rules) {
                if (isLoadingRules || wasLoadingError) {
                    return null
                }
                isLoadingRules = true
                loadingStart()
                getRulesAsync().then((results) => {
                    isLoadingRules = false
                    loadingEnd()
                    if (results) {
                        update()
                    }
                }).catch((err) => {
                    logWarn(err)
                    isLoadingRules = false
                    loadingEnd()
                })
                return null
            }
            const variables = getCSSVariables(rules)
            return { variables }
        }
        let forceRenderStyle = false
        function render(theme, variables, ignoreImageAnalysis) {
            const rules = getRulesSync()
            if (!rules) {
                return
            }
            cancelAsyncOperations = false
            function prepareOverridesSheet() {
                if (!syncStyle) {
                    createSyncStyle()
                }
                syncStylePositionWatcher && syncStylePositionWatcher.stop()
                insertStyle()
                if (syncStyle.sheet == null) {
                    syncStyle.textContent = ''
                }
                const sheet = syncStyle.sheet
                for (let i = sheet.cssRules.length - 1;i >= 0;i--) {
                    sheet.deleteRule(i)
                }
                if (syncStylePositionWatcher) {
                    syncStylePositionWatcher.run()
                }
                else {
                    syncStylePositionWatcher = watchForNodePosition(syncStyle, 'prev-sibling', () => {
                        forceRenderStyle = true
                        buildOverrides()
                    })
                }
                return syncStyle.sheet
            }
            function buildOverrides() {
                const force = forceRenderStyle
                forceRenderStyle = false
                sheetModifier.modifySheet({
                    prepareSheet: prepareOverridesSheet,
                    sourceCSSRules: rules,
                    theme,
                    variables,
                    ignoreImageAnalysis,
                    force,
                    isAsyncCancelled: () => cancelAsyncOperations,
                })
            }
            buildOverrides()
        }
        function getRulesOrError() {
            try {
                if (element.sheet == null) {
                    return [null, null]
                }
                return [element.sheet.cssRules, null]
            }
            catch (err) {
                return [null, err]
            }
        }
        function isStillLoadingError(error) {
            return error && error.message && error.message.includes('loading')
        }
        function safeGetSheetRules() {
            const [cssRules, err] = getRulesOrError()
            if (err) {
                logWarn(err)
                return null
            }
            return cssRules
        }
        let rulesChangeKey = null
        let rulesCheckFrameId = null
        function updateRulesChangeKey() {
            const rules = safeGetSheetRules()
            if (rules) {
                rulesChangeKey = rules.length
            }
        }
        function didRulesKeyChange() {
            const rules = safeGetSheetRules()
            return rules && rules.length !== rulesChangeKey
        }
        function subscribeToSheetChanges() {
            updateRulesChangeKey()
            unsubscribeFromSheetChanges()
            const checkForUpdate = () => {
                if (didRulesKeyChange()) {
                    updateRulesChangeKey()
                    update()
                }
                rulesCheckFrameId = requestAnimationFrame(checkForUpdate)
            }
            checkForUpdate()
        }
        function unsubscribeFromSheetChanges() {
            cancelAnimationFrame(rulesCheckFrameId)
        }
        function pause() {
            observer.disconnect()
            cancelAsyncOperations = true
            corsCopyPositionWatcher && corsCopyPositionWatcher.stop()
            syncStylePositionWatcher && syncStylePositionWatcher.stop()
            unsubscribeFromSheetChanges()
        }
        function destroy() {
            pause()
            removeNode(corsCopy)
            removeNode(syncStyle)
        }
        function watch() {
            observer.observe(element, observerOptions)
            if (element instanceof HTMLStyleElement) {
                subscribeToSheetChanges()
            }
        }
        const maxMoveCount = 10
        let moveCount = 0
        function restore() {
            if (!syncStyle) {
                return
            }
            moveCount++
            if (moveCount > maxMoveCount) {
                logWarn('Style sheet was moved multiple times', element)
                return
            }
            logWarn('Restore style', syncStyle, element)
            const shouldForceRender = syncStyle.sheet == null || syncStyle.sheet.cssRules.length > 0
            insertStyle()
            corsCopyPositionWatcher && corsCopyPositionWatcher.skip()
            syncStylePositionWatcher && syncStylePositionWatcher.skip()
            if (shouldForceRender) {
                forceRenderStyle = true
                updateRulesChangeKey()
                update()
            }
        }
        return {
            details,
            render,
            pause,
            destroy,
            watch,
            restore,
        }
    }
    function linkLoading(link) {
        return new Promise((resolve, reject) => {
            const cleanUp = () => {
                link.removeEventListener('load', onLoad)
                link.removeEventListener('error', onError)
            }
            const onLoad = () => {
                cleanUp()
                resolve()
            }
            const onError = () => {
                cleanUp()
                reject(`Link loading failed ${link.href}`)
            }
            link.addEventListener('load', onLoad)
            link.addEventListener('error', onError)
        })
    }
    function getCSSImportURL(importDeclaration) {
        return getCSSURLValue(importDeclaration.substring(8).replace(/;$/, ''))
    }
    async function loadText(url) {
        if (url.startsWith('data:')) {
            return await (await fetch(url)).text()
        }
        return await bgFetch({ url, responseType: 'text', mimeType: 'text/css' })
    }
    async function replaceCSSImports(cssText, basePath) {
        cssText = removeCSSComments(cssText)
        cssText = replaceCSSFontFace(cssText)
        cssText = replaceCSSRelativeURLsWithAbsolute(cssText, basePath)
        const importMatches = getMatches(cssImportRegex, cssText)
        for (const match of importMatches) {
            const importURL = getCSSImportURL(match)
            const absoluteURL = getAbsoluteURL(basePath, importURL)
            let importedCSS
            try {
                importedCSS = await loadText(absoluteURL)
                importedCSS = await replaceCSSImports(importedCSS, getCSSBaseBath(absoluteURL))
            }
            catch (err) {
                logWarn(err)
                importedCSS = ''
            }
            cssText = cssText.split(match).join(importedCSS)
        }
        cssText = cssText.trim()
        return cssText
    }
    function createCORSCopy(srcElement, cssText) {
        if (!cssText) {
            return null
        }
        const cors = document.createElement('style')
        cors.classList.add('darkmode')
        cors.classList.add('darkmode--cors')
        cors.media = 'screen'
        cors.textContent = cssText
        srcElement.parentNode.insertBefore(cors, srcElement.nextSibling)
        cors.sheet.disabled = true
        return cors
    }

    const observers = []
    let observedRoots
    const undefinedGroups = new Map()
    let elementsDefinitionCallback
    function collectUndefinedElements(root) {
        if (!isDefinedSelectorSupported()) {
            return
        }
        forEach(root.querySelectorAll(':not(:defined)'), (el) => {
            const tag = el.tagName.toLowerCase()
            if (!undefinedGroups.has(tag)) {
                undefinedGroups.set(tag, new Set())
                customElementsWhenDefined(tag).then(() => {
                    if (elementsDefinitionCallback) {
                        const elements = undefinedGroups.get(tag)
                        undefinedGroups.delete(tag)
                        elementsDefinitionCallback(Array.from(elements))
                    }
                })
            }
            undefinedGroups.get(tag).add(el)
        })
    }
    function customElementsWhenDefined(tag) {
        return new Promise((resolve) => {
            if (window.customElements && typeof window.customElements.whenDefined === 'function') {
                customElements.whenDefined(tag).then(resolve)
            }
            else {
                const checkIfDefined = () => {
                    const elements = undefinedGroups.get(tag)
                    if (elements && elements.size > 0) {
                        if (elements.values().next().value.matches(':defined')) {
                            resolve()
                        }
                        else {
                            requestAnimationFrame(checkIfDefined)
                        }
                    }
                }
                requestAnimationFrame(checkIfDefined)
            }
        })
    }
    function watchWhenCustomElementsDefined(callback) {
        elementsDefinitionCallback = callback
    }
    function unsubscribeFromDefineCustomElements() {
        elementsDefinitionCallback = null
        undefinedGroups.clear()
    }
    function watchForStyleChanges(currentStyles, update, shadowRootDiscovered) {
        stopWatchingForStyleChanges()
        const prevStyles = new Set(currentStyles)
        const prevStyleSiblings = new WeakMap()
        const nextStyleSiblings = new WeakMap()
        function saveStylePosition(style) {
            prevStyleSiblings.set(style, style.previousElementSibling)
            nextStyleSiblings.set(style, style.nextElementSibling)
        }
        function forgetStylePosition(style) {
            prevStyleSiblings.delete(style)
            nextStyleSiblings.delete(style)
        }
        function didStylePositionChange(style) {
            return (style.previousElementSibling !== prevStyleSiblings.get(style) ||
                style.nextElementSibling !== nextStyleSiblings.get(style))
        }
        currentStyles.forEach(saveStylePosition)
        function handleStyleOperations(operations) {
            const { createdStyles, removedStyles, movedStyles } = operations
            createdStyles.forEach((s) => saveStylePosition(s))
            movedStyles.forEach((s) => saveStylePosition(s))
            removedStyles.forEach((s) => forgetStylePosition(s))
            createdStyles.forEach((s) => prevStyles.add(s))
            removedStyles.forEach((s) => prevStyles.delete(s))
            if (createdStyles.size + removedStyles.size + movedStyles.size > 0) {
                update({
                    created: Array.from(createdStyles),
                    removed: Array.from(removedStyles),
                    moved: Array.from(movedStyles),
                    updated: [],
                })
            }
        }
        function handleMinorTreeMutations({ additions, moves, deletions }) {
            const createdStyles = new Set()
            const removedStyles = new Set()
            const movedStyles = new Set()
            additions.forEach((node) => getManageableStyles(node).forEach((style) => createdStyles.add(style)))
            deletions.forEach((node) => getManageableStyles(node).forEach((style) => removedStyles.add(style)))
            moves.forEach((node) => getManageableStyles(node).forEach((style) => movedStyles.add(style)))
            handleStyleOperations({ createdStyles, removedStyles, movedStyles })
            additions.forEach((n) => {
                iterateShadowHosts(n, subscribeForShadowRootChanges)
                collectUndefinedElements(n)
            })
        }
        function handleHugeTreeMutations(root) {
            const styles = new Set(getManageableStyles(root))
            const createdStyles = new Set()
            const removedStyles = new Set()
            const movedStyles = new Set()
            styles.forEach((s) => {
                if (!prevStyles.has(s)) {
                    createdStyles.add(s)
                }
            })
            prevStyles.forEach((s) => {
                if (!styles.has(s)) {
                    removedStyles.add(s)
                }
            })
            styles.forEach((s) => {
                if (!createdStyles.has(s) && !removedStyles.has(s) && didStylePositionChange(s)) {
                    movedStyles.add(s)
                }
            })
            handleStyleOperations({ createdStyles, removedStyles, movedStyles })
            iterateShadowHosts(root, subscribeForShadowRootChanges)
            collectUndefinedElements(root)
        }
        function handleAttributeMutations(mutations) {
            const updatedStyles = new Set()
            mutations.forEach((m) => {
                if (shouldManageStyle(m.target) && m.target.isConnected) {
                    updatedStyles.add(m.target)
                }
            })
            if (updatedStyles.size > 0) {
                update({
                    updated: Array.from(updatedStyles),
                    created: [],
                    removed: [],
                    moved: [],
                })
            }
        }
        function observe(root) {
            const treeObserver = createOptimizedTreeObserver(root, {
                onMinorMutations: handleMinorTreeMutations,
                onHugeMutations: handleHugeTreeMutations,
            })
            const attrObserver = new MutationObserver(handleAttributeMutations)
            attrObserver.observe(root, { attributes: true, attributeFilter: ['rel', 'disabled'], subtree: true })
            observers.push(treeObserver, attrObserver)
            observedRoots.add(root)
        }
        function subscribeForShadowRootChanges(node) {
            const { shadowRoot } = node
            if (shadowRoot == null || observedRoots.has(shadowRoot)) {
                return
            }
            observe(shadowRoot)
            shadowRootDiscovered(shadowRoot)
        }
        observe(document)
        iterateShadowHosts(document.documentElement, subscribeForShadowRootChanges)
        watchWhenCustomElementsDefined((hosts) => {
            const newStyles = []
            hosts.forEach((host) => push(newStyles, getManageableStyles(host.shadowRoot)))
            update({ created: newStyles, updated: [], removed: [], moved: [] })
            hosts.forEach((host) => {
                const { shadowRoot } = host
                if (shadowRoot == null) {
                    return
                }
                subscribeForShadowRootChanges(host)
                iterateShadowHosts(shadowRoot, subscribeForShadowRootChanges)
                collectUndefinedElements(shadowRoot)
            })
        })
        collectUndefinedElements(document)
    }
    function resetObservers() {
        observers.forEach((o) => o.disconnect())
        observers.splice(0, observers.length)
        observedRoots = new WeakSet()
    }
    function stopWatchingForStyleChanges() {
        resetObservers()
        unsubscribeFromDefineCustomElements()
    }

    function hexify(number) {
        return ((number < 16 ? '0' : '') + number.toString(16))
    }
    function generateUID() {
        return Array.from(crypto.getRandomValues(new Uint8Array(16))).map((x) => hexify(x)).join('')
    }

    const adoptedStyleOverrides = new WeakMap()
    const overrideList = new WeakSet()
    function createAdoptedStyleSheetOverride(node) {
        let cancelAsyncOperations = false
        function injectSheet(sheet, override) {
            const newSheets = [...node.adoptedStyleSheets]
            const sheetIndex = newSheets.indexOf(sheet)
            const existingIndex = newSheets.indexOf(override)
            if (sheetIndex === existingIndex - 1) {
                return
            }
            if (existingIndex >= 0) {
                newSheets.splice(existingIndex, 1)
            }
            newSheets.splice(sheetIndex + 1, 0, override)
            node.adoptedStyleSheets = newSheets
        }
        function destroy() {
            cancelAsyncOperations = true
            const newSheets = [...node.adoptedStyleSheets]
            node.adoptedStyleSheets.forEach((adoptedStyleSheet) => {
                if (overrideList.has(adoptedStyleSheet)) {
                    const existingIndex = newSheets.indexOf(adoptedStyleSheet)
                    if (existingIndex >= 0) {
                        newSheets.splice(existingIndex, 1)
                    }
                    adoptedStyleOverrides.delete(adoptedStyleSheet)
                    overrideList.delete(adoptedStyleSheet)
                }
            })
            node.adoptedStyleSheets = newSheets
        }
        function render(theme, globalVariables, ignoreImageAnalysis) {
            node.adoptedStyleSheets.forEach((sheet) => {
                if (overrideList.has(sheet)) {
                    return
                }
                const rules = sheet.rules
                const override = new CSSStyleSheet()
                function prepareOverridesSheet() {
                    for (let i = override.cssRules.length - 1;i >= 0;i--) {
                        override.deleteRule(i)
                    }
                    injectSheet(sheet, override)
                    adoptedStyleOverrides.set(sheet, override)
                    overrideList.add(override)
                    return override
                }
                const variables = globalVariables
                getCSSVariables(sheet.cssRules).forEach((value, key) => variables.set(key, value))
                const sheetModifier = createStyleSheetModifier()
                sheetModifier.modifySheet({
                    prepareSheet: prepareOverridesSheet,
                    sourceCSSRules: rules,
                    theme,
                    variables,
                    ignoreImageAnalysis,
                    force: false,
                    isAsyncCancelled: () => cancelAsyncOperations,
                })
            })
        }
        return {
            render,
            destroy
        }
    }

    const variables = new Map()
    const INSTANCE_ID = generateUID()
    const styleManagers = new Map()
    const adoptedStyleManagers = []
    let filter = null
    let fixes = null
    let isIFrame = null
    function createOrUpdateStyle$1(className, root = document.head || document) {
        let style = root.querySelector(`.${className}`)
        if (!style) {
            style = document.createElement('style')
            style.classList.add('darkmode')
            style.classList.add(className)
            style.media = 'screen'
        }
        return style
    }
    const stylePositionWatchers = new Map()
    function setupStylePositionWatcher(node, alias) {
        stylePositionWatchers.has(alias) && stylePositionWatchers.get(alias).stop()
        stylePositionWatchers.set(alias, watchForNodePosition(node, 'parent'))
    }
    function stopStylePositionWatchers() {
        forEach(stylePositionWatchers.values(), (watcher) => watcher.stop())
        stylePositionWatchers.clear()
    }
    function createStaticStyleOverrides() {
        const fallbackStyle = createOrUpdateStyle$1('darkmode--fallback', document)
        fallbackStyle.textContent = getModifiedFallbackStyle(filter, { strict: true })
        document.head.insertBefore(fallbackStyle, document.head.firstChild)
        setupStylePositionWatcher(fallbackStyle, 'fallback')
        const userAgentStyle = createOrUpdateStyle$1('darkmode--user-agent')
        userAgentStyle.textContent = getModifiedUserAgentStyle(filter, isIFrame, filter.styleSystemControls)
        document.head.insertBefore(userAgentStyle, fallbackStyle.nextSibling)
        setupStylePositionWatcher(userAgentStyle, 'user-agent')
        const textStyle = createOrUpdateStyle$1('darkmode--text')
        if (filter.useFont || filter.textStroke > 0) {
            textStyle.textContent = createTextStyle(filter)
        }
        else {
            textStyle.textContent = ''
        }
        document.head.insertBefore(textStyle, fallbackStyle.nextSibling)
        setupStylePositionWatcher(textStyle, 'text')
        const invertStyle = createOrUpdateStyle$1('darkmode--invert')
        if (fixes && Array.isArray(fixes.invert) && fixes.invert.length > 0) {
            invertStyle.textContent = [
                `${fixes.invert.join(', ')} {`,
                `    filter: ${getCSSFilterValue({
                    ...filter,
                    contrast: filter.mode === 0 ? filter.contrast : clamp(filter.contrast - 10, 0, 100),
                })} !important;`,
                '}',
            ].join('\n')
        }
        else {
            invertStyle.textContent = ''
        }
        document.head.insertBefore(invertStyle, textStyle.nextSibling)
        setupStylePositionWatcher(invertStyle, 'invert')
        const inlineStyle = createOrUpdateStyle$1('darkmode--inline')
        inlineStyle.textContent = getInlineOverrideStyle()
        document.head.insertBefore(inlineStyle, invertStyle.nextSibling)
        setupStylePositionWatcher(inlineStyle, 'inline')
        const overrideStyle = createOrUpdateStyle$1('darkmode--override')
        overrideStyle.textContent = fixes && fixes.css ? replaceCSSTemplates(fixes.css) : ''
        document.head.appendChild(overrideStyle)
        setupStylePositionWatcher(overrideStyle, 'override')
        const variableStyle = createOrUpdateStyle$1('darkmode--variables')
        const selectionColors = getSelectionColor(filter)
        const { darkSchemeBackgroundColor, darkSchemeTextColor, lightSchemeBackgroundColor, lightSchemeTextColor } = filter
        variableStyle.textContent = [
            `:root {`,
            `   --darkmode-neutral-background: ${filter.mode === 0 ? lightSchemeBackgroundColor : darkSchemeBackgroundColor};`,
            `   --darkmode-neutral-text: ${filter.mode === 0 ? lightSchemeTextColor : darkSchemeTextColor};`,
            `   --darkmode-selection-background: ${selectionColors.backgroundColorSelection};`,
            `   --darkmode-selection-text: ${selectionColors.foregroundColorSelection};`,
            `}`
        ].join('\n')
        document.head.insertBefore(variableStyle, inlineStyle.nextSibling)
        setupStylePositionWatcher(variableStyle, 'variables')
    }
    const shadowRootsWithOverrides = new Set()
    function createShadowStaticStyleOverrides(root) {
        const inlineStyle = createOrUpdateStyle$1('darkmode--inline', root)
        inlineStyle.textContent = getInlineOverrideStyle()
        root.insertBefore(inlineStyle, root.firstChild)
        shadowRootsWithOverrides.add(root)
    }
    function replaceCSSTemplates($cssText) {
        return $cssText.replace(/\${(.+?)}/g, (m0, $color) => {
            try {
                const color = parseColorWithCache($color)
                return modifyColor(color, filter)
            }
            catch (err) {
                logWarn(err)
                return $color
            }
        })
    }
    function cleanFallbackStyle() {
        const fallback = document.querySelector('.darkmode--fallback')
        if (fallback) {
            fallback.textContent = ''
        }
    }
    function getIgnoreImageAnalysisSelectors() {
        return fixes && Array.isArray(fixes.ignoreImageAnalysis) ? fixes.ignoreImageAnalysis : []
    }
    function createDynamicStyleOverrides() {
        cancelRendering()
        updateVariables(getElementCSSVariables(document.documentElement))
        const allStyles = getManageableStyles(document)
        const newManagers = allStyles
            .filter((style) => !styleManagers.has(style))
            .map((style) => createManager(style))
        const newVariables = newManagers
            .map((manager) => manager.details())
            .filter((details) => details && details.variables.size > 0)
            .map(({ variables }) => variables)
        if (newVariables.length === 0) {
            styleManagers.forEach((manager) => manager.render(filter, variables, getIgnoreImageAnalysisSelectors()))
            if (loadingStyles.size === 0) {
                cleanFallbackStyle()
            }
        }
        else {
            newVariables.forEach((variables) => updateVariables(variables))
            throttledRenderAllStyles(() => {
                if (loadingStyles.size === 0) {
                    cleanFallbackStyle()
                }
            })
        }
        newManagers.forEach((manager) => manager.watch())
        const inlineStyleElements = toArray(document.querySelectorAll(INLINE_STYLE_SELECTOR))
        iterateShadowHosts(document.documentElement, (host) => {
            const elements = host.shadowRoot.querySelectorAll(INLINE_STYLE_SELECTOR)
            if (elements.length > 0) {
                createShadowStaticStyleOverrides(host.shadowRoot)
                push(inlineStyleElements, elements)
            }
        })
        const ignoredInlineSelectors = fixes && Array.isArray(fixes.ignoreInlineStyle) ? fixes.ignoreInlineStyle : []
        inlineStyleElements.forEach((el) => overrideInlineStyle(el, filter, getIgnoreImageAnalysisSelectors(), ignoredInlineSelectors))
        handleAdoptedStyleSheets(document)
    }
    let loadingStylesCounter = 0
    const loadingStyles = new Set()
    function createManager(element) {
        const loadingStyleId = ++loadingStylesCounter
        function loadingStart() {
            if (!isDOMReady() || !didDocumentShowUp) {
                loadingStyles.add(loadingStyleId)
                const fallbackStyle = document.querySelector('.darkmode--fallback')
                if (!fallbackStyle.textContent) {
                    fallbackStyle.textContent = getModifiedFallbackStyle(filter, { strict: false })
                }
            }
        }
        function loadingEnd() {
            loadingStyles.delete(loadingStyleId)
            if (loadingStyles.size === 0 && isDOMReady()) {
                cleanFallbackStyle()
            }
        }
        function update() {
            const details = manager.details()
            if (!details) {
                return
            }
            if (details.variables.size === 0) {
                manager.render(filter, variables, getIgnoreImageAnalysisSelectors())
            }
            else {
                updateVariables(details.variables)
                throttledRenderAllStyles()
            }
        }
        const manager = manageStyle(element, { update, loadingStart, loadingEnd })
        styleManagers.set(element, manager)
        return manager
    }
    function updateVariables(newVars) {
        if (newVars.size === 0) {
            return
        }
        newVars.forEach((value, key) => {
            variables.set(key, value)
        })
        variables.forEach((value, key) => {
            variables.set(key, replaceCSSVariables(value, variables))
        })
    }
    function removeManager(element) {
        const manager = styleManagers.get(element)
        if (manager) {
            manager.destroy()
            styleManagers.delete(element)
        }
    }
    const throttledRenderAllStyles = throttle((callback) => {
        styleManagers.forEach((manager) => manager.render(filter, variables, getIgnoreImageAnalysisSelectors()))
        adoptedStyleManagers.forEach((manager) => manager.render(filter, variables, getIgnoreImageAnalysisSelectors()))
        callback && callback()
    })
    const cancelRendering = function () {
        throttledRenderAllStyles.cancel()
    }
    function onDOMReady() {
        if (loadingStyles.size === 0) {
            cleanFallbackStyle()
        }
    }
    let documentVisibilityListener = null
    let didDocumentShowUp = !document.hidden
    function watchForDocumentVisibility(callback) {
        const alreadyWatching = Boolean(documentVisibilityListener)
        documentVisibilityListener = () => {
            if (!document.hidden) {
                stopWatchingForDocumentVisibility()
                callback()
                didDocumentShowUp = true
            }
        }
        if (!alreadyWatching) {
            document.addEventListener('visibilitychange', documentVisibilityListener)
        }
    }
    function stopWatchingForDocumentVisibility() {
        document.removeEventListener('visibilitychange', documentVisibilityListener)
        documentVisibilityListener = null
    }
    function createThemeAndWatchForUpdates() {
        createStaticStyleOverrides()
        function runDynamicStyle() {
            createDynamicStyleOverrides()
            watchForUpdates()
        }
        if (document.hidden) {
            watchForDocumentVisibility(runDynamicStyle)
        }
        else {
            runDynamicStyle()
        }
        changeMetaThemeColorWhenAvailable(filter)
    }
    function handleAdoptedStyleSheets(node) {
        if (Array.isArray(node.adoptedStyleSheets)) {
            if (node.adoptedStyleSheets.length > 0) {
                const newManger = createAdoptedStyleSheetOverride(node)
                adoptedStyleManagers.push(newManger)
                newManger.render(filter, variables, getIgnoreImageAnalysisSelectors())
            }
        }
    }
    function watchForUpdates() {
        const managedStyles = Array.from(styleManagers.keys())
        watchForStyleChanges(managedStyles, ({ created, updated, removed, moved }) => {
            const stylesToRemove = removed
            const stylesToManage = created.concat(updated).concat(moved)
                .filter((style) => !styleManagers.has(style))
            const stylesToRestore = moved
                .filter((style) => styleManagers.has(style))
            stylesToRemove.forEach((style) => removeManager(style))
            const newManagers = stylesToManage
                .map((style) => createManager(style))
            const newVariables = newManagers
                .map((manager) => manager.details())
                .filter((details) => details && details.variables.size > 0)
                .map(({ variables }) => variables)
            if (newVariables.length === 0) {
                newManagers.forEach((manager) => manager.render(filter, variables, getIgnoreImageAnalysisSelectors()))
            }
            else {
                newVariables.forEach((variables) => updateVariables(variables))
                throttledRenderAllStyles()
            }
            newManagers.forEach((manager) => manager.watch())
            stylesToRestore.forEach((style) => styleManagers.get(style).restore())
        }, (shadowRoot) => {
            handleAdoptedStyleSheets(shadowRoot)
        })
        const ignoredInlineSelectors = fixes && Array.isArray(fixes.ignoreInlineStyle) ? fixes.ignoreInlineStyle : []
        watchForInlineStyles((element) => {
            overrideInlineStyle(element, filter, ignoredInlineSelectors, getIgnoreImageAnalysisSelectors())
            if (element === document.documentElement) {
                const rootVariables = getElementCSSVariables(document.documentElement)
                if (rootVariables.size > 0) {
                    updateVariables(rootVariables)
                    throttledRenderAllStyles()
                }
            }
        }, (root) => {
            const inlineStyleElements = root.querySelectorAll(INLINE_STYLE_SELECTOR)
            if (inlineStyleElements.length > 0) {
                createShadowStaticStyleOverrides(root)
                forEach(inlineStyleElements, (el) => overrideInlineStyle(el, filter, getIgnoreImageAnalysisSelectors(), ignoredInlineSelectors))
            }
        })
        addDOMReadyListener(onDOMReady)
    }
    function stopWatchingForUpdates() {
        styleManagers.forEach((manager) => manager.pause())
        stopStylePositionWatchers()
        stopWatchingForStyleChanges()
        stopWatchingForInlineStyles()
        removeDOMReadyListener(onDOMReady)
    }
    function createdarkmodeInstanceMarker() {
        const metaElement = document.createElement('meta')
        metaElement.name = 'darkmode'
        metaElement.content = INSTANCE_ID
        document.head.appendChild(metaElement)
    }
    function isAnotherdarkmodeInstanceActive() {
        const meta = document.querySelector('meta[name="darkmode"]')
        if (meta) {
            if (meta.content !== INSTANCE_ID) {
                return true
            }
            return false
        }
        else {
            createdarkmodeInstanceMarker()
            return false
        }
    }
    function createOrUpdateDynamicTheme(filterConfig, dynamicThemeFixes, iframe) {
        filter = filterConfig
        fixes = dynamicThemeFixes
        isIFrame = iframe
        if (document.head) {
            if (isAnotherdarkmodeInstanceActive()) {
                return
            }
            createThemeAndWatchForUpdates()
        }
        else {
            if (!isFirefox()) {
                const fallbackStyle = createOrUpdateStyle$1('darkmode--fallback')
                document.documentElement.appendChild(fallbackStyle)
                fallbackStyle.textContent = getModifiedFallbackStyle(filter, { strict: true })
            }
            const headObserver = new MutationObserver(() => {
                if (document.head) {
                    headObserver.disconnect()
                    if (isAnotherdarkmodeInstanceActive()) {
                        removeDynamicTheme()
                        return
                    }
                    createThemeAndWatchForUpdates()
                }
            })
            headObserver.observe(document, { childList: true, subtree: true })
        }
    }
    function removeDynamicTheme() {
        cleanDynamicThemeCache()
        removeNode(document.querySelector('.darkmode--fallback'))
        if (document.head) {
            restoreMetaThemeColor()
            removeNode(document.head.querySelector('.darkmode--user-agent'))
            removeNode(document.head.querySelector('.darkmode--text'))
            removeNode(document.head.querySelector('.darkmode--invert'))
            removeNode(document.head.querySelector('.darkmode--inline'))
            removeNode(document.head.querySelector('.darkmode--override'))
            removeNode(document.head.querySelector('meta[name="darkmode"]'))
        }
        shadowRootsWithOverrides.forEach((root) => {
            removeNode(root.querySelector('.darkmode--inline'))
        })
        shadowRootsWithOverrides.clear()
        forEach(styleManagers.keys(), (el) => removeManager(el))
        forEach(document.querySelectorAll('.darkmode'), removeNode)
        adoptedStyleManagers.forEach((manager) => {
            manager.destroy()
        })
        adoptedStyleManagers.splice(0)
    }
    function cleanDynamicThemeCache() {
        stopWatchingForDocumentVisibility()
        cancelRendering()
        stopWatchingForUpdates()
        cleanModificationCache()
    }

    function watchForColorSchemeChange(callback) {
        const query = window.matchMedia('(prefers-color-scheme: dark)')
        const onChange = () => callback({ isDark: query.matches })
        query.addListener(onChange)
        return {
            disconnect() {
                query.removeListener(onChange)
            },
        }
    }

    const blobRegex = /url\(\"(blob\:.*?)\"\)/g
    async function replaceBlobs(text) {
        const promises = []
        getMatches(blobRegex, text, 1).forEach((url) => {
            const promise = loadAsDataURL(url)
            promises.push(promise)
        })
        const data = await Promise.all(promises)
        return text.replace(blobRegex, () => `url("${data.shift()}")`)
    }
    const banner = ""
    async function collectCSS() {
        const css = [banner]
        function addStaticCSS(selector, comment) {
            const staticStyle = document.querySelector(selector)
            if (staticStyle && staticStyle.textContent) {
                css.push(`/* ${comment} */`)
                css.push(staticStyle.textContent)
                css.push('')
            }
        }
        addStaticCSS('.darkmode--fallback', 'Fallback Style')
        addStaticCSS('.darkmode--user-agent', 'User-Agent Style')
        addStaticCSS('.darkmode--text', 'Text Style')
        addStaticCSS('.darkmode--invert', 'Invert Style')
        addStaticCSS('.darkmode--override', 'Override Style')
        addStaticCSS('.darkmode--variables', 'Variables Style')
        const modifiedCSS = []
        document.querySelectorAll('.darkmode--sync').forEach((element) => {
            forEach(element.sheet.cssRules, (rule) => {
                rule && rule.cssText && modifiedCSS.push(rule.cssText)
            })
        })
        if (modifiedCSS.length != 0) {
            const formattedCSS = formatCSS(modifiedCSS.join('\n'))
            css.push('/* Modified CSS */')
            css.push(await replaceBlobs(formattedCSS))
            css.push('')
        }
        return css.join('\n')
    }

    function onMessage({ type, data }) {
        switch (type) {
            case 'add-css-filter':
            case 'add-static-theme': {
                const css = data
                removeDynamicTheme()
                createOrUpdateStyle(css)
                break
            }
            case 'add-svg-filter': {
                const { css, svgMatrix, svgReverseMatrix } = data
                removeDynamicTheme()
                createOrUpdateSVGFilter(svgMatrix, svgReverseMatrix)
                createOrUpdateStyle(css)
                break
            }
            case 'add-dynamic-theme': {
                const { filter, fixes, isIFrame } = data
                removeStyle()
                createOrUpdateDynamicTheme(filter, fixes, isIFrame)
                break
            }
            case 'export-css': {
                collectCSS().then((collectedCSS) => chrome.runtime.sendMessage({ type: 'export-css-response', data: collectedCSS }))
                break
            }
            case 'unsupported-sender':
            case 'clean-up': {
                removeStyle()
                removeSVGFilter()
                removeDynamicTheme()
                break
            }
        }
    }
    const colorSchemeWatcher = watchForColorSchemeChange(({ isDark }) => {
        logInfo('Media query was changed')
        chrome.runtime.sendMessage({ type: 'color-scheme-change', data: { isDark } })
    })
    const port = chrome.runtime.connect({ name: 'tab' })
    port.onMessage.addListener(onMessage)
    port.onDisconnect.addListener(() => {
        logWarn('disconnect')
        cleanDynamicThemeCache()
        colorSchemeWatcher.disconnect()
    })

}())
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9pbmplY3QvdXRpbHMvbG9nLnRzIiwiLi4vLi4vc3JjL2luamVjdC91dGlscy90aHJvdHRsZS50cyIsIi4uLy4uL3NyYy91dGlscy9hcnJheS50cyIsIi4uLy4uL3NyYy91dGlscy90aW1lLnRzIiwiLi4vLi4vc3JjL2luamVjdC91dGlscy9kb20udHMiLCIuLi8uLi9zcmMvaW5qZWN0L3N0eWxlLnRzIiwiLi4vLi4vc3JjL2luamVjdC9zdmctZmlsdGVyLnRzIiwiLi4vLi4vc3JjL2luamVjdC9keW5hbWljLXRoZW1lL3VybC50cyIsIi4uLy4uL3NyYy9pbmplY3QvZHluYW1pYy10aGVtZS9jc3MtcnVsZXMudHMiLCIuLi8uLi9zcmMvdXRpbHMvY29sb3IudHMiLCIuLi8uLi9zcmMvdXRpbHMvbWF0aC50cyIsIi4uLy4uL3NyYy91dGlscy90ZXh0LnRzIiwiLi4vLi4vc3JjL2dlbmVyYXRvcnMvdXRpbHMvbWF0cml4LnRzIiwiLi4vLi4vc3JjL2dlbmVyYXRvcnMvbW9kaWZ5LWNvbG9ycy50cyIsIi4uLy4uL3NyYy91dGlscy9wbGF0Zm9ybS50cyIsIi4uLy4uL3NyYy91dGlscy91cmwudHMiLCIuLi8uLi9zcmMvZ2VuZXJhdG9ycy90ZXh0LXN0eWxlLnRzIiwiLi4vLi4vc3JjL2dlbmVyYXRvcnMvY3NzLWZpbHRlci50cyIsIi4uLy4uL3NyYy9nZW5lcmF0b3JzL3N2Zy1maWx0ZXIudHMiLCIuLi8uLi9zcmMvaW5qZWN0L2R5bmFtaWMtdGhlbWUvbmV0d29yay50cyIsIi4uLy4uL3NyYy91dGlscy9uZXR3b3JrLnRzIiwiLi4vLi4vc3JjL2luamVjdC9keW5hbWljLXRoZW1lL2ltYWdlLnRzIiwiLi4vLi4vc3JjL2luamVjdC9keW5hbWljLXRoZW1lL21vZGlmeS1jc3MudHMiLCIuLi8uLi9zcmMvaW5qZWN0L2R5bmFtaWMtdGhlbWUvaW5saW5lLXN0eWxlLnRzIiwiLi4vLi4vc3JjL2luamVjdC9keW5hbWljLXRoZW1lL21ldGEtdGhlbWUtY29sb3IudHMiLCIuLi8uLi9zcmMvaW5qZWN0L2R5bmFtaWMtdGhlbWUvc3R5bGVzaGVldC1tb2RpZmllci50cyIsIi4uLy4uL3NyYy9pbmplY3QvZHluYW1pYy10aGVtZS9zdHlsZS1tYW5hZ2VyLnRzIiwiLi4vLi4vc3JjL2luamVjdC9keW5hbWljLXRoZW1lL3dhdGNoLnRzIiwiLi4vLi4vc3JjL3V0aWxzL3VpZC50cyIsIi4uLy4uL3NyYy9pbmplY3QvZHluYW1pYy10aGVtZS9hZG9wdGVkLXN0eWxlLW1hbmdlci50cyIsIi4uLy4uL3NyYy9pbmplY3QvZHluYW1pYy10aGVtZS9pbmRleC50cyIsIi4uLy4uL3NyYy9pbmplY3QvdXRpbHMvd2F0Y2gtY29sb3Itc2NoZW1lLnRzIiwiLi4vLi4vc3JjL2luamVjdC9keW5hbWljLXRoZW1lL2Nzcy1jb2xsZWN0aW9uLnRzIiwiLi4vLi4vc3JjL2luamVjdC9pbmRleC50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJkZWNsYXJlIGNvbnN0IF9fREVCVUdfXzogYm9vbGVhbjtcbmNvbnN0IERFQlVHID0gX19ERUJVR19fO1xuXG5leHBvcnQgZnVuY3Rpb24gbG9nSW5mbyguLi5hcmdzKSB7XG4gICAgREVCVUcgJiYgY29uc29sZS5pbmZvKC4uLmFyZ3MpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbG9nV2FybiguLi5hcmdzKSB7XG4gICAgREVCVUcgJiYgY29uc29sZS53YXJuKC4uLmFyZ3MpO1xufVxuIiwiZXhwb3J0IGZ1bmN0aW9uIHRocm90dGxlPFQgZXh0ZW5kcyguLi5hcmdzOiBhbnlbXSkgPT4gYW55PihjYWxsYmFjazogVCkge1xuICAgIGxldCBwZW5kaW5nID0gZmFsc2U7XG4gICAgbGV0IGZyYW1lSWQ6IG51bWJlciA9IG51bGw7XG4gICAgbGV0IGxhc3RBcmdzOiBhbnlbXTtcblxuICAgIGNvbnN0IHRocm90dGxlZDogVCA9ICgoLi4uYXJnczogYW55W10pID0+IHtcbiAgICAgICAgbGFzdEFyZ3MgPSBhcmdzO1xuICAgICAgICBpZiAoZnJhbWVJZCkge1xuICAgICAgICAgICAgcGVuZGluZyA9IHRydWU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjYWxsYmFjayguLi5sYXN0QXJncyk7XG4gICAgICAgICAgICBmcmFtZUlkID0gcmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHtcbiAgICAgICAgICAgICAgICBmcmFtZUlkID0gbnVsbDtcbiAgICAgICAgICAgICAgICBpZiAocGVuZGluZykge1xuICAgICAgICAgICAgICAgICAgICBjYWxsYmFjayguLi5sYXN0QXJncyk7XG4gICAgICAgICAgICAgICAgICAgIHBlbmRpbmcgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH0pIGFzIGFueTtcblxuICAgIGNvbnN0IGNhbmNlbCA9ICgpID0+IHtcbiAgICAgICAgY2FuY2VsQW5pbWF0aW9uRnJhbWUoZnJhbWVJZCk7XG4gICAgICAgIHBlbmRpbmcgPSBmYWxzZTtcbiAgICAgICAgZnJhbWVJZCA9IG51bGw7XG4gICAgfTtcblxuICAgIHJldHVybiBPYmplY3QuYXNzaWduKHRocm90dGxlZCwge2NhbmNlbH0pO1xufVxuXG50eXBlIFRhc2sgPSAoKSA9PiB2b2lkO1xuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlQXN5bmNUYXNrc1F1ZXVlKCkge1xuICAgIGNvbnN0IHRhc2tzOiBUYXNrW10gPSBbXTtcbiAgICBsZXQgZnJhbWVJZCA9IG51bGw7XG5cbiAgICBmdW5jdGlvbiBydW5UYXNrcygpIHtcbiAgICAgICAgbGV0IHRhc2s6IFRhc2s7XG4gICAgICAgIHdoaWxlICh0YXNrID0gdGFza3Muc2hpZnQoKSkge1xuICAgICAgICAgICAgdGFzaygpO1xuICAgICAgICB9XG4gICAgICAgIGZyYW1lSWQgPSBudWxsO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGFkZCh0YXNrOiBUYXNrKSB7XG4gICAgICAgIHRhc2tzLnB1c2godGFzayk7XG4gICAgICAgIGlmICghZnJhbWVJZCkge1xuICAgICAgICAgICAgZnJhbWVJZCA9IHJlcXVlc3RBbmltYXRpb25GcmFtZShydW5UYXNrcyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjYW5jZWwoKSB7XG4gICAgICAgIHRhc2tzLnNwbGljZSgwKTtcbiAgICAgICAgY2FuY2VsQW5pbWF0aW9uRnJhbWUoZnJhbWVJZCk7XG4gICAgICAgIGZyYW1lSWQgPSBudWxsO1xuICAgIH1cblxuICAgIHJldHVybiB7YWRkLCBjYW5jZWx9O1xufVxuIiwiZnVuY3Rpb24gaXNBcnJheUxpa2U8VD4oaXRlbXM6IEl0ZXJhYmxlPFQ+IHwgQXJyYXlMaWtlPFQ+KTogaXRlbXMgaXMgQXJyYXlMaWtlPFQ+IHtcbiAgICByZXR1cm4gKGl0ZW1zIGFzIEFycmF5TGlrZTxUPikubGVuZ3RoICE9IG51bGw7XG59XG5cbi8vIE5PVEU6IEl0ZXJhdGluZyBBcnJheS1saWtlIGl0ZW1zIHVzaW5nIGBmb3IgLi4gb2ZgIGlzIDN4IHNsb3dlciBpbiBGaXJlZm94XG4vLyBodHRwczovL2pzYmVuLmNoL2tpZE9wXG5leHBvcnQgZnVuY3Rpb24gZm9yRWFjaDxUPihpdGVtczogSXRlcmFibGU8VD4gfCBBcnJheUxpa2U8VD4sIGl0ZXJhdG9yOiAoaXRlbTogVCkgPT4gdm9pZCkge1xuICAgIGlmIChpc0FycmF5TGlrZShpdGVtcykpIHtcbiAgICAgICAgZm9yIChsZXQgaSA9IDAsIGxlbiA9IGl0ZW1zLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgICAgICBpdGVyYXRvcihpdGVtc1tpXSk7XG4gICAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgaXRlbXMpIHtcbiAgICAgICAgICAgIGl0ZXJhdG9yKGl0ZW0pO1xuICAgICAgICB9XG4gICAgfVxufVxuXG4vLyBOT1RFOiBQdXNoaW5nIGl0ZW1zIGxpa2UgYGFyci5wdXNoKC4uLml0ZW1zKWAgaXMgM3ggc2xvd2VyIGluIEZpcmVmb3hcbi8vIGh0dHBzOi8vanNiZW4uY2gvbnI5T0ZcbmV4cG9ydCBmdW5jdGlvbiBwdXNoPFQ+KGFycmF5OiBBcnJheTxUPiwgYWRkaXRpb246IEl0ZXJhYmxlPFQ+IHwgQXJyYXlMaWtlPFQ+KSB7XG4gICAgZm9yRWFjaChhZGRpdGlvbiwgKGEpID0+IGFycmF5LnB1c2goYSkpO1xufVxuXG4vLyBOT1RFOiBVc2luZyBgQXJyYXkuZnJvbSgpYCBpcyAyeCAoRkYpIOKAlCA1eCAoQ2hyb21lKSBzbG93ZXIgZm9yIEFycmF5TGlrZSAobm90IGZvciBJdGVyYWJsZSlcbi8vIGh0dHBzOi8vanNiZW4uY2gvRkoxbU9cbi8vIGh0dHBzOi8vanNiZW4uY2gvWm1WaUxcbmV4cG9ydCBmdW5jdGlvbiB0b0FycmF5PFQ+KGl0ZW1zOiBBcnJheUxpa2U8VD4pIHtcbiAgICBjb25zdCByZXN1bHRzID0gW10gYXMgQXJyYXk8VD47XG4gICAgZm9yIChsZXQgaSA9IDAsIGxlbiA9IGl0ZW1zLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgIHJlc3VsdHMucHVzaChpdGVtc1tpXSk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHRzO1xufVxuIiwiZXhwb3J0IGZ1bmN0aW9uIHBhcnNlVGltZSgkdGltZTogc3RyaW5nKSB7XG4gICAgY29uc3QgcGFydHMgPSAkdGltZS5zcGxpdCgnOicpLnNsaWNlKDAsIDIpO1xuICAgIGNvbnN0IGxvd2VyY2FzZWQgPSAkdGltZS50cmltKCkudG9Mb3dlckNhc2UoKTtcbiAgICBjb25zdCBpc0FNID0gbG93ZXJjYXNlZC5lbmRzV2l0aCgnYW0nKSB8fCBsb3dlcmNhc2VkLmVuZHNXaXRoKCdhLm0uJyk7XG4gICAgY29uc3QgaXNQTSA9IGxvd2VyY2FzZWQuZW5kc1dpdGgoJ3BtJykgfHwgbG93ZXJjYXNlZC5lbmRzV2l0aCgncC5tLicpO1xuXG4gICAgbGV0IGhvdXJzID0gcGFydHMubGVuZ3RoID4gMCA/IHBhcnNlSW50KHBhcnRzWzBdKSA6IDA7XG4gICAgaWYgKGlzTmFOKGhvdXJzKSB8fCBob3VycyA+IDIzKSB7XG4gICAgICAgIGhvdXJzID0gMDtcbiAgICB9XG4gICAgaWYgKGlzQU0gJiYgaG91cnMgPT09IDEyKSB7XG4gICAgICAgIGhvdXJzID0gMDtcbiAgICB9XG4gICAgaWYgKGlzUE0gJiYgaG91cnMgPCAxMikge1xuICAgICAgICBob3VycyArPSAxMjtcbiAgICB9XG5cbiAgICBsZXQgbWludXRlcyA9IHBhcnRzLmxlbmd0aCA+IDEgPyBwYXJzZUludChwYXJ0c1sxXSkgOiAwO1xuICAgIGlmIChpc05hTihtaW51dGVzKSB8fCBtaW51dGVzID4gNTkpIHtcbiAgICAgICAgbWludXRlcyA9IDA7XG4gICAgfVxuXG4gICAgcmV0dXJuIFtob3VycywgbWludXRlc107XG59XG5cbmZ1bmN0aW9uIHBhcnNlMjRIVGltZSh0aW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGltZS5zcGxpdCgnOicpLm1hcCgoeCkgPT4gcGFyc2VJbnQoeCkpO1xufVxuXG5mdW5jdGlvbiBjb21wYXJlVGltZShhOiBudW1iZXJbXSwgYjogbnVtYmVyW10pIHtcbiAgICBpZiAoYVswXSA9PT0gYlswXSAmJiBhWzFdID09PSBiWzFdKSB7XG4gICAgICAgIHJldHVybiAwO1xuICAgIH1cbiAgICBpZiAoYVswXSA8IGJbMF0gfHwgKGFbMF0gPT09IGJbMF0gJiYgYVsxXSA8IGJbMV0pKSB7XG4gICAgICAgIHJldHVybiAtMTtcbiAgICB9XG4gICAgcmV0dXJuIDE7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0luVGltZUludGVydmFsKGRhdGU6IERhdGUsIHRpbWUwOiBzdHJpbmcsIHRpbWUxOiBzdHJpbmcpIHtcbiAgICBjb25zdCBhID0gcGFyc2UyNEhUaW1lKHRpbWUwKTtcbiAgICBjb25zdCBiID0gcGFyc2UyNEhUaW1lKHRpbWUxKTtcbiAgICBjb25zdCB0ID0gW2RhdGUuZ2V0SG91cnMoKSwgZGF0ZS5nZXRNaW51dGVzKCldO1xuICAgIGlmIChjb21wYXJlVGltZShhLCBiKSA+IDApIHtcbiAgICAgICAgcmV0dXJuIGNvbXBhcmVUaW1lKGEsIHQpIDw9IDAgfHwgY29tcGFyZVRpbWUodCwgYikgPCAwO1xuICAgIH1cbiAgICByZXR1cm4gY29tcGFyZVRpbWUoYSwgdCkgPD0gMCAmJiBjb21wYXJlVGltZSh0LCBiKSA8IDA7XG59XG5cbmludGVyZmFjZSBEdXJhdGlvbiB7XG4gICAgZGF5cz86IG51bWJlcjtcbiAgICBob3Vycz86IG51bWJlcjtcbiAgICBtaW51dGVzPzogbnVtYmVyO1xuICAgIHNlY29uZHM/OiBudW1iZXI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXREdXJhdGlvbih0aW1lOiBEdXJhdGlvbikge1xuICAgIGxldCBkdXJhdGlvbiA9IDA7XG4gICAgaWYgKHRpbWUuc2Vjb25kcykge1xuICAgICAgICBkdXJhdGlvbiArPSB0aW1lLnNlY29uZHMgKiAxMDAwO1xuICAgIH1cbiAgICBpZiAodGltZS5taW51dGVzKSB7XG4gICAgICAgIGR1cmF0aW9uICs9IHRpbWUubWludXRlcyAqIDYwICogMTAwMDtcbiAgICB9XG4gICAgaWYgKHRpbWUuaG91cnMpIHtcbiAgICAgICAgZHVyYXRpb24gKz0gdGltZS5ob3VycyAqIDYwICogNjAgKiAxMDAwO1xuICAgIH1cbiAgICBpZiAodGltZS5kYXlzKSB7XG4gICAgICAgIGR1cmF0aW9uICs9IHRpbWUuZGF5cyAqIDI0ICogNjAgKiA2MCAqIDEwMDA7XG4gICAgfVxuICAgIHJldHVybiBkdXJhdGlvbjtcbn1cblxuZnVuY3Rpb24gZ2V0U3Vuc2V0U3VucmlzZVVUQ1RpbWUoXG4gICAgZGF0ZTogRGF0ZSxcbiAgICBsYXRpdHVkZTogbnVtYmVyLFxuICAgIGxvbmdpdHVkZTogbnVtYmVyLFxuKSB7XG4gICAgY29uc3QgZGVjMzEgPSBuZXcgRGF0ZShkYXRlLmdldFVUQ0Z1bGxZZWFyKCksIDAsIDApO1xuICAgIGNvbnN0IG9uZURheSA9IGdldER1cmF0aW9uKHtkYXlzOiAxfSk7XG4gICAgY29uc3QgZGF5T2ZZZWFyID0gTWF0aC5mbG9vcigoTnVtYmVyKGRhdGUpIC0gTnVtYmVyKGRlYzMxKSkgLyBvbmVEYXkpO1xuXG4gICAgY29uc3QgemVuaXRoID0gOTAuODMzMzMzMzMzMzMzMzM7XG4gICAgY29uc3QgRDJSID0gTWF0aC5QSSAvIDE4MDtcbiAgICBjb25zdCBSMkQgPSAxODAgLyBNYXRoLlBJO1xuXG4gICAgLy8gY29udmVydCB0aGUgbG9uZ2l0dWRlIHRvIGhvdXIgdmFsdWUgYW5kIGNhbGN1bGF0ZSBhbiBhcHByb3hpbWF0ZSB0aW1lXG4gICAgY29uc3QgbG5Ib3VyID0gbG9uZ2l0dWRlIC8gMTU7XG5cbiAgICBmdW5jdGlvbiBnZXRUaW1lKGlzU3VucmlzZTogYm9vbGVhbikge1xuICAgICAgICBjb25zdCB0ID0gZGF5T2ZZZWFyICsgKCgoaXNTdW5yaXNlID8gNiA6IDE4KSAtIGxuSG91cikgLyAyNCk7XG5cbiAgICAgICAgLy8gY2FsY3VsYXRlIHRoZSBTdW4ncyBtZWFuIGFub21hbHlcbiAgICAgICAgY29uc3QgTSA9ICgwLjk4NTYgKiB0KSAtIDMuMjg5O1xuXG4gICAgICAgIC8vIGNhbGN1bGF0ZSB0aGUgU3VuJ3MgdHJ1ZSBsb25naXR1ZGVcbiAgICAgICAgbGV0IEwgPSBNICsgKDEuOTE2ICogTWF0aC5zaW4oTSAqIEQyUikpICsgKDAuMDIwICogTWF0aC5zaW4oMiAqIE0gKiBEMlIpKSArIDI4Mi42MzQ7XG4gICAgICAgIGlmIChMID4gMzYwKSB7XG4gICAgICAgICAgICBMID0gTCAtIDM2MDtcbiAgICAgICAgfSBlbHNlIGlmIChMIDwgMCkge1xuICAgICAgICAgICAgTCA9IEwgKyAzNjA7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBjYWxjdWxhdGUgdGhlIFN1bidzIHJpZ2h0IGFzY2Vuc2lvblxuICAgICAgICBsZXQgUkEgPSBSMkQgKiBNYXRoLmF0YW4oMC45MTc2NCAqIE1hdGgudGFuKEwgKiBEMlIpKTtcbiAgICAgICAgaWYgKFJBID4gMzYwKSB7XG4gICAgICAgICAgICBSQSA9IFJBIC0gMzYwO1xuICAgICAgICB9IGVsc2UgaWYgKFJBIDwgMCkge1xuICAgICAgICAgICAgUkEgPSBSQSArIDM2MDtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHJpZ2h0IGFzY2Vuc2lvbiB2YWx1ZSBuZWVkcyB0byBiZSBpbiB0aGUgc2FtZSBxdWFcbiAgICAgICAgY29uc3QgTHF1YWRyYW50ID0gKE1hdGguZmxvb3IoTCAvICg5MCkpKSAqIDkwO1xuICAgICAgICBjb25zdCBSQXF1YWRyYW50ID0gKE1hdGguZmxvb3IoUkEgLyA5MCkpICogOTA7XG4gICAgICAgIFJBID0gUkEgKyAoTHF1YWRyYW50IC0gUkFxdWFkcmFudCk7XG5cbiAgICAgICAgLy8gcmlnaHQgYXNjZW5zaW9uIHZhbHVlIG5lZWRzIHRvIGJlIGNvbnZlcnRlZCBpbnRvIGhvdXJzXG4gICAgICAgIFJBID0gUkEgLyAxNTtcblxuICAgICAgICAvLyBjYWxjdWxhdGUgdGhlIFN1bidzIGRlY2xpbmF0aW9uXG4gICAgICAgIGNvbnN0IHNpbkRlYyA9IDAuMzk3ODIgKiBNYXRoLnNpbihMICogRDJSKTtcbiAgICAgICAgY29uc3QgY29zRGVjID0gTWF0aC5jb3MoTWF0aC5hc2luKHNpbkRlYykpO1xuXG4gICAgICAgIC8vIGNhbGN1bGF0ZSB0aGUgU3VuJ3MgbG9jYWwgaG91ciBhbmdsZVxuICAgICAgICBjb25zdCBjb3NIID0gKE1hdGguY29zKHplbml0aCAqIEQyUikgLSAoc2luRGVjICogTWF0aC5zaW4obGF0aXR1ZGUgKiBEMlIpKSkgLyAoY29zRGVjICogTWF0aC5jb3MobGF0aXR1ZGUgKiBEMlIpKTtcbiAgICAgICAgaWYgKGNvc0ggPiAxKSB7XG4gICAgICAgICAgICAvLyBhbHdheXMgbmlnaHRcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgYWx3YXlzRGF5OiBmYWxzZSxcbiAgICAgICAgICAgICAgICBhbHdheXNOaWdodDogdHJ1ZSxcbiAgICAgICAgICAgICAgICB0aW1lOiAwLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBlbHNlIGlmIChjb3NIIDwgLTEpIHtcbiAgICAgICAgICAgIC8vIGFsd2F5cyBkYXlcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgYWx3YXlzRGF5OiB0cnVlLFxuICAgICAgICAgICAgICAgIGFsd2F5c05pZ2h0OiBmYWxzZSxcbiAgICAgICAgICAgICAgICB0aW1lOiAwLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IEggPSAoaXNTdW5yaXNlID8gKDM2MCAtIFIyRCAqIE1hdGguYWNvcyhjb3NIKSkgOiAoUjJEICogTWF0aC5hY29zKGNvc0gpKSkgLyAxNTtcblxuICAgICAgICAvLyBjYWxjdWxhdGUgbG9jYWwgbWVhbiB0aW1lIG9mIHJpc2luZy9zZXR0aW5nXG4gICAgICAgIGNvbnN0IFQgPSBIICsgUkEgLSAoMC4wNjU3MSAqIHQpIC0gNi42MjI7XG5cbiAgICAgICAgLy8gYWRqdXN0IGJhY2sgdG8gVVRDXG4gICAgICAgIGxldCBVVCA9IFQgLSBsbkhvdXI7XG4gICAgICAgIGlmIChVVCA+IDI0KSB7XG4gICAgICAgICAgICBVVCA9IFVUIC0gMjQ7XG4gICAgICAgIH0gZWxzZSBpZiAoVVQgPCAwKSB7XG4gICAgICAgICAgICBVVCA9IFVUICsgMjQ7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBjb252ZXJ0IHRvIG1pbGxpc2Vjb25kc1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgYWx3YXlzRGF5OiBmYWxzZSxcbiAgICAgICAgICAgIGFsd2F5c05pZ2h0OiBmYWxzZSxcbiAgICAgICAgICAgIHRpbWU6IFVUICogZ2V0RHVyYXRpb24oe2hvdXJzOiAxfSksXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc3Qgc3VucmlzZVRpbWUgPSBnZXRUaW1lKHRydWUpO1xuICAgIGNvbnN0IHN1bnNldFRpbWUgPSBnZXRUaW1lKGZhbHNlKTtcblxuICAgIGlmIChzdW5yaXNlVGltZS5hbHdheXNEYXkgfHwgc3Vuc2V0VGltZS5hbHdheXNEYXkpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGFsd2F5c0RheTogdHJ1ZVxuICAgICAgICB9O1xuICAgIH0gZWxzZSBpZiAoc3VucmlzZVRpbWUuYWx3YXlzTmlnaHQgfHwgc3Vuc2V0VGltZS5hbHdheXNOaWdodCkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgYWx3YXlzTmlnaHQ6IHRydWVcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBzdW5yaXNlVGltZTogc3VucmlzZVRpbWUudGltZSxcbiAgICAgICAgc3Vuc2V0VGltZTogc3Vuc2V0VGltZS50aW1lXG4gICAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzTmlnaHRBdExvY2F0aW9uKFxuICAgIGRhdGU6IERhdGUsXG4gICAgbGF0aXR1ZGU6IG51bWJlcixcbiAgICBsb25naXR1ZGU6IG51bWJlcixcbikge1xuICAgIGNvbnN0IHRpbWUgPSBnZXRTdW5zZXRTdW5yaXNlVVRDVGltZShkYXRlLCBsYXRpdHVkZSwgbG9uZ2l0dWRlKTtcblxuICAgIGlmICh0aW1lLmFsd2F5c0RheSkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfSBlbHNlIGlmICh0aW1lLmFsd2F5c05pZ2h0KSB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIGNvbnN0IHN1bnJpc2VUaW1lID0gdGltZS5zdW5yaXNlVGltZTtcbiAgICBjb25zdCBzdW5zZXRUaW1lID0gdGltZS5zdW5zZXRUaW1lO1xuICAgIGNvbnN0IGN1cnJlbnRUaW1lID0gKFxuICAgICAgICBkYXRlLmdldFVUQ0hvdXJzKCkgKiBnZXREdXJhdGlvbih7aG91cnM6IDF9KSArXG4gICAgICAgIGRhdGUuZ2V0VVRDTWludXRlcygpICogZ2V0RHVyYXRpb24oe21pbnV0ZXM6IDF9KSArXG4gICAgICAgIGRhdGUuZ2V0VVRDU2Vjb25kcygpICogZ2V0RHVyYXRpb24oe3NlY29uZHM6IDF9KVxuICAgICk7XG5cbiAgICBpZiAoc3Vuc2V0VGltZSA+IHN1bnJpc2VUaW1lKSB7XG4gICAgICAgIHJldHVybiAoY3VycmVudFRpbWUgPiBzdW5zZXRUaW1lKSB8fCAoY3VycmVudFRpbWUgPCBzdW5yaXNlVGltZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIChjdXJyZW50VGltZSA+IHN1bnNldFRpbWUpICYmIChjdXJyZW50VGltZSA8IHN1bnJpc2VUaW1lKTtcbiAgICB9XG59XG4iLCJpbXBvcnQge2xvZ1dhcm59IGZyb20gJy4vbG9nJztcbmltcG9ydCB7dGhyb3R0bGV9IGZyb20gJy4vdGhyb3R0bGUnO1xuaW1wb3J0IHtmb3JFYWNofSBmcm9tICcuLi8uLi91dGlscy9hcnJheSc7XG5pbXBvcnQge2dldER1cmF0aW9ufSBmcm9tICcuLi8uLi91dGlscy90aW1lJztcblxuaW50ZXJmYWNlIENyZWF0ZU5vZGVBc2FwUGFyYW1zIHtcbiAgICBzZWxlY3ROb2RlOiAoKSA9PiBIVE1MRWxlbWVudDtcbiAgICBjcmVhdGVOb2RlOiAodGFyZ2V0OiBIVE1MRWxlbWVudCkgPT4gdm9pZDtcbiAgICB1cGRhdGVOb2RlOiAoZXhpc3Rpbmc6IEhUTUxFbGVtZW50KSA9PiB2b2lkO1xuICAgIHNlbGVjdFRhcmdldDogKCkgPT4gSFRNTEVsZW1lbnQ7XG4gICAgY3JlYXRlVGFyZ2V0OiAoKSA9PiBIVE1MRWxlbWVudDtcbiAgICBpc1RhcmdldE11dGF0aW9uOiAobXV0YXRpb246IE11dGF0aW9uUmVjb3JkKSA9PiBib29sZWFuO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlTm9kZUFzYXAoe1xuICAgIHNlbGVjdE5vZGUsXG4gICAgY3JlYXRlTm9kZSxcbiAgICB1cGRhdGVOb2RlLFxuICAgIHNlbGVjdFRhcmdldCxcbiAgICBjcmVhdGVUYXJnZXQsXG4gICAgaXNUYXJnZXRNdXRhdGlvbixcbn06IENyZWF0ZU5vZGVBc2FwUGFyYW1zKSB7XG4gICAgY29uc3QgdGFyZ2V0ID0gc2VsZWN0VGFyZ2V0KCk7XG4gICAgaWYgKHRhcmdldCkge1xuICAgICAgICBjb25zdCBwcmV2ID0gc2VsZWN0Tm9kZSgpO1xuICAgICAgICBpZiAocHJldikge1xuICAgICAgICAgICAgdXBkYXRlTm9kZShwcmV2KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNyZWF0ZU5vZGUodGFyZ2V0KTtcbiAgICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnN0IG9ic2VydmVyID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIoKG11dGF0aW9ucykgPT4ge1xuICAgICAgICAgICAgY29uc3QgbXV0YXRpb24gPSBtdXRhdGlvbnMuZmluZChpc1RhcmdldE11dGF0aW9uKTtcbiAgICAgICAgICAgIGlmIChtdXRhdGlvbikge1xuICAgICAgICAgICAgICAgIHVuc3Vic2NyaWJlKCk7XG4gICAgICAgICAgICAgICAgY29uc3QgdGFyZ2V0ID0gc2VsZWN0VGFyZ2V0KCk7XG4gICAgICAgICAgICAgICAgc2VsZWN0Tm9kZSgpIHx8IGNyZWF0ZU5vZGUodGFyZ2V0KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc3QgcmVhZHkgPSAoKSA9PiB7XG4gICAgICAgICAgICBpZiAoZG9jdW1lbnQucmVhZHlTdGF0ZSAhPT0gJ2NvbXBsZXRlJykge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdW5zdWJzY3JpYmUoKTtcbiAgICAgICAgICAgIGNvbnN0IHRhcmdldCA9IHNlbGVjdFRhcmdldCgpIHx8IGNyZWF0ZVRhcmdldCgpO1xuICAgICAgICAgICAgc2VsZWN0Tm9kZSgpIHx8IGNyZWF0ZU5vZGUodGFyZ2V0KTtcbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCB1bnN1YnNjcmliZSA9ICgpID0+IHtcbiAgICAgICAgICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3JlYWR5c3RhdGVjaGFuZ2UnLCByZWFkeSk7XG4gICAgICAgICAgICBvYnNlcnZlci5kaXNjb25uZWN0KCk7XG4gICAgICAgIH07XG5cbiAgICAgICAgaWYgKGRvY3VtZW50LnJlYWR5U3RhdGUgPT09ICdjb21wbGV0ZScpIHtcbiAgICAgICAgICAgIHJlYWR5KCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdyZWFkeXN0YXRlY2hhbmdlJywgcmVhZHkpO1xuICAgICAgICAgICAgb2JzZXJ2ZXIub2JzZXJ2ZShkb2N1bWVudCwge2NoaWxkTGlzdDogdHJ1ZSwgc3VidHJlZTogdHJ1ZX0pO1xuICAgICAgICB9XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVtb3ZlTm9kZShub2RlOiBOb2RlKSB7XG4gICAgbm9kZSAmJiBub2RlLnBhcmVudE5vZGUgJiYgbm9kZS5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKG5vZGUpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gd2F0Y2hGb3JOb2RlUG9zaXRpb248VCBleHRlbmRzIE5vZGU+KFxuICAgIG5vZGU6IFQsXG4gICAgbW9kZTogJ3BhcmVudCcgfCAncHJldi1zaWJsaW5nJyxcbiAgICBvblJlc3RvcmUgPSBGdW5jdGlvbi5wcm90b3R5cGUsXG4pIHtcbiAgICBjb25zdCBNQVhfQVRURU1QVFNfQ09VTlQgPSAxMDtcbiAgICBjb25zdCBSRVRSWV9USU1FT1VUID0gZ2V0RHVyYXRpb24oe3NlY29uZHM6IDJ9KTtcbiAgICBjb25zdCBBVFRFTVBUU19JTlRFUlZBTCA9IGdldER1cmF0aW9uKHtzZWNvbmRzOiAxMH0pO1xuICAgIGNvbnN0IHByZXZTaWJsaW5nID0gbm9kZS5wcmV2aW91c1NpYmxpbmc7XG4gICAgbGV0IHBhcmVudCA9IG5vZGUucGFyZW50Tm9kZTtcbiAgICBpZiAoIXBhcmVudCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1VuYWJsZSB0byB3YXRjaCBmb3Igbm9kZSBwb3NpdGlvbjogcGFyZW50IGVsZW1lbnQgbm90IGZvdW5kJyk7XG4gICAgfVxuICAgIGlmIChtb2RlID09PSAncHJldi1zaWJsaW5nJyAmJiAhcHJldlNpYmxpbmcpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbmFibGUgdG8gd2F0Y2ggZm9yIG5vZGUgcG9zaXRpb246IHRoZXJlIGlzIG5vIHByZXZpb3VzIHNpYmxpbmcnKTtcbiAgICB9XG4gICAgbGV0IGF0dGVtcHRzID0gMDtcbiAgICBsZXQgc3RhcnQ6IG51bWJlciA9IG51bGw7XG4gICAgbGV0IHRpbWVvdXRJZDogbnVtYmVyID0gbnVsbDtcbiAgICBjb25zdCByZXN0b3JlID0gdGhyb3R0bGUoKCkgPT4ge1xuICAgICAgICBpZiAodGltZW91dElkKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgYXR0ZW1wdHMrKztcbiAgICAgICAgY29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcbiAgICAgICAgaWYgKHN0YXJ0ID09IG51bGwpIHtcbiAgICAgICAgICAgIHN0YXJ0ID0gbm93O1xuICAgICAgICB9IGVsc2UgaWYgKGF0dGVtcHRzID49IE1BWF9BVFRFTVBUU19DT1VOVCkge1xuICAgICAgICAgICAgaWYgKG5vdyAtIHN0YXJ0IDwgQVRURU1QVFNfSU5URVJWQUwpIHtcbiAgICAgICAgICAgICAgICBsb2dXYXJuKGBOb2RlIHBvc2l0aW9uIHdhdGNoZXIgcGF1c2VkOiByZXRyeSBpbiAke1JFVFJZX1RJTUVPVVR9bXNgLCBub2RlLCBwcmV2U2libGluZyk7XG4gICAgICAgICAgICAgICAgdGltZW91dElkID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHN0YXJ0ID0gbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgYXR0ZW1wdHMgPSAwO1xuICAgICAgICAgICAgICAgICAgICB0aW1lb3V0SWQgPSBudWxsO1xuICAgICAgICAgICAgICAgICAgICByZXN0b3JlKCk7XG4gICAgICAgICAgICAgICAgfSwgUkVUUllfVElNRU9VVCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc3RhcnQgPSBub3c7XG4gICAgICAgICAgICBhdHRlbXB0cyA9IDE7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAobW9kZSA9PT0gJ3BhcmVudCcpIHtcbiAgICAgICAgICAgIGlmIChwcmV2U2libGluZyAmJiBwcmV2U2libGluZy5wYXJlbnROb2RlICE9PSBwYXJlbnQpIHtcbiAgICAgICAgICAgICAgICBsb2dXYXJuKCdVbmFibGUgdG8gcmVzdG9yZSBub2RlIHBvc2l0aW9uOiBzaWJsaW5nIHBhcmVudCBjaGFuZ2VkJywgbm9kZSwgcHJldlNpYmxpbmcsIHBhcmVudCk7XG4gICAgICAgICAgICAgICAgc3RvcCgpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChtb2RlID09PSAncHJldi1zaWJsaW5nJykge1xuICAgICAgICAgICAgaWYgKHByZXZTaWJsaW5nLnBhcmVudE5vZGUgPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIGxvZ1dhcm4oJ1VuYWJsZSB0byByZXN0b3JlIG5vZGUgcG9zaXRpb246IHNpYmxpbmcgd2FzIHJlbW92ZWQnLCBub2RlLCBwcmV2U2libGluZywgcGFyZW50KTtcbiAgICAgICAgICAgICAgICBzdG9wKCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHByZXZTaWJsaW5nLnBhcmVudE5vZGUgIT09IHBhcmVudCkge1xuICAgICAgICAgICAgICAgIGxvZ1dhcm4oJ1N0eWxlIHdhcyBtb3ZlZCB0byBhbm90aGVyIHBhcmVudCcsIG5vZGUsIHByZXZTaWJsaW5nLCBwYXJlbnQpO1xuICAgICAgICAgICAgICAgIHVwZGF0ZVBhcmVudChwcmV2U2libGluZy5wYXJlbnROb2RlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGxvZ1dhcm4oJ1Jlc3RvcmluZyBub2RlIHBvc2l0aW9uJywgbm9kZSwgcHJldlNpYmxpbmcsIHBhcmVudCk7XG4gICAgICAgIHBhcmVudC5pbnNlcnRCZWZvcmUobm9kZSwgcHJldlNpYmxpbmcgPyBwcmV2U2libGluZy5uZXh0U2libGluZyA6IHBhcmVudC5maXJzdENoaWxkKTtcbiAgICAgICAgb2JzZXJ2ZXIudGFrZVJlY29yZHMoKTtcbiAgICAgICAgb25SZXN0b3JlICYmIG9uUmVzdG9yZSgpO1xuICAgIH0pO1xuICAgIGNvbnN0IG9ic2VydmVyID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIoKCkgPT4ge1xuICAgICAgICBpZiAoXG4gICAgICAgICAgICAobW9kZSA9PT0gJ3BhcmVudCcgJiYgbm9kZS5wYXJlbnROb2RlICE9PSBwYXJlbnQpIHx8XG4gICAgICAgICAgICAobW9kZSA9PT0gJ3ByZXYtc2libGluZycgJiYgbm9kZS5wcmV2aW91c1NpYmxpbmcgIT09IHByZXZTaWJsaW5nKVxuICAgICAgICApIHtcbiAgICAgICAgICAgIHJlc3RvcmUoKTtcbiAgICAgICAgfVxuICAgIH0pO1xuICAgIGNvbnN0IHJ1biA9ICgpID0+IHtcbiAgICAgICAgb2JzZXJ2ZXIub2JzZXJ2ZShwYXJlbnQsIHtjaGlsZExpc3Q6IHRydWV9KTtcbiAgICB9O1xuICAgIGNvbnN0IHN0b3AgPSAoKSA9PiB7XG4gICAgICAgIGNsZWFyVGltZW91dCh0aW1lb3V0SWQpO1xuICAgICAgICBvYnNlcnZlci5kaXNjb25uZWN0KCk7XG4gICAgICAgIHJlc3RvcmUuY2FuY2VsKCk7XG4gICAgfTtcbiAgICBjb25zdCBza2lwID0gKCkgPT4ge1xuICAgICAgICBvYnNlcnZlci50YWtlUmVjb3JkcygpO1xuICAgIH07XG4gICAgY29uc3QgdXBkYXRlUGFyZW50ID0gKHBhcmVudE5vZGU6IE5vZGUgJiBQYXJlbnROb2RlKSA9PiB7XG4gICAgICAgIHBhcmVudCA9IHBhcmVudE5vZGU7XG4gICAgICAgIHN0b3AoKTtcbiAgICAgICAgcnVuKCk7XG4gICAgfTtcbiAgICBydW4oKTtcbiAgICByZXR1cm4ge3J1biwgc3RvcCwgc2tpcH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpdGVyYXRlU2hhZG93SG9zdHMocm9vdDogTm9kZSwgaXRlcmF0b3I6IChob3N0OiBFbGVtZW50KSA9PiB2b2lkKSB7XG4gICAgaWYgKHJvb3QgPT0gbnVsbCkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHdhbGtlciA9IGRvY3VtZW50LmNyZWF0ZVRyZWVXYWxrZXIoXG4gICAgICAgIHJvb3QsXG4gICAgICAgIE5vZGVGaWx0ZXIuU0hPV19FTEVNRU5ULFxuICAgICAgICB7XG4gICAgICAgICAgICBhY2NlcHROb2RlKG5vZGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gKG5vZGUgYXMgRWxlbWVudCkuc2hhZG93Um9vdCA9PSBudWxsID8gTm9kZUZpbHRlci5GSUxURVJfU0tJUCA6IE5vZGVGaWx0ZXIuRklMVEVSX0FDQ0VQVDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgZmFsc2UsXG4gICAgKTtcbiAgICBmb3IgKFxuICAgICAgICBsZXQgbm9kZSA9ICgocm9vdCBhcyBFbGVtZW50KS5zaGFkb3dSb290ID8gd2Fsa2VyLmN1cnJlbnROb2RlIDogd2Fsa2VyLm5leHROb2RlKCkpIGFzIEVsZW1lbnQ7XG4gICAgICAgIG5vZGUgIT0gbnVsbDtcbiAgICAgICAgbm9kZSA9IHdhbGtlci5uZXh0Tm9kZSgpIGFzIEVsZW1lbnRcbiAgICApIHtcbiAgICAgICAgaXRlcmF0b3Iobm9kZSk7XG4gICAgICAgIGl0ZXJhdGVTaGFkb3dIb3N0cyhub2RlLnNoYWRvd1Jvb3QsIGl0ZXJhdG9yKTtcbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0RPTVJlYWR5KCkge1xuICAgIHJldHVybiBkb2N1bWVudC5yZWFkeVN0YXRlID09PSAnY29tcGxldGUnIHx8IGRvY3VtZW50LnJlYWR5U3RhdGUgPT09ICdpbnRlcmFjdGl2ZSc7XG59XG5cbmNvbnN0IHJlYWR5U3RhdGVMaXN0ZW5lcnMgPSBuZXcgU2V0PCgpID0+IHZvaWQ+KCk7XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRET01SZWFkeUxpc3RlbmVyKGxpc3RlbmVyOiAoKSA9PiB2b2lkKSB7XG4gICAgcmVhZHlTdGF0ZUxpc3RlbmVycy5hZGQobGlzdGVuZXIpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVtb3ZlRE9NUmVhZHlMaXN0ZW5lcihsaXN0ZW5lcjogKCkgPT4gdm9pZCkge1xuICAgIHJlYWR5U3RhdGVMaXN0ZW5lcnMuZGVsZXRlKGxpc3RlbmVyKTtcbn1cblxuaWYgKCFpc0RPTVJlYWR5KCkpIHtcbiAgICBjb25zdCBvblJlYWR5U3RhdGVDaGFuZ2UgPSAoKSA9PiB7XG4gICAgICAgIGlmIChpc0RPTVJlYWR5KCkpIHtcbiAgICAgICAgICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3JlYWR5c3RhdGVjaGFuZ2UnLCBvblJlYWR5U3RhdGVDaGFuZ2UpO1xuICAgICAgICAgICAgcmVhZHlTdGF0ZUxpc3RlbmVycy5mb3JFYWNoKChsaXN0ZW5lcikgPT4gbGlzdGVuZXIoKSk7XG4gICAgICAgICAgICByZWFkeVN0YXRlTGlzdGVuZXJzLmNsZWFyKCk7XG4gICAgICAgIH1cbiAgICB9O1xuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ3JlYWR5c3RhdGVjaGFuZ2UnLCBvblJlYWR5U3RhdGVDaGFuZ2UpO1xufVxuXG5jb25zdCBIVUdFX01VVEFUSU9OU19DT1VOVCA9IDEwMDA7XG5cbmZ1bmN0aW9uIGlzSHVnZU11dGF0aW9uKG11dGF0aW9uczogTXV0YXRpb25SZWNvcmRbXSkge1xuICAgIGlmIChtdXRhdGlvbnMubGVuZ3RoID4gSFVHRV9NVVRBVElPTlNfQ09VTlQpIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgbGV0IGFkZGVkTm9kZXNDb3VudCA9IDA7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBtdXRhdGlvbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgYWRkZWROb2Rlc0NvdW50ICs9IG11dGF0aW9uc1tpXS5hZGRlZE5vZGVzLmxlbmd0aDtcbiAgICAgICAgaWYgKGFkZGVkTm9kZXNDb3VudCA+IEhVR0VfTVVUQVRJT05TX0NPVU5UKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBmYWxzZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBFbGVtZW50c1RyZWVPcGVyYXRpb25zIHtcbiAgICBhZGRpdGlvbnM6IFNldDxFbGVtZW50PjtcbiAgICBtb3ZlczogU2V0PEVsZW1lbnQ+O1xuICAgIGRlbGV0aW9uczogU2V0PEVsZW1lbnQ+O1xufVxuXG5mdW5jdGlvbiBnZXRFbGVtZW50c1RyZWVPcGVyYXRpb25zKG11dGF0aW9uczogTXV0YXRpb25SZWNvcmRbXSk6IEVsZW1lbnRzVHJlZU9wZXJhdGlvbnMge1xuICAgIGNvbnN0IGFkZGl0aW9ucyA9IG5ldyBTZXQ8RWxlbWVudD4oKTtcbiAgICBjb25zdCBkZWxldGlvbnMgPSBuZXcgU2V0PEVsZW1lbnQ+KCk7XG4gICAgY29uc3QgbW92ZXMgPSBuZXcgU2V0PEVsZW1lbnQ+KCk7XG4gICAgbXV0YXRpb25zLmZvckVhY2goKG0pID0+IHtcbiAgICAgICAgZm9yRWFjaChtLmFkZGVkTm9kZXMsIChuKSA9PiB7XG4gICAgICAgICAgICBpZiAobiBpbnN0YW5jZW9mIEVsZW1lbnQgJiYgbi5pc0Nvbm5lY3RlZCkge1xuICAgICAgICAgICAgICAgIGFkZGl0aW9ucy5hZGQobik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBmb3JFYWNoKG0ucmVtb3ZlZE5vZGVzLCAobikgPT4ge1xuICAgICAgICAgICAgaWYgKG4gaW5zdGFuY2VvZiBFbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgaWYgKG4uaXNDb25uZWN0ZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgbW92ZXMuYWRkKG4pO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGRlbGV0aW9ucy5hZGQobik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9KTtcbiAgICBtb3Zlcy5mb3JFYWNoKChuKSA9PiBhZGRpdGlvbnMuZGVsZXRlKG4pKTtcblxuICAgIGNvbnN0IGR1cGxpY2F0ZUFkZGl0aW9ucyA9IFtdIGFzIEVsZW1lbnRbXTtcbiAgICBjb25zdCBkdXBsaWNhdGVEZWxldGlvbnMgPSBbXSBhcyBFbGVtZW50W107XG4gICAgYWRkaXRpb25zLmZvckVhY2goKG5vZGUpID0+IHtcbiAgICAgICAgaWYgKGFkZGl0aW9ucy5oYXMobm9kZS5wYXJlbnRFbGVtZW50KSkge1xuICAgICAgICAgICAgZHVwbGljYXRlQWRkaXRpb25zLnB1c2gobm9kZSk7XG4gICAgICAgIH1cbiAgICB9KTtcbiAgICBkZWxldGlvbnMuZm9yRWFjaCgobm9kZSkgPT4ge1xuICAgICAgICBpZiAoZGVsZXRpb25zLmhhcyhub2RlLnBhcmVudEVsZW1lbnQpKSB7XG4gICAgICAgICAgICBkdXBsaWNhdGVEZWxldGlvbnMucHVzaChub2RlKTtcbiAgICAgICAgfVxuICAgIH0pO1xuICAgIGR1cGxpY2F0ZUFkZGl0aW9ucy5mb3JFYWNoKChub2RlKSA9PiBhZGRpdGlvbnMuZGVsZXRlKG5vZGUpKTtcbiAgICBkdXBsaWNhdGVEZWxldGlvbnMuZm9yRWFjaCgobm9kZSkgPT4gZGVsZXRpb25zLmRlbGV0ZShub2RlKSk7XG5cbiAgICByZXR1cm4ge2FkZGl0aW9ucywgbW92ZXMsIGRlbGV0aW9uc307XG59XG5cbmludGVyZmFjZSBPcHRpbWl6ZWRUcmVlT2JzZXJ2ZXJDYWxsYmFja3Mge1xuICAgIG9uTWlub3JNdXRhdGlvbnM6IChvcGVyYXRpb25zOiBFbGVtZW50c1RyZWVPcGVyYXRpb25zKSA9PiB2b2lkO1xuICAgIG9uSHVnZU11dGF0aW9uczogKHJvb3Q6IERvY3VtZW50IHwgU2hhZG93Um9vdCkgPT4gdm9pZDtcbn1cblxuY29uc3Qgb3B0aW1pemVkVHJlZU9ic2VydmVycyA9IG5ldyBNYXA8Tm9kZSwgTXV0YXRpb25PYnNlcnZlcj4oKTtcbmNvbnN0IG9wdGltaXplZFRyZWVDYWxsYmFja3MgPSBuZXcgV2Vha01hcDxNdXRhdGlvbk9ic2VydmVyLCBTZXQ8T3B0aW1pemVkVHJlZU9ic2VydmVyQ2FsbGJhY2tzPj4oKTtcblxuLy8gVE9ETzogVXNlIGEgc2luZ2xlIGZ1bmN0aW9uIHRvIG9ic2VydmUgYWxsIHNoYWRvdyByb290cy5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVPcHRpbWl6ZWRUcmVlT2JzZXJ2ZXIocm9vdDogRG9jdW1lbnQgfCBTaGFkb3dSb290LCBjYWxsYmFja3M6IE9wdGltaXplZFRyZWVPYnNlcnZlckNhbGxiYWNrcykge1xuICAgIGxldCBvYnNlcnZlcjogTXV0YXRpb25PYnNlcnZlcjtcbiAgICBsZXQgb2JzZXJ2ZXJDYWxsYmFja3M6IFNldDxPcHRpbWl6ZWRUcmVlT2JzZXJ2ZXJDYWxsYmFja3M+O1xuICAgIGxldCBkb21SZWFkeUxpc3RlbmVyOiAoKSA9PiB2b2lkO1xuXG4gICAgaWYgKG9wdGltaXplZFRyZWVPYnNlcnZlcnMuaGFzKHJvb3QpKSB7XG4gICAgICAgIG9ic2VydmVyID0gb3B0aW1pemVkVHJlZU9ic2VydmVycy5nZXQocm9vdCk7XG4gICAgICAgIG9ic2VydmVyQ2FsbGJhY2tzID0gb3B0aW1pemVkVHJlZUNhbGxiYWNrcy5nZXQob2JzZXJ2ZXIpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIGxldCBoYWRIdWdlTXV0YXRpb25zQmVmb3JlID0gZmFsc2U7XG4gICAgICAgIGxldCBzdWJzY3JpYmVkRm9yUmVhZHlTdGF0ZSA9IGZhbHNlO1xuXG4gICAgICAgIG9ic2VydmVyID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIoKG11dGF0aW9uczogTXV0YXRpb25SZWNvcmRbXSkgPT4ge1xuICAgICAgICAgICAgaWYgKGlzSHVnZU11dGF0aW9uKG11dGF0aW9ucykpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWhhZEh1Z2VNdXRhdGlvbnNCZWZvcmUgfHwgaXNET01SZWFkeSgpKSB7XG4gICAgICAgICAgICAgICAgICAgIG9ic2VydmVyQ2FsbGJhY2tzLmZvckVhY2goKHtvbkh1Z2VNdXRhdGlvbnN9KSA9PiBvbkh1Z2VNdXRhdGlvbnMocm9vdCkpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICghc3Vic2NyaWJlZEZvclJlYWR5U3RhdGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRvbVJlYWR5TGlzdGVuZXIgPSAoKSA9PiBvYnNlcnZlckNhbGxiYWNrcy5mb3JFYWNoKCh7b25IdWdlTXV0YXRpb25zfSkgPT4gb25IdWdlTXV0YXRpb25zKHJvb3QpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFkZERPTVJlYWR5TGlzdGVuZXIoZG9tUmVhZHlMaXN0ZW5lcik7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdWJzY3JpYmVkRm9yUmVhZHlTdGF0ZSA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaGFkSHVnZU11dGF0aW9uc0JlZm9yZSA9IHRydWU7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbnN0IGVsZW1lbnRzT3BlcmF0aW9ucyA9IGdldEVsZW1lbnRzVHJlZU9wZXJhdGlvbnMobXV0YXRpb25zKTtcbiAgICAgICAgICAgICAgICBvYnNlcnZlckNhbGxiYWNrcy5mb3JFYWNoKCh7b25NaW5vck11dGF0aW9uc30pID0+IG9uTWlub3JNdXRhdGlvbnMoZWxlbWVudHNPcGVyYXRpb25zKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBvYnNlcnZlci5vYnNlcnZlKHJvb3QsIHtjaGlsZExpc3Q6IHRydWUsIHN1YnRyZWU6IHRydWV9KTtcbiAgICAgICAgb3B0aW1pemVkVHJlZU9ic2VydmVycy5zZXQocm9vdCwgb2JzZXJ2ZXIpO1xuICAgICAgICBvYnNlcnZlckNhbGxiYWNrcyA9IG5ldyBTZXQoKTtcbiAgICAgICAgb3B0aW1pemVkVHJlZUNhbGxiYWNrcy5zZXQob2JzZXJ2ZXIsIG9ic2VydmVyQ2FsbGJhY2tzKTtcbiAgICB9XG5cbiAgICBvYnNlcnZlckNhbGxiYWNrcy5hZGQoY2FsbGJhY2tzKTtcblxuICAgIHJldHVybiB7XG4gICAgICAgIGRpc2Nvbm5lY3QoKSB7XG4gICAgICAgICAgICBvYnNlcnZlckNhbGxiYWNrcy5kZWxldGUoY2FsbGJhY2tzKTtcbiAgICAgICAgICAgIGlmIChkb21SZWFkeUxpc3RlbmVyKSB7XG4gICAgICAgICAgICAgICAgcmVtb3ZlRE9NUmVhZHlMaXN0ZW5lcihkb21SZWFkeUxpc3RlbmVyKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChvYnNlcnZlckNhbGxiYWNrcy5zaXplID09PSAwKSB7XG4gICAgICAgICAgICAgICAgb2JzZXJ2ZXIuZGlzY29ubmVjdCgpO1xuICAgICAgICAgICAgICAgIG9wdGltaXplZFRyZWVDYWxsYmFja3MuZGVsZXRlKG9ic2VydmVyKTtcbiAgICAgICAgICAgICAgICBvcHRpbWl6ZWRUcmVlT2JzZXJ2ZXJzLmRlbGV0ZShyb290KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICB9O1xufVxuIiwiaW1wb3J0IHtjcmVhdGVOb2RlQXNhcCwgcmVtb3ZlTm9kZX0gZnJvbSAnLi91dGlscy9kb20nO1xuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlT3JVcGRhdGVTdHlsZShjc3M6IHN0cmluZykge1xuICAgIGNyZWF0ZU5vZGVBc2FwKHtcbiAgICAgICAgc2VsZWN0Tm9kZTogKCkgPT4gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2RhcmstcmVhZGVyLXN0eWxlJyksXG4gICAgICAgIGNyZWF0ZU5vZGU6ICh0YXJnZXQpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHN0eWxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3R5bGUnKTtcbiAgICAgICAgICAgIHN0eWxlLmlkID0gJ2RhcmstcmVhZGVyLXN0eWxlJztcbiAgICAgICAgICAgIHN0eWxlLnR5cGUgPSAndGV4dC9jc3MnO1xuICAgICAgICAgICAgc3R5bGUudGV4dENvbnRlbnQgPSBjc3M7XG4gICAgICAgICAgICB0YXJnZXQuYXBwZW5kQ2hpbGQoc3R5bGUpO1xuICAgICAgICB9LFxuICAgICAgICB1cGRhdGVOb2RlOiAoZXhpc3RpbmcpID0+IHtcbiAgICAgICAgICAgIGlmIChjc3MucmVwbGFjZSgvXlxccysvZ20sICcnKSAhPT0gZXhpc3RpbmcudGV4dENvbnRlbnQucmVwbGFjZSgvXlxccysvZ20sICcnKSkge1xuICAgICAgICAgICAgICAgIGV4aXN0aW5nLnRleHRDb250ZW50ID0gY3NzO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBzZWxlY3RUYXJnZXQ6ICgpID0+IGRvY3VtZW50LmhlYWQsXG4gICAgICAgIGNyZWF0ZVRhcmdldDogKCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgaGVhZCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2hlYWQnKTtcbiAgICAgICAgICAgIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5pbnNlcnRCZWZvcmUoaGVhZCwgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LmZpcnN0RWxlbWVudENoaWxkKTtcbiAgICAgICAgICAgIHJldHVybiBoZWFkO1xuICAgICAgICB9LFxuICAgICAgICBpc1RhcmdldE11dGF0aW9uOiAobXV0YXRpb24pID0+IG11dGF0aW9uLnRhcmdldC5ub2RlTmFtZS50b0xvd2VyQ2FzZSgpID09PSAnaGVhZCcsXG4gICAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZW1vdmVTdHlsZSgpIHtcbiAgICByZW1vdmVOb2RlKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdkYXJrLXJlYWRlci1zdHlsZScpKTtcbn1cbiIsImltcG9ydCB7Y3JlYXRlTm9kZUFzYXAsIHJlbW92ZU5vZGV9IGZyb20gJy4vdXRpbHMvZG9tJztcblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZU9yVXBkYXRlU1ZHRmlsdGVyKHN2Z01hdHJpeDogc3RyaW5nLCBzdmdSZXZlcnNlTWF0cml4OiBzdHJpbmcpIHtcbiAgICBjcmVhdGVOb2RlQXNhcCh7XG4gICAgICAgIHNlbGVjdE5vZGU6ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdkYXJrLXJlYWRlci1zdmcnKSxcbiAgICAgICAgY3JlYXRlTm9kZTogKHRhcmdldCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgU1ZHX05TID0gJ2h0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnJztcbiAgICAgICAgICAgIGNvbnN0IGNyZWF0ZU1hdHJpeEZpbHRlciA9IChpZDogc3RyaW5nLCBtYXRyaXg6IHN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGZpbHRlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUyhTVkdfTlMsICdmaWx0ZXInKTtcbiAgICAgICAgICAgICAgICBmaWx0ZXIuaWQgPSBpZDtcbiAgICAgICAgICAgICAgICBmaWx0ZXIuc3R5bGUuY29sb3JJbnRlcnBvbGF0aW9uRmlsdGVycyA9ICdzUkdCJztcblxuICAgICAgICAgICAgICAgIC8vIEZpeCBkaXNwbGF5aW5nIGR5bmFtaWMgY29udGVudCBodHRwczovL2J1Z3MuY2hyb21pdW0ub3JnL3AvY2hyb21pdW0vaXNzdWVzL2RldGFpbD9pZD02NDc0MzdcbiAgICAgICAgICAgICAgICBmaWx0ZXIuc2V0QXR0cmlidXRlKCd4JywgJzAnKTtcbiAgICAgICAgICAgICAgICBmaWx0ZXIuc2V0QXR0cmlidXRlKCd5JywgJzAnKTtcbiAgICAgICAgICAgICAgICBmaWx0ZXIuc2V0QXR0cmlidXRlKCd3aWR0aCcsICc5OTk5OScpO1xuICAgICAgICAgICAgICAgIGZpbHRlci5zZXRBdHRyaWJ1dGUoJ2hlaWdodCcsICc5OTk5OScpO1xuXG4gICAgICAgICAgICAgICAgZmlsdGVyLmFwcGVuZENoaWxkKGNyZWF0ZUNvbG9yTWF0cml4KG1hdHJpeCkpO1xuICAgICAgICAgICAgICAgIHJldHVybiBmaWx0ZXI7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgY29uc3QgY3JlYXRlQ29sb3JNYXRyaXggPSAobWF0cml4OiBzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBjb2xvck1hdHJpeCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUyhTVkdfTlMsICdmZUNvbG9yTWF0cml4Jyk7XG4gICAgICAgICAgICAgICAgY29sb3JNYXRyaXguc2V0QXR0cmlidXRlKCd0eXBlJywgJ21hdHJpeCcpO1xuICAgICAgICAgICAgICAgIGNvbG9yTWF0cml4LnNldEF0dHJpYnV0ZSgndmFsdWVzJywgbWF0cml4KTtcbiAgICAgICAgICAgICAgICByZXR1cm4gY29sb3JNYXRyaXg7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgY29uc3Qgc3ZnID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKFNWR19OUywgJ3N2ZycpO1xuICAgICAgICAgICAgc3ZnLmlkID0gJ2RhcmstcmVhZGVyLXN2Zyc7XG4gICAgICAgICAgICBzdmcuc3R5bGUuaGVpZ2h0ID0gJzAnO1xuICAgICAgICAgICAgc3ZnLnN0eWxlLndpZHRoID0gJzAnO1xuICAgICAgICAgICAgc3ZnLmFwcGVuZENoaWxkKGNyZWF0ZU1hdHJpeEZpbHRlcignZGFyay1yZWFkZXItZmlsdGVyJywgc3ZnTWF0cml4KSk7XG4gICAgICAgICAgICBzdmcuYXBwZW5kQ2hpbGQoY3JlYXRlTWF0cml4RmlsdGVyKCdkYXJrLXJlYWRlci1yZXZlcnNlLWZpbHRlcicsIHN2Z1JldmVyc2VNYXRyaXgpKTtcbiAgICAgICAgICAgIHRhcmdldC5hcHBlbmRDaGlsZChzdmcpO1xuICAgICAgICB9LFxuICAgICAgICB1cGRhdGVOb2RlOiAoZXhpc3RpbmcpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGV4aXN0aW5nTWF0cml4ID0gZXhpc3RpbmcuZmlyc3RDaGlsZC5maXJzdENoaWxkIGFzIFNWR0ZFQ29sb3JNYXRyaXhFbGVtZW50O1xuICAgICAgICAgICAgaWYgKGV4aXN0aW5nTWF0cml4LmdldEF0dHJpYnV0ZSgndmFsdWVzJykgIT09IHN2Z01hdHJpeCkge1xuICAgICAgICAgICAgICAgIGV4aXN0aW5nTWF0cml4LnNldEF0dHJpYnV0ZSgndmFsdWVzJywgc3ZnTWF0cml4KTtcblxuICAgICAgICAgICAgICAgIC8vIEZpeCBub3QgdHJpZ2dlcmluZyByZXBhaW50XG4gICAgICAgICAgICAgICAgY29uc3Qgc3R5bGUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZGFyay1yZWFkZXItc3R5bGUnKTtcbiAgICAgICAgICAgICAgICBjb25zdCBjc3MgPSBzdHlsZS50ZXh0Q29udGVudDtcbiAgICAgICAgICAgICAgICBzdHlsZS50ZXh0Q29udGVudCA9ICcnO1xuICAgICAgICAgICAgICAgIHN0eWxlLnRleHRDb250ZW50ID0gY3NzO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBzZWxlY3RUYXJnZXQ6ICgpID0+IGRvY3VtZW50LmhlYWQsXG4gICAgICAgIGNyZWF0ZVRhcmdldDogKCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgaGVhZCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2hlYWQnKTtcbiAgICAgICAgICAgIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5pbnNlcnRCZWZvcmUoaGVhZCwgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LmZpcnN0RWxlbWVudENoaWxkKTtcbiAgICAgICAgICAgIHJldHVybiBoZWFkO1xuICAgICAgICB9LFxuICAgICAgICBpc1RhcmdldE11dGF0aW9uOiAobXV0YXRpb24pID0+IG11dGF0aW9uLnRhcmdldC5ub2RlTmFtZS50b0xvd2VyQ2FzZSgpID09PSAnaGVhZCcsXG4gICAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZW1vdmVTVkdGaWx0ZXIoKSB7XG4gICAgcmVtb3ZlTm9kZShkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZGFyay1yZWFkZXItc3ZnJykpO1xufVxuIiwiZnVuY3Rpb24gZml4QmFzZVVSTCgkdXJsOiBzdHJpbmcpIHtcbiAgICBjb25zdCBhID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpO1xuICAgIGEuaHJlZiA9ICR1cmw7XG4gICAgcmV0dXJuIGEuaHJlZjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlVVJMKCR1cmw6IHN0cmluZywgJGJhc2U6IHN0cmluZyA9IG51bGwpIHtcbiAgICBpZiAoJGJhc2UpIHtcbiAgICAgICAgJGJhc2UgPSBmaXhCYXNlVVJMKCRiYXNlKTtcbiAgICAgICAgcmV0dXJuIG5ldyBVUkwoJHVybCwgJGJhc2UpO1xuICAgIH1cbiAgICAkdXJsID0gZml4QmFzZVVSTCgkdXJsKTtcbiAgICByZXR1cm4gbmV3IFVSTCgkdXJsKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEFic29sdXRlVVJMKCRiYXNlOiBzdHJpbmcsICRyZWxhdGl2ZTogc3RyaW5nKSB7XG4gICAgaWYgKCRyZWxhdGl2ZS5tYXRjaCgvXmRhdGFcXDovKSkge1xuICAgICAgICByZXR1cm4gJHJlbGF0aXZlO1xuICAgIH1cblxuICAgIGNvbnN0IGIgPSBwYXJzZVVSTCgkYmFzZSk7XG4gICAgY29uc3QgYSA9IHBhcnNlVVJMKCRyZWxhdGl2ZSwgYi5ocmVmKTtcbiAgICByZXR1cm4gYS5ocmVmO1xufVxuIiwiaW1wb3J0IHtmb3JFYWNofSBmcm9tICcuLi8uLi91dGlscy9hcnJheSc7XG5pbXBvcnQge3BhcnNlVVJMLCBnZXRBYnNvbHV0ZVVSTH0gZnJvbSAnLi91cmwnO1xuaW1wb3J0IHtsb2dXYXJufSBmcm9tICcuLi91dGlscy9sb2cnO1xuXG5leHBvcnQgZnVuY3Rpb24gaXRlcmF0ZUNTU1J1bGVzKHJ1bGVzOiBDU1NSdWxlTGlzdCwgaXRlcmF0ZTogKHJ1bGU6IENTU1N0eWxlUnVsZSkgPT4gdm9pZCkge1xuICAgIGZvckVhY2gocnVsZXMsIChydWxlKSA9PiB7XG4gICAgICAgIGlmIChydWxlIGluc3RhbmNlb2YgQ1NTTWVkaWFSdWxlKSB7XG4gICAgICAgICAgICBjb25zdCBtZWRpYSA9IEFycmF5LmZyb20ocnVsZS5tZWRpYSk7XG4gICAgICAgICAgICBpZiAobWVkaWEuaW5jbHVkZXMoJ3NjcmVlbicpIHx8IG1lZGlhLmluY2x1ZGVzKCdhbGwnKSB8fCAhKG1lZGlhLmluY2x1ZGVzKCdwcmludCcpIHx8IG1lZGlhLmluY2x1ZGVzKCdzcGVlY2gnKSkpIHtcbiAgICAgICAgICAgICAgICBpdGVyYXRlQ1NTUnVsZXMocnVsZS5jc3NSdWxlcywgaXRlcmF0ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAocnVsZSBpbnN0YW5jZW9mIENTU1N0eWxlUnVsZSkge1xuICAgICAgICAgICAgaXRlcmF0ZShydWxlKTtcbiAgICAgICAgfSBlbHNlIGlmIChydWxlIGluc3RhbmNlb2YgQ1NTSW1wb3J0UnVsZSkge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBpdGVyYXRlQ1NTUnVsZXMocnVsZS5zdHlsZVNoZWV0LmNzc1J1bGVzLCBpdGVyYXRlKTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgICAgIGxvZ1dhcm4oZXJyKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxvZ1dhcm4oYENTU1J1bGUgdHlwZSBub3Qgc3VwcG9ydGVkYCwgcnVsZSk7XG4gICAgICAgIH1cbiAgICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGl0ZXJhdGVDU1NEZWNsYXJhdGlvbnMoc3R5bGU6IENTU1N0eWxlRGVjbGFyYXRpb24sIGl0ZXJhdGU6IChwcm9wZXJ0eTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nKSA9PiB2b2lkKSB7XG4gICAgZm9yRWFjaChzdHlsZSwgKHByb3BlcnR5KSA9PiB7XG4gICAgICAgIGNvbnN0IHZhbHVlID0gc3R5bGUuZ2V0UHJvcGVydHlWYWx1ZShwcm9wZXJ0eSkudHJpbSgpO1xuICAgICAgICBpZiAoIXZhbHVlKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgaXRlcmF0ZShwcm9wZXJ0eSwgdmFsdWUpO1xuICAgIH0pO1xufVxuXG5mdW5jdGlvbiBpc0NTU1ZhcmlhYmxlKHByb3BlcnR5OiBzdHJpbmcpIHtcbiAgICByZXR1cm4gcHJvcGVydHkuc3RhcnRzV2l0aCgnLS0nKSAmJiAhcHJvcGVydHkuc3RhcnRzV2l0aCgnLS1kYXJrcmVhZGVyJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRDU1NWYXJpYWJsZXMocnVsZXM6IENTU1J1bGVMaXN0KSB7XG4gICAgY29uc3QgdmFyaWFibGVzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcbiAgICBydWxlcyAmJiBpdGVyYXRlQ1NTUnVsZXMocnVsZXMsIChydWxlKSA9PiB7XG4gICAgICAgIHJ1bGUuc3R5bGUgJiYgaXRlcmF0ZUNTU0RlY2xhcmF0aW9ucyhydWxlLnN0eWxlLCAocHJvcGVydHksIHZhbHVlKSA9PiB7XG4gICAgICAgICAgICBpZiAoaXNDU1NWYXJpYWJsZShwcm9wZXJ0eSkpIHtcbiAgICAgICAgICAgICAgICB2YXJpYWJsZXMuc2V0KHByb3BlcnR5LCB2YWx1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH0pO1xuICAgIHJldHVybiB2YXJpYWJsZXM7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRFbGVtZW50Q1NTVmFyaWFibGVzKGVsZW1lbnQ6IEhUTUxFbGVtZW50KSB7XG4gICAgY29uc3QgdmFyaWFibGVzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcbiAgICBpdGVyYXRlQ1NTRGVjbGFyYXRpb25zKGVsZW1lbnQuc3R5bGUsIChwcm9wZXJ0eSwgdmFsdWUpID0+IHtcbiAgICAgICAgaWYgKGlzQ1NTVmFyaWFibGUocHJvcGVydHkpKSB7XG4gICAgICAgICAgICB2YXJpYWJsZXMuc2V0KHByb3BlcnR5LCB2YWx1ZSk7XG4gICAgICAgIH1cbiAgICB9KTtcbiAgICByZXR1cm4gdmFyaWFibGVzO1xufVxuXG5leHBvcnQgY29uc3QgY3NzVVJMUmVnZXggPSAvdXJsXFwoKCgnLis/Jyl8KFwiLis/XCIpfChbXlxcKV0qPykpXFwpL2c7XG5leHBvcnQgY29uc3QgY3NzSW1wb3J0UmVnZXggPSAvQGltcG9ydCAodXJsXFwoKT8oKCcuKz8nKXwoXCIuKz9cIil8KFteXFwpXSo/KSlcXCk/Oz8vZztcblxuZXhwb3J0IGZ1bmN0aW9uIGdldENTU1VSTFZhbHVlKGNzc1VSTDogc3RyaW5nKSB7XG4gICAgcmV0dXJuIGNzc1VSTC5yZXBsYWNlKC9edXJsXFwoKC4qKVxcKSQvLCAnJDEnKS5yZXBsYWNlKC9eXCIoLiopXCIkLywgJyQxJykucmVwbGFjZSgvXicoLiopJyQvLCAnJDEnKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldENTU0Jhc2VCYXRoKHVybDogc3RyaW5nKSB7XG4gICAgY29uc3QgY3NzVVJMID0gcGFyc2VVUkwodXJsKTtcbiAgICByZXR1cm4gYCR7Y3NzVVJMLm9yaWdpbn0ke2Nzc1VSTC5wYXRobmFtZS5yZXBsYWNlKC9cXD8uKiQvLCAnJykucmVwbGFjZSgvKFxcLykoW15cXC9dKykkL2ksICckMScpfWA7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZXBsYWNlQ1NTUmVsYXRpdmVVUkxzV2l0aEFic29sdXRlKCRjc3M6IHN0cmluZywgY3NzQmFzZVBhdGg6IHN0cmluZykge1xuICAgIHJldHVybiAkY3NzLnJlcGxhY2UoY3NzVVJMUmVnZXgsIChtYXRjaCkgPT4ge1xuICAgICAgICBjb25zdCBwYXRoVmFsdWUgPSBnZXRDU1NVUkxWYWx1ZShtYXRjaCk7XG4gICAgICAgIHJldHVybiBgdXJsKFwiJHtnZXRBYnNvbHV0ZVVSTChjc3NCYXNlUGF0aCwgcGF0aFZhbHVlKX1cIilgO1xuICAgIH0pO1xufVxuXG5jb25zdCBjc3NDb21tZW50c1JlZ2V4ID0gL1xcL1xcKltcXHNcXFNdKj9cXCpcXC8vZztcblxuZXhwb3J0IGZ1bmN0aW9uIHJlbW92ZUNTU0NvbW1lbnRzKCRjc3M6IHN0cmluZykge1xuICAgIHJldHVybiAkY3NzLnJlcGxhY2UoY3NzQ29tbWVudHNSZWdleCwgJycpO1xufVxuXG5jb25zdCBmb250RmFjZVJlZ2V4ID0gL0Bmb250LWZhY2VcXHMqe1tefV0qfS9nO1xuXG5leHBvcnQgZnVuY3Rpb24gcmVwbGFjZUNTU0ZvbnRGYWNlKCRjc3M6IHN0cmluZykge1xuICAgIHJldHVybiAkY3NzLnJlcGxhY2UoZm9udEZhY2VSZWdleCwgJycpO1xufVxuXG5jb25zdCB2YXJSZWdleCA9IC92YXJcXCgoLS1bXlxccyxcXChcXCldKyksP1xccyooW15cXChcXCldKihcXChbXlxcKFxcKV0qXFwpW15cXChcXCldKikqXFxzKilcXCkvZztcblxuZXhwb3J0IGZ1bmN0aW9uIHJlcGxhY2VDU1NWYXJpYWJsZXMoXG4gICAgdmFsdWU6IHN0cmluZyxcbiAgICB2YXJpYWJsZXM6IE1hcDxzdHJpbmcsIHN0cmluZz4sXG4gICAgc3RhY2sgPSBuZXcgU2V0PHN0cmluZz4oKSxcbikge1xuICAgIGxldCBtaXNzaW5nID0gZmFsc2U7XG4gICAgY29uc3QgdW5yZXNvbHZhYmxlID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgY29uc3QgcmVzdWx0ID0gdmFsdWUucmVwbGFjZSh2YXJSZWdleCwgKG1hdGNoLCBuYW1lLCBmYWxsYmFjaykgPT4ge1xuICAgICAgICBpZiAoc3RhY2suaGFzKG5hbWUpKSB7XG4gICAgICAgICAgICBsb2dXYXJuKGBDaXJjdWxhciByZWZlcmVuY2UgdG8gdmFyaWFibGUgJHtuYW1lfWApO1xuICAgICAgICAgICAgaWYgKGZhbGxiYWNrKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbGxiYWNrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbWlzc2luZyA9IHRydWU7XG4gICAgICAgICAgICByZXR1cm4gbWF0Y2g7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHZhcmlhYmxlcy5oYXMobmFtZSkpIHtcbiAgICAgICAgICAgIGNvbnN0IHZhbHVlID0gdmFyaWFibGVzLmdldChuYW1lKTtcbiAgICAgICAgICAgIGlmICh2YWx1ZS5tYXRjaCh2YXJSZWdleCkpIHtcbiAgICAgICAgICAgICAgICB1bnJlc29sdmFibGUuYWRkKG5hbWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgICAgICB9IGVsc2UgaWYgKGZhbGxiYWNrKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsbGJhY2s7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBsb2dXYXJuKGBWYXJpYWJsZSAke25hbWV9IG5vdCBmb3VuZGApO1xuICAgICAgICAgICAgbWlzc2luZyA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG1hdGNoO1xuICAgIH0pO1xuICAgIGlmIChtaXNzaW5nKSB7XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIGlmIChyZXN1bHQubWF0Y2godmFyUmVnZXgpKSB7XG4gICAgICAgIHVucmVzb2x2YWJsZS5mb3JFYWNoKCh2KSA9PiBzdGFjay5hZGQodikpO1xuICAgICAgICByZXR1cm4gcmVwbGFjZUNTU1ZhcmlhYmxlcyhyZXN1bHQsIHZhcmlhYmxlcywgc3RhY2spO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xufVxuIiwiZXhwb3J0IGludGVyZmFjZSBSR0JBIHtcbiAgICByOiBudW1iZXI7XG4gICAgZzogbnVtYmVyO1xuICAgIGI6IG51bWJlcjtcbiAgICBhPzogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEhTTEEge1xuICAgIGg6IG51bWJlcjtcbiAgICBzOiBudW1iZXI7XG4gICAgbDogbnVtYmVyO1xuICAgIGE/OiBudW1iZXI7XG59XG5cbi8vIGh0dHBzOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL0hTTF9hbmRfSFNWXG5leHBvcnQgZnVuY3Rpb24gaHNsVG9SR0Ioe2gsIHMsIGwsIGEgPSAxfTogSFNMQSk6IFJHQkEge1xuICAgIGlmIChzID09PSAwKSB7XG4gICAgICAgIGNvbnN0IFtyLCBiLCBnXSA9IFtsLCBsLCBsXS5tYXAoKHgpID0+IE1hdGgucm91bmQoeCAqIDI1NSkpO1xuICAgICAgICByZXR1cm4ge3IsIGcsIGIsIGF9O1xuICAgIH1cblxuICAgIGNvbnN0IGMgPSAoMSAtIE1hdGguYWJzKDIgKiBsIC0gMSkpICogcztcbiAgICBjb25zdCB4ID0gYyAqICgxIC0gTWF0aC5hYnMoKGggLyA2MCkgJSAyIC0gMSkpO1xuICAgIGNvbnN0IG0gPSBsIC0gYyAvIDI7XG4gICAgY29uc3QgW3IsIGcsIGJdID0gKFxuICAgICAgICBoIDwgNjAgPyBbYywgeCwgMF0gOlxuICAgICAgICAgICAgaCA8IDEyMCA/IFt4LCBjLCAwXSA6XG4gICAgICAgICAgICAgICAgaCA8IDE4MCA/IFswLCBjLCB4XSA6XG4gICAgICAgICAgICAgICAgICAgIGggPCAyNDAgPyBbMCwgeCwgY10gOlxuICAgICAgICAgICAgICAgICAgICAgICAgaCA8IDMwMCA/IFt4LCAwLCBjXSA6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgW2MsIDAsIHhdXG4gICAgKS5tYXAoKG4pID0+IE1hdGgucm91bmQoKG4gKyBtKSAqIDI1NSkpO1xuXG4gICAgcmV0dXJuIHtyLCBnLCBiLCBhfTtcbn1cblxuLy8gaHR0cHM6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvSFNMX2FuZF9IU1ZcbmV4cG9ydCBmdW5jdGlvbiByZ2JUb0hTTCh7cjogcjI1NSwgZzogZzI1NSwgYjogYjI1NSwgYSA9IDF9OiBSR0JBKTogSFNMQSB7XG4gICAgY29uc3QgciA9IHIyNTUgLyAyNTU7XG4gICAgY29uc3QgZyA9IGcyNTUgLyAyNTU7XG4gICAgY29uc3QgYiA9IGIyNTUgLyAyNTU7XG5cbiAgICBjb25zdCBtYXggPSBNYXRoLm1heChyLCBnLCBiKTtcbiAgICBjb25zdCBtaW4gPSBNYXRoLm1pbihyLCBnLCBiKTtcbiAgICBjb25zdCBjID0gbWF4IC0gbWluO1xuXG4gICAgY29uc3QgbCA9IChtYXggKyBtaW4pIC8gMjtcblxuICAgIGlmIChjID09PSAwKSB7XG4gICAgICAgIHJldHVybiB7aDogMCwgczogMCwgbCwgYX07XG4gICAgfVxuXG4gICAgbGV0IGggPSAoXG4gICAgICAgIG1heCA9PT0gciA/ICgoKGcgLSBiKSAvIGMpICUgNikgOlxuICAgICAgICAgICAgbWF4ID09PSBnID8gKChiIC0gcikgLyBjICsgMikgOlxuICAgICAgICAgICAgICAgICgociAtIGcpIC8gYyArIDQpXG4gICAgKSAqIDYwO1xuICAgIGlmIChoIDwgMCkge1xuICAgICAgICBoICs9IDM2MDtcbiAgICB9XG5cbiAgICBjb25zdCBzID0gYyAvICgxIC0gTWF0aC5hYnMoMiAqIGwgLSAxKSk7XG5cbiAgICByZXR1cm4ge2gsIHMsIGwsIGF9O1xufVxuXG5mdW5jdGlvbiB0b0ZpeGVkKG46IG51bWJlciwgZGlnaXRzID0gMCkge1xuICAgIGNvbnN0IGZpeGVkID0gbi50b0ZpeGVkKGRpZ2l0cyk7XG4gICAgaWYgKGRpZ2l0cyA9PT0gMCkge1xuICAgICAgICByZXR1cm4gZml4ZWQ7XG4gICAgfVxuICAgIGNvbnN0IGRvdCA9IGZpeGVkLmluZGV4T2YoJy4nKTtcbiAgICBpZiAoZG90ID49IDApIHtcbiAgICAgICAgY29uc3QgemVyb3NNYXRjaCA9IGZpeGVkLm1hdGNoKC8wKyQvKTtcbiAgICAgICAgaWYgKHplcm9zTWF0Y2gpIHtcbiAgICAgICAgICAgIGlmICh6ZXJvc01hdGNoLmluZGV4ID09PSBkb3QgKyAxKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZpeGVkLnN1YnN0cmluZygwLCBkb3QpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGZpeGVkLnN1YnN0cmluZygwLCB6ZXJvc01hdGNoLmluZGV4KTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZml4ZWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZ2JUb1N0cmluZyhyZ2I6IFJHQkEpIHtcbiAgICBjb25zdCB7ciwgZywgYiwgYX0gPSByZ2I7XG4gICAgaWYgKGEgIT0gbnVsbCAmJiBhIDwgMSkge1xuICAgICAgICByZXR1cm4gYHJnYmEoJHt0b0ZpeGVkKHIpfSwgJHt0b0ZpeGVkKGcpfSwgJHt0b0ZpeGVkKGIpfSwgJHt0b0ZpeGVkKGEsIDIpfSlgO1xuICAgIH1cbiAgICByZXR1cm4gYHJnYigke3RvRml4ZWQocil9LCAke3RvRml4ZWQoZyl9LCAke3RvRml4ZWQoYil9KWA7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZ2JUb0hleFN0cmluZyh7ciwgZywgYiwgYX06IFJHQkEpIHtcbiAgICByZXR1cm4gYCMkeyhhICE9IG51bGwgJiYgYSA8IDEgPyBbciwgZywgYiwgTWF0aC5yb3VuZChhICogMjU1KV0gOiBbciwgZywgYl0pLm1hcCgoeCkgPT4ge1xuICAgICAgICByZXR1cm4gYCR7eCA8IDE2ID8gJzAnIDogJyd9JHt4LnRvU3RyaW5nKDE2KX1gO1xuICAgIH0pLmpvaW4oJycpfWA7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoc2xUb1N0cmluZyhoc2w6IEhTTEEpIHtcbiAgICBjb25zdCB7aCwgcywgbCwgYX0gPSBoc2w7XG4gICAgaWYgKGEgIT0gbnVsbCAmJiBhIDwgMSkge1xuICAgICAgICByZXR1cm4gYGhzbGEoJHt0b0ZpeGVkKGgpfSwgJHt0b0ZpeGVkKHMgKiAxMDApfSUsICR7dG9GaXhlZChsICogMTAwKX0lLCAke3RvRml4ZWQoYSwgMil9KWA7XG4gICAgfVxuICAgIHJldHVybiBgaHNsKCR7dG9GaXhlZChoKX0sICR7dG9GaXhlZChzICogMTAwKX0lLCAke3RvRml4ZWQobCAqIDEwMCl9JSlgO1xufVxuXG5jb25zdCByZ2JNYXRjaCA9IC9ecmdiYT9cXChbXlxcKFxcKV0rXFwpJC87XG5jb25zdCBoc2xNYXRjaCA9IC9eaHNsYT9cXChbXlxcKFxcKV0rXFwpJC87XG5jb25zdCBoZXhNYXRjaCA9IC9eI1swLTlhLWZdKyQvaTtcblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlKCRjb2xvcjogc3RyaW5nKTogUkdCQSB7XG4gICAgY29uc3QgYyA9ICRjb2xvci50cmltKCkudG9Mb3dlckNhc2UoKTtcblxuICAgIGlmIChjLm1hdGNoKHJnYk1hdGNoKSkge1xuICAgICAgICByZXR1cm4gcGFyc2VSR0IoYyk7XG4gICAgfVxuXG4gICAgaWYgKGMubWF0Y2goaHNsTWF0Y2gpKSB7XG4gICAgICAgIHJldHVybiBwYXJzZUhTTChjKTtcbiAgICB9XG5cbiAgICBpZiAoYy5tYXRjaChoZXhNYXRjaCkpIHtcbiAgICAgICAgcmV0dXJuIHBhcnNlSGV4KGMpO1xuICAgIH1cblxuICAgIGlmIChrbm93bkNvbG9ycy5oYXMoYykpIHtcbiAgICAgICAgcmV0dXJuIGdldENvbG9yQnlOYW1lKGMpO1xuICAgIH1cblxuICAgIGlmIChzeXN0ZW1Db2xvcnMuaGFzKGMpKSB7XG4gICAgICAgIHJldHVybiBnZXRTeXN0ZW1Db2xvcihjKTtcbiAgICB9XG5cbiAgICBpZiAoJGNvbG9yID09PSAndHJhbnNwYXJlbnQnKSB7XG4gICAgICAgIHJldHVybiB7cjogMCwgZzogMCwgYjogMCwgYTogMH07XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IEVycm9yKGBVbmFibGUgdG8gcGFyc2UgJHskY29sb3J9YCk7XG59XG5cbmZ1bmN0aW9uIGdldE51bWJlcnNGcm9tU3RyaW5nKHN0cjogc3RyaW5nLCBzcGxpdHRlcjogUmVnRXhwLCByYW5nZTogbnVtYmVyW10sIHVuaXRzOiB7W3VuaXQ6IHN0cmluZ106IG51bWJlcn0pIHtcbiAgICBjb25zdCByYXcgPSBzdHIuc3BsaXQoc3BsaXR0ZXIpLmZpbHRlcigoeCkgPT4geCk7XG4gICAgY29uc3QgdW5pdHNMaXN0ID0gT2JqZWN0LmVudHJpZXModW5pdHMpO1xuICAgIGNvbnN0IG51bWJlcnMgPSByYXcubWFwKChyKSA9PiByLnRyaW0oKSkubWFwKChyLCBpKSA9PiB7XG4gICAgICAgIGxldCBuOiBudW1iZXI7XG4gICAgICAgIGNvbnN0IHVuaXQgPSB1bml0c0xpc3QuZmluZCgoW3VdKSA9PiByLmVuZHNXaXRoKHUpKTtcbiAgICAgICAgaWYgKHVuaXQpIHtcbiAgICAgICAgICAgIG4gPSBwYXJzZUZsb2F0KHIuc3Vic3RyaW5nKDAsIHIubGVuZ3RoIC0gdW5pdFswXS5sZW5ndGgpKSAvIHVuaXRbMV0gKiByYW5nZVtpXTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIG4gPSBwYXJzZUZsb2F0KHIpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChyYW5nZVtpXSA+IDEpIHtcbiAgICAgICAgICAgIHJldHVybiBNYXRoLnJvdW5kKG4pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBuO1xuICAgIH0pO1xuICAgIHJldHVybiBudW1iZXJzO1xufVxuXG5jb25zdCByZ2JTcGxpdHRlciA9IC9yZ2JhP3xcXCh8XFwpfFxcL3wsfFxccy9pZztcbmNvbnN0IHJnYlJhbmdlID0gWzI1NSwgMjU1LCAyNTUsIDFdO1xuY29uc3QgcmdiVW5pdHMgPSB7JyUnOiAxMDB9O1xuXG5mdW5jdGlvbiBwYXJzZVJHQigkcmdiOiBzdHJpbmcpIHtcbiAgICBjb25zdCBbciwgZywgYiwgYSA9IDFdID0gZ2V0TnVtYmVyc0Zyb21TdHJpbmcoJHJnYiwgcmdiU3BsaXR0ZXIsIHJnYlJhbmdlLCByZ2JVbml0cyk7XG4gICAgcmV0dXJuIHtyLCBnLCBiLCBhfTtcbn1cblxuY29uc3QgaHNsU3BsaXR0ZXIgPSAvaHNsYT98XFwofFxcKXxcXC98LHxcXHMvaWc7XG5jb25zdCBoc2xSYW5nZSA9IFszNjAsIDEsIDEsIDFdO1xuY29uc3QgaHNsVW5pdHMgPSB7JyUnOiAxMDAsICdkZWcnOiAzNjAsICdyYWQnOiAyICogTWF0aC5QSSwgJ3R1cm4nOiAxfTtcblxuZnVuY3Rpb24gcGFyc2VIU0woJGhzbDogc3RyaW5nKSB7XG4gICAgY29uc3QgW2gsIHMsIGwsIGEgPSAxXSA9IGdldE51bWJlcnNGcm9tU3RyaW5nKCRoc2wsIGhzbFNwbGl0dGVyLCBoc2xSYW5nZSwgaHNsVW5pdHMpO1xuICAgIHJldHVybiBoc2xUb1JHQih7aCwgcywgbCwgYX0pO1xufVxuXG5mdW5jdGlvbiBwYXJzZUhleCgkaGV4OiBzdHJpbmcpIHtcbiAgICBjb25zdCBoID0gJGhleC5zdWJzdHJpbmcoMSk7XG4gICAgc3dpdGNoIChoLmxlbmd0aCkge1xuICAgICAgICBjYXNlIDM6XG4gICAgICAgIGNhc2UgNDoge1xuICAgICAgICAgICAgY29uc3QgW3IsIGcsIGJdID0gWzAsIDEsIDJdLm1hcCgoaSkgPT4gcGFyc2VJbnQoYCR7aFtpXX0ke2hbaV19YCwgMTYpKTtcbiAgICAgICAgICAgIGNvbnN0IGEgPSBoLmxlbmd0aCA9PT0gMyA/IDEgOiAocGFyc2VJbnQoYCR7aFszXX0ke2hbM119YCwgMTYpIC8gMjU1KTtcbiAgICAgICAgICAgIHJldHVybiB7ciwgZywgYiwgYX07XG4gICAgICAgIH1cbiAgICAgICAgY2FzZSA2OlxuICAgICAgICBjYXNlIDg6IHtcbiAgICAgICAgICAgIGNvbnN0IFtyLCBnLCBiXSA9IFswLCAyLCA0XS5tYXAoKGkpID0+IHBhcnNlSW50KGguc3Vic3RyaW5nKGksIGkgKyAyKSwgMTYpKTtcbiAgICAgICAgICAgIGNvbnN0IGEgPSBoLmxlbmd0aCA9PT0gNiA/IDEgOiAocGFyc2VJbnQoaC5zdWJzdHJpbmcoNiwgOCksIDE2KSAvIDI1NSk7XG4gICAgICAgICAgICByZXR1cm4ge3IsIGcsIGIsIGF9O1xuICAgICAgICB9XG4gICAgfVxuICAgIHRocm93IG5ldyBFcnJvcihgVW5hYmxlIHRvIHBhcnNlICR7JGhleH1gKTtcbn1cblxuZnVuY3Rpb24gZ2V0Q29sb3JCeU5hbWUoJGNvbG9yOiBzdHJpbmcpIHtcbiAgICBjb25zdCBuID0ga25vd25Db2xvcnMuZ2V0KCRjb2xvcik7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgcjogKG4gPj4gMTYpICYgMjU1LFxuICAgICAgICBnOiAobiA+PiA4KSAmIDI1NSxcbiAgICAgICAgYjogKG4gPj4gMCkgJiAyNTUsXG4gICAgICAgIGE6IDFcbiAgICB9O1xufVxuXG5mdW5jdGlvbiBnZXRTeXN0ZW1Db2xvcigkY29sb3I6IHN0cmluZykge1xuICAgIGNvbnN0IG4gPSBzeXN0ZW1Db2xvcnMuZ2V0KCRjb2xvcik7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgcjogKG4gPj4gMTYpICYgMjU1LFxuICAgICAgICBnOiAobiA+PiA4KSAmIDI1NSxcbiAgICAgICAgYjogKG4gPj4gMCkgJiAyNTUsXG4gICAgICAgIGE6IDFcbiAgICB9O1xufVxuXG5jb25zdCBrbm93bkNvbG9yczogTWFwPHN0cmluZywgbnVtYmVyPiA9IG5ldyBNYXAoT2JqZWN0LmVudHJpZXMoe1xuICAgIGFsaWNlYmx1ZTogMHhmMGY4ZmYsXG4gICAgYW50aXF1ZXdoaXRlOiAweGZhZWJkNyxcbiAgICBhcXVhOiAweDAwZmZmZixcbiAgICBhcXVhbWFyaW5lOiAweDdmZmZkNCxcbiAgICBhenVyZTogMHhmMGZmZmYsXG4gICAgYmVpZ2U6IDB4ZjVmNWRjLFxuICAgIGJpc3F1ZTogMHhmZmU0YzQsXG4gICAgYmxhY2s6IDB4MDAwMDAwLFxuICAgIGJsYW5jaGVkYWxtb25kOiAweGZmZWJjZCxcbiAgICBibHVlOiAweDAwMDBmZixcbiAgICBibHVldmlvbGV0OiAweDhhMmJlMixcbiAgICBicm93bjogMHhhNTJhMmEsXG4gICAgYnVybHl3b29kOiAweGRlYjg4NyxcbiAgICBjYWRldGJsdWU6IDB4NWY5ZWEwLFxuICAgIGNoYXJ0cmV1c2U6IDB4N2ZmZjAwLFxuICAgIGNob2NvbGF0ZTogMHhkMjY5MWUsXG4gICAgY29yYWw6IDB4ZmY3ZjUwLFxuICAgIGNvcm5mbG93ZXJibHVlOiAweDY0OTVlZCxcbiAgICBjb3Juc2lsazogMHhmZmY4ZGMsXG4gICAgY3JpbXNvbjogMHhkYzE0M2MsXG4gICAgY3lhbjogMHgwMGZmZmYsXG4gICAgZGFya2JsdWU6IDB4MDAwMDhiLFxuICAgIGRhcmtjeWFuOiAweDAwOGI4YixcbiAgICBkYXJrZ29sZGVucm9kOiAweGI4ODYwYixcbiAgICBkYXJrZ3JheTogMHhhOWE5YTksXG4gICAgZGFya2dyZXk6IDB4YTlhOWE5LFxuICAgIGRhcmtncmVlbjogMHgwMDY0MDAsXG4gICAgZGFya2toYWtpOiAweGJkYjc2YixcbiAgICBkYXJrbWFnZW50YTogMHg4YjAwOGIsXG4gICAgZGFya29saXZlZ3JlZW46IDB4NTU2YjJmLFxuICAgIGRhcmtvcmFuZ2U6IDB4ZmY4YzAwLFxuICAgIGRhcmtvcmNoaWQ6IDB4OTkzMmNjLFxuICAgIGRhcmtyZWQ6IDB4OGIwMDAwLFxuICAgIGRhcmtzYWxtb246IDB4ZTk5NjdhLFxuICAgIGRhcmtzZWFncmVlbjogMHg4ZmJjOGYsXG4gICAgZGFya3NsYXRlYmx1ZTogMHg0ODNkOGIsXG4gICAgZGFya3NsYXRlZ3JheTogMHgyZjRmNGYsXG4gICAgZGFya3NsYXRlZ3JleTogMHgyZjRmNGYsXG4gICAgZGFya3R1cnF1b2lzZTogMHgwMGNlZDEsXG4gICAgZGFya3Zpb2xldDogMHg5NDAwZDMsXG4gICAgZGVlcHBpbms6IDB4ZmYxNDkzLFxuICAgIGRlZXBza3libHVlOiAweDAwYmZmZixcbiAgICBkaW1ncmF5OiAweDY5Njk2OSxcbiAgICBkaW1ncmV5OiAweDY5Njk2OSxcbiAgICBkb2RnZXJibHVlOiAweDFlOTBmZixcbiAgICBmaXJlYnJpY2s6IDB4YjIyMjIyLFxuICAgIGZsb3JhbHdoaXRlOiAweGZmZmFmMCxcbiAgICBmb3Jlc3RncmVlbjogMHgyMjhiMjIsXG4gICAgZnVjaHNpYTogMHhmZjAwZmYsXG4gICAgZ2FpbnNib3JvOiAweGRjZGNkYyxcbiAgICBnaG9zdHdoaXRlOiAweGY4ZjhmZixcbiAgICBnb2xkOiAweGZmZDcwMCxcbiAgICBnb2xkZW5yb2Q6IDB4ZGFhNTIwLFxuICAgIGdyYXk6IDB4ODA4MDgwLFxuICAgIGdyZXk6IDB4ODA4MDgwLFxuICAgIGdyZWVuOiAweDAwODAwMCxcbiAgICBncmVlbnllbGxvdzogMHhhZGZmMmYsXG4gICAgaG9uZXlkZXc6IDB4ZjBmZmYwLFxuICAgIGhvdHBpbms6IDB4ZmY2OWI0LFxuICAgIGluZGlhbnJlZDogMHhjZDVjNWMsXG4gICAgaW5kaWdvOiAweDRiMDA4MixcbiAgICBpdm9yeTogMHhmZmZmZjAsXG4gICAga2hha2k6IDB4ZjBlNjhjLFxuICAgIGxhdmVuZGVyOiAweGU2ZTZmYSxcbiAgICBsYXZlbmRlcmJsdXNoOiAweGZmZjBmNSxcbiAgICBsYXduZ3JlZW46IDB4N2NmYzAwLFxuICAgIGxlbW9uY2hpZmZvbjogMHhmZmZhY2QsXG4gICAgbGlnaHRibHVlOiAweGFkZDhlNixcbiAgICBsaWdodGNvcmFsOiAweGYwODA4MCxcbiAgICBsaWdodGN5YW46IDB4ZTBmZmZmLFxuICAgIGxpZ2h0Z29sZGVucm9keWVsbG93OiAweGZhZmFkMixcbiAgICBsaWdodGdyYXk6IDB4ZDNkM2QzLFxuICAgIGxpZ2h0Z3JleTogMHhkM2QzZDMsXG4gICAgbGlnaHRncmVlbjogMHg5MGVlOTAsXG4gICAgbGlnaHRwaW5rOiAweGZmYjZjMSxcbiAgICBsaWdodHNhbG1vbjogMHhmZmEwN2EsXG4gICAgbGlnaHRzZWFncmVlbjogMHgyMGIyYWEsXG4gICAgbGlnaHRza3libHVlOiAweDg3Y2VmYSxcbiAgICBsaWdodHNsYXRlZ3JheTogMHg3Nzg4OTksXG4gICAgbGlnaHRzbGF0ZWdyZXk6IDB4Nzc4ODk5LFxuICAgIGxpZ2h0c3RlZWxibHVlOiAweGIwYzRkZSxcbiAgICBsaWdodHllbGxvdzogMHhmZmZmZTAsXG4gICAgbGltZTogMHgwMGZmMDAsXG4gICAgbGltZWdyZWVuOiAweDMyY2QzMixcbiAgICBsaW5lbjogMHhmYWYwZTYsXG4gICAgbWFnZW50YTogMHhmZjAwZmYsXG4gICAgbWFyb29uOiAweDgwMDAwMCxcbiAgICBtZWRpdW1hcXVhbWFyaW5lOiAweDY2Y2RhYSxcbiAgICBtZWRpdW1ibHVlOiAweDAwMDBjZCxcbiAgICBtZWRpdW1vcmNoaWQ6IDB4YmE1NWQzLFxuICAgIG1lZGl1bXB1cnBsZTogMHg5MzcwZGIsXG4gICAgbWVkaXVtc2VhZ3JlZW46IDB4M2NiMzcxLFxuICAgIG1lZGl1bXNsYXRlYmx1ZTogMHg3YjY4ZWUsXG4gICAgbWVkaXVtc3ByaW5nZ3JlZW46IDB4MDBmYTlhLFxuICAgIG1lZGl1bXR1cnF1b2lzZTogMHg0OGQxY2MsXG4gICAgbWVkaXVtdmlvbGV0cmVkOiAweGM3MTU4NSxcbiAgICBtaWRuaWdodGJsdWU6IDB4MTkxOTcwLFxuICAgIG1pbnRjcmVhbTogMHhmNWZmZmEsXG4gICAgbWlzdHlyb3NlOiAweGZmZTRlMSxcbiAgICBtb2NjYXNpbjogMHhmZmU0YjUsXG4gICAgbmF2YWpvd2hpdGU6IDB4ZmZkZWFkLFxuICAgIG5hdnk6IDB4MDAwMDgwLFxuICAgIG9sZGxhY2U6IDB4ZmRmNWU2LFxuICAgIG9saXZlOiAweDgwODAwMCxcbiAgICBvbGl2ZWRyYWI6IDB4NmI4ZTIzLFxuICAgIG9yYW5nZTogMHhmZmE1MDAsXG4gICAgb3JhbmdlcmVkOiAweGZmNDUwMCxcbiAgICBvcmNoaWQ6IDB4ZGE3MGQ2LFxuICAgIHBhbGVnb2xkZW5yb2Q6IDB4ZWVlOGFhLFxuICAgIHBhbGVncmVlbjogMHg5OGZiOTgsXG4gICAgcGFsZXR1cnF1b2lzZTogMHhhZmVlZWUsXG4gICAgcGFsZXZpb2xldHJlZDogMHhkYjcwOTMsXG4gICAgcGFwYXlhd2hpcDogMHhmZmVmZDUsXG4gICAgcGVhY2hwdWZmOiAweGZmZGFiOSxcbiAgICBwZXJ1OiAweGNkODUzZixcbiAgICBwaW5rOiAweGZmYzBjYixcbiAgICBwbHVtOiAweGRkYTBkZCxcbiAgICBwb3dkZXJibHVlOiAweGIwZTBlNixcbiAgICBwdXJwbGU6IDB4ODAwMDgwLFxuICAgIHJlYmVjY2FwdXJwbGU6IDB4NjYzMzk5LFxuICAgIHJlZDogMHhmZjAwMDAsXG4gICAgcm9zeWJyb3duOiAweGJjOGY4ZixcbiAgICByb3lhbGJsdWU6IDB4NDE2OWUxLFxuICAgIHNhZGRsZWJyb3duOiAweDhiNDUxMyxcbiAgICBzYWxtb246IDB4ZmE4MDcyLFxuICAgIHNhbmR5YnJvd246IDB4ZjRhNDYwLFxuICAgIHNlYWdyZWVuOiAweDJlOGI1NyxcbiAgICBzZWFzaGVsbDogMHhmZmY1ZWUsXG4gICAgc2llbm5hOiAweGEwNTIyZCxcbiAgICBzaWx2ZXI6IDB4YzBjMGMwLFxuICAgIHNreWJsdWU6IDB4ODdjZWViLFxuICAgIHNsYXRlYmx1ZTogMHg2YTVhY2QsXG4gICAgc2xhdGVncmF5OiAweDcwODA5MCxcbiAgICBzbGF0ZWdyZXk6IDB4NzA4MDkwLFxuICAgIHNub3c6IDB4ZmZmYWZhLFxuICAgIHNwcmluZ2dyZWVuOiAweDAwZmY3ZixcbiAgICBzdGVlbGJsdWU6IDB4NDY4MmI0LFxuICAgIHRhbjogMHhkMmI0OGMsXG4gICAgdGVhbDogMHgwMDgwODAsXG4gICAgdGhpc3RsZTogMHhkOGJmZDgsXG4gICAgdG9tYXRvOiAweGZmNjM0NyxcbiAgICB0dXJxdW9pc2U6IDB4NDBlMGQwLFxuICAgIHZpb2xldDogMHhlZTgyZWUsXG4gICAgd2hlYXQ6IDB4ZjVkZWIzLFxuICAgIHdoaXRlOiAweGZmZmZmZixcbiAgICB3aGl0ZXNtb2tlOiAweGY1ZjVmNSxcbiAgICB5ZWxsb3c6IDB4ZmZmZjAwLFxuICAgIHllbGxvd2dyZWVuOiAweDlhY2QzMixcbn0pKTtcblxuY29uc3Qgc3lzdGVtQ29sb3JzOiBNYXA8c3RyaW5nLCBudW1iZXI+ID0gbmV3IE1hcChPYmplY3QuZW50cmllcyh7XG4gICAgQWN0aXZlQm9yZGVyOiAweDNiOTlmYyxcbiAgICBBY3RpdmVDYXB0aW9uOiAweDAwMDAwMCxcbiAgICBBcHBXb3Jrc3BhY2U6IDB4YWFhYWFhLFxuICAgIEJhY2tncm91bmQ6IDB4NjM2M2NlLFxuICAgIEJ1dHRvbkZhY2U6IDB4ZmZmZmZmLFxuICAgIEJ1dHRvbkhpZ2hsaWdodDogMHhlOWU5ZTksXG4gICAgQnV0dG9uU2hhZG93OiAweDlmYTA5ZixcbiAgICBCdXR0b25UZXh0OiAweDAwMDAwMCxcbiAgICBDYXB0aW9uVGV4dDogMHgwMDAwMDAsXG4gICAgR3JheVRleHQ6IDB4N2Y3ZjdmLFxuICAgIEhpZ2hsaWdodDogMHhiMmQ3ZmYsXG4gICAgSGlnaGxpZ2h0VGV4dDogMHgwMDAwMDAsXG4gICAgSW5hY3RpdmVCb3JkZXI6IDB4ZmZmZmZmLFxuICAgIEluYWN0aXZlQ2FwdGlvbjogMHhmZmZmZmYsXG4gICAgSW5hY3RpdmVDYXB0aW9uVGV4dDogMHgwMDAwMDAsXG4gICAgSW5mb0JhY2tncm91bmQ6IDB4ZmJmY2M1LFxuICAgIEluZm9UZXh0OiAweDAwMDAwMCxcbiAgICBNZW51OiAweGY2ZjZmNixcbiAgICBNZW51VGV4dDogMHhmZmZmZmYsXG4gICAgU2Nyb2xsYmFyOiAweGFhYWFhYSxcbiAgICBUaHJlZUREYXJrU2hhZG93OiAweDAwMDAwMCxcbiAgICBUaHJlZURGYWNlOiAweGMwYzBjMCxcbiAgICBUaHJlZURIaWdobGlnaHQ6IDB4ZmZmZmZmLFxuICAgIFRocmVlRExpZ2h0U2hhZG93OiAweGZmZmZmZixcbiAgICBUaHJlZURTaGFkb3c6IDB4MDAwMDAwLFxuICAgIFdpbmRvdzogMHhlY2VjZWMsXG4gICAgV2luZG93RnJhbWU6IDB4YWFhYWFhLFxuICAgIFdpbmRvd1RleHQ6IDB4MDAwMDAwLFxuICAgICctd2Via2l0LWZvY3VzLXJpbmctY29sb3InOiAweGU1OTcwMFxufSkubWFwKChba2V5LCB2YWx1ZV0pID0+IFtrZXkudG9Mb3dlckNhc2UoKSwgdmFsdWVdIGFzIFtzdHJpbmcsIG51bWJlcl0pKTtcbiIsImV4cG9ydCBmdW5jdGlvbiBzY2FsZSh4OiBudW1iZXIsIGluTG93OiBudW1iZXIsIGluSGlnaDogbnVtYmVyLCBvdXRMb3c6IG51bWJlciwgb3V0SGlnaDogbnVtYmVyKSB7XG4gICAgcmV0dXJuICh4IC0gaW5Mb3cpICogKG91dEhpZ2ggLSBvdXRMb3cpIC8gKGluSGlnaCAtIGluTG93KSArIG91dExvdztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNsYW1wKHg6IG51bWJlciwgbWluOiBudW1iZXIsIG1heDogbnVtYmVyKSB7XG4gICAgcmV0dXJuIE1hdGgubWluKG1heCwgTWF0aC5tYXgobWluLCB4KSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtdWx0aXBseU1hdHJpY2VzKG0xOiBudW1iZXJbXVtdLCBtMjogbnVtYmVyW11bXSkge1xuICAgIGNvbnN0IHJlc3VsdDogbnVtYmVyW11bXSA9IFtdO1xuICAgIGZvciAobGV0IGkgPSAwLCBsZW4gPSBtMS5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuICAgICAgICByZXN1bHRbaV0gPSBbXTtcbiAgICAgICAgZm9yIChsZXQgaiA9IDAsIGxlbjIgPSBtMlswXS5sZW5ndGg7IGogPCBsZW4yOyBqKyspIHtcbiAgICAgICAgICAgIGxldCBzdW0gPSAwO1xuICAgICAgICAgICAgZm9yIChsZXQgayA9IDAsIGxlbjMgPSBtMVswXS5sZW5ndGg7IGsgPCBsZW4zOyBrKyspIHtcbiAgICAgICAgICAgICAgICBzdW0gKz0gbTFbaV1ba10gKiBtMltrXVtqXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJlc3VsdFtpXVtqXSA9IHN1bTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xufVxuIiwiZXhwb3J0IGZ1bmN0aW9uIGdldFRleHRQb3NpdGlvbk1lc3NhZ2UodGV4dDogc3RyaW5nLCBpbmRleDogbnVtYmVyKSB7XG4gICAgaWYgKCFpc0Zpbml0ZShpbmRleCkpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBXcm9uZyBjaGFyIGluZGV4ICR7aW5kZXh9YCk7XG4gICAgfVxuICAgIGxldCBtZXNzYWdlID0gJyc7XG4gICAgbGV0IGxpbmUgPSAwO1xuICAgIGxldCBwcmV2TG46IG51bWJlcjtcbiAgICBsZXQgbmV4dExuID0gMDtcbiAgICBkbyB7XG4gICAgICAgIGxpbmUrKztcbiAgICAgICAgcHJldkxuID0gbmV4dExuO1xuICAgICAgICBuZXh0TG4gPSB0ZXh0LmluZGV4T2YoJ1xcbicsIHByZXZMbiArIDEpO1xuICAgIH0gd2hpbGUgKG5leHRMbiA+PSAwICYmIG5leHRMbiA8PSBpbmRleCk7XG4gICAgY29uc3QgY29sdW1uID0gaW5kZXggLSBwcmV2TG47XG4gICAgbWVzc2FnZSArPSBgbGluZSAke2xpbmV9LCBjb2x1bW4gJHtjb2x1bW59YDtcbiAgICBtZXNzYWdlICs9ICdcXG4nO1xuICAgIGlmIChpbmRleCA8IHRleHQubGVuZ3RoKSB7XG4gICAgICAgIG1lc3NhZ2UgKz0gdGV4dC5zdWJzdHJpbmcocHJldkxuICsgMSwgbmV4dExuKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBtZXNzYWdlICs9IHRleHQuc3Vic3RyaW5nKHRleHQubGFzdEluZGV4T2YoJ1xcbicpICsgMSk7XG4gICAgfVxuICAgIG1lc3NhZ2UgKz0gJ1xcbic7XG4gICAgbWVzc2FnZSArPSBgJHtuZXcgQXJyYXkoY29sdW1uKS5qb2luKCctJyl9XmA7XG4gICAgcmV0dXJuIG1lc3NhZ2U7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRUZXh0RGlmZkluZGV4KGE6IHN0cmluZywgYjogc3RyaW5nKSB7XG4gICAgY29uc3Qgc2hvcnQgPSBNYXRoLm1pbihhLmxlbmd0aCwgYi5sZW5ndGgpO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc2hvcnQ7IGkrKykge1xuICAgICAgICBpZiAoYVtpXSAhPT0gYltpXSkge1xuICAgICAgICAgICAgcmV0dXJuIGk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgaWYgKGEubGVuZ3RoICE9PSBiLmxlbmd0aCkge1xuICAgICAgICByZXR1cm4gc2hvcnQ7XG4gICAgfVxuICAgIHJldHVybiAtMTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlQXJyYXkodGV4dDogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRleHQucmVwbGFjZSgvXFxyL2csICcnKVxuICAgICAgICAuc3BsaXQoJ1xcbicpXG4gICAgICAgIC5tYXAoKHMpID0+IHMudHJpbSgpKVxuICAgICAgICAuZmlsdGVyKChzKSA9PiBzKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGZvcm1hdEFycmF5KGFycjogc3RyaW5nW10pIHtcbiAgICByZXR1cm4gYXJyLmNvbmNhdCgnJykuam9pbignXFxuJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRNYXRjaGVzKHJlZ2V4OiBSZWdFeHAsIGlucHV0OiBzdHJpbmcsIGdyb3VwID0gMCkge1xuICAgIGNvbnN0IG1hdGNoZXM6IHN0cmluZ1tdID0gW107XG4gICAgbGV0IG06IFJlZ0V4cE1hdGNoQXJyYXk7XG4gICAgd2hpbGUgKG0gPSByZWdleC5leGVjKGlucHV0KSkge1xuICAgICAgICBtYXRjaGVzLnB1c2gobVtncm91cF0pO1xuICAgIH1cbiAgICByZXR1cm4gbWF0Y2hlcztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFN0cmluZ1NpemUodmFsdWU6IHN0cmluZykge1xuICAgIHJldHVybiB2YWx1ZS5sZW5ndGggKiAyO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZm9ybWF0Q1NTKHRleHQ6IHN0cmluZykge1xuXG4gICAgZnVuY3Rpb24gdHJpbUxlZnQodGV4dDogc3RyaW5nKSB7XG4gICAgICAgIHJldHVybiB0ZXh0LnJlcGxhY2UoL15cXHMrLywgJycpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGdldEluZGVudChkZXB0aDogbnVtYmVyKSB7XG4gICAgICAgIGlmIChkZXB0aCA9PT0gMCkge1xuICAgICAgICAgICAgcmV0dXJuICcnO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiAnICcucmVwZWF0KDQgKiBkZXB0aCk7XG4gICAgfVxuXG4gICAgY29uc3QgZW1wdHlSdWxlUmVnZXhwID0gL1tee31dK3tcXHMqfS9nO1xuICAgIHdoaWxlIChlbXB0eVJ1bGVSZWdleHAudGVzdCh0ZXh0KSkge1xuICAgICAgICB0ZXh0ID0gdGV4dC5yZXBsYWNlKGVtcHR5UnVsZVJlZ2V4cCwgJycpO1xuICAgIH1cblxuICAgIGNvbnN0IGNzcyA9ICh0ZXh0XG4gICAgICAgIC5yZXBsYWNlKC9cXHN7Mix9L2csICcgJykgLy8gUmVwbGFjaW5nIG11bHRpcGxlIHNwYWNlcyB0byBvbmVcbiAgICAgICAgLnJlcGxhY2UoL1xcey9nLCAne1xcbicpIC8vIHtcbiAgICAgICAgLnJlcGxhY2UoL1xcfS9nLCAnXFxufVxcbicpIC8vIH1cbiAgICAgICAgLnJlcGxhY2UoL1xcOyg/IVteKFxcKHxcXFwiKV0qKFxcKXxcXFwiKSkvZywgJztcXG4nKSAvLyA7IGFuZCBkbyBub3QgdGFyZ2V0IGJldHdlZW4gKCkgYW5kIFwiXCJcbiAgICAgICAgLnJlcGxhY2UoL1xcLCg/IVteKFxcKHxcXFwiKV0qKFxcKXxcXFwiKSkvZywgJyxcXG4nKSAvLyAsIGFuZCBkbyBub3QgdGFyZ2V0IGJldHdlZW4gKCkgYW5kIFwiXCJcbiAgICAgICAgLnJlcGxhY2UoL1xcblxccypcXG4vZywgJ1xcbicpIC8vIFJlbW92ZSBcXG4gV2l0aG91dCBhbnkgY2hhcmFjdGVycyBiZXR3ZWVuIGl0IHRvIHRoZSBuZXh0IFxcblxuICAgICAgICAuc3BsaXQoJ1xcbicpKTtcblxuICAgIGxldCBkZXB0aCA9IDA7XG4gICAgY29uc3QgZm9ybWF0dGVkID0gW107XG5cbiAgICBmb3IgKGxldCB4ID0gMCwgbGVuID0gY3NzLmxlbmd0aDsgeCA8IGxlbjsgeCsrKSB7XG4gICAgICAgIGNvbnN0IGxpbmUgPSBjc3NbeF0gKyAnXFxuJztcbiAgICAgICAgaWYgKGxpbmUubWF0Y2goL1xcey8pKSB7IC8vIHtcbiAgICAgICAgICAgIGZvcm1hdHRlZC5wdXNoKGdldEluZGVudChkZXB0aCsrKSArIHRyaW1MZWZ0KGxpbmUpKTtcbiAgICAgICAgfSBlbHNlIGlmIChsaW5lLm1hdGNoKC9cXH0vKSkgeyAvLyB9XG4gICAgICAgICAgICBmb3JtYXR0ZWQucHVzaChnZXRJbmRlbnQoLS1kZXB0aCkgKyB0cmltTGVmdChsaW5lKSk7XG4gICAgICAgIH0gZWxzZSB7IC8vIENTUyBsaW5lXG4gICAgICAgICAgICBmb3JtYXR0ZWQucHVzaChnZXRJbmRlbnQoZGVwdGgpICsgdHJpbUxlZnQobGluZSkpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGZvcm1hdHRlZC5qb2luKCcnKS50cmltKCk7XG59XG4iLCJpbXBvcnQge2NsYW1wLCBtdWx0aXBseU1hdHJpY2VzfSBmcm9tICcuLi8uLi91dGlscy9tYXRoJztcbmltcG9ydCB7RmlsdGVyQ29uZmlnfSBmcm9tICcuLi8uLi9kZWZpbml0aW9ucyc7XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVGaWx0ZXJNYXRyaXgoY29uZmlnOiBGaWx0ZXJDb25maWcpIHtcbiAgICBsZXQgbSA9IE1hdHJpeC5pZGVudGl0eSgpO1xuICAgIGlmIChjb25maWcuc2VwaWEgIT09IDApIHtcbiAgICAgICAgbSA9IG11bHRpcGx5TWF0cmljZXMobSwgTWF0cml4LnNlcGlhKGNvbmZpZy5zZXBpYSAvIDEwMCkpO1xuICAgIH1cbiAgICBpZiAoY29uZmlnLmdyYXlzY2FsZSAhPT0gMCkge1xuICAgICAgICBtID0gbXVsdGlwbHlNYXRyaWNlcyhtLCBNYXRyaXguZ3JheXNjYWxlKGNvbmZpZy5ncmF5c2NhbGUgLyAxMDApKTtcbiAgICB9XG4gICAgaWYgKGNvbmZpZy5jb250cmFzdCAhPT0gMTAwKSB7XG4gICAgICAgIG0gPSBtdWx0aXBseU1hdHJpY2VzKG0sIE1hdHJpeC5jb250cmFzdChjb25maWcuY29udHJhc3QgLyAxMDApKTtcbiAgICB9XG4gICAgaWYgKGNvbmZpZy5icmlnaHRuZXNzICE9PSAxMDApIHtcbiAgICAgICAgbSA9IG11bHRpcGx5TWF0cmljZXMobSwgTWF0cml4LmJyaWdodG5lc3MoY29uZmlnLmJyaWdodG5lc3MgLyAxMDApKTtcbiAgICB9XG4gICAgaWYgKGNvbmZpZy5tb2RlID09PSAxKSB7XG4gICAgICAgIG0gPSBtdWx0aXBseU1hdHJpY2VzKG0sIE1hdHJpeC5pbnZlcnROSHVlKCkpO1xuICAgIH1cbiAgICByZXR1cm4gbTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFwcGx5Q29sb3JNYXRyaXgoW3IsIGcsIGJdOiBudW1iZXJbXSwgbWF0cml4OiBudW1iZXJbXVtdKSB7XG4gICAgY29uc3QgcmdiID0gW1tyIC8gMjU1XSwgW2cgLyAyNTVdLCBbYiAvIDI1NV0sIFsxXSwgWzFdXTtcbiAgICBjb25zdCByZXN1bHQgPSBtdWx0aXBseU1hdHJpY2VzKG1hdHJpeCwgcmdiKTtcbiAgICByZXR1cm4gWzAsIDEsIDJdLm1hcCgoaSkgPT4gY2xhbXAoTWF0aC5yb3VuZChyZXN1bHRbaV1bMF0gKiAyNTUpLCAwLCAyNTUpKTtcbn1cblxuZXhwb3J0IGNvbnN0IE1hdHJpeCA9IHtcblxuICAgIGlkZW50aXR5KCkge1xuICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgWzEsIDAsIDAsIDAsIDBdLFxuICAgICAgICAgICAgWzAsIDEsIDAsIDAsIDBdLFxuICAgICAgICAgICAgWzAsIDAsIDEsIDAsIDBdLFxuICAgICAgICAgICAgWzAsIDAsIDAsIDEsIDBdLFxuICAgICAgICAgICAgWzAsIDAsIDAsIDAsIDFdXG4gICAgICAgIF07XG4gICAgfSxcblxuICAgIGludmVydE5IdWUoKSB7XG4gICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICBbMC4zMzMsIC0wLjY2NywgLTAuNjY3LCAwLCAxXSxcbiAgICAgICAgICAgIFstMC42NjcsIDAuMzMzLCAtMC42NjcsIDAsIDFdLFxuICAgICAgICAgICAgWy0wLjY2NywgLTAuNjY3LCAwLjMzMywgMCwgMV0sXG4gICAgICAgICAgICBbMCwgMCwgMCwgMSwgMF0sXG4gICAgICAgICAgICBbMCwgMCwgMCwgMCwgMV1cbiAgICAgICAgXTtcbiAgICB9LFxuXG4gICAgYnJpZ2h0bmVzcyh2OiBudW1iZXIpIHtcbiAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgIFt2LCAwLCAwLCAwLCAwXSxcbiAgICAgICAgICAgIFswLCB2LCAwLCAwLCAwXSxcbiAgICAgICAgICAgIFswLCAwLCB2LCAwLCAwXSxcbiAgICAgICAgICAgIFswLCAwLCAwLCAxLCAwXSxcbiAgICAgICAgICAgIFswLCAwLCAwLCAwLCAxXVxuICAgICAgICBdO1xuICAgIH0sXG5cbiAgICBjb250cmFzdCh2OiBudW1iZXIpIHtcbiAgICAgICAgY29uc3QgdCA9ICgxIC0gdikgLyAyO1xuICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgW3YsIDAsIDAsIDAsIHRdLFxuICAgICAgICAgICAgWzAsIHYsIDAsIDAsIHRdLFxuICAgICAgICAgICAgWzAsIDAsIHYsIDAsIHRdLFxuICAgICAgICAgICAgWzAsIDAsIDAsIDEsIDBdLFxuICAgICAgICAgICAgWzAsIDAsIDAsIDAsIDFdXG4gICAgICAgIF07XG4gICAgfSxcblxuICAgIHNlcGlhKHY6IG51bWJlcikge1xuICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgWygwLjM5MyArIDAuNjA3ICogKDEgLSB2KSksICgwLjc2OSAtIDAuNzY5ICogKDEgLSB2KSksICgwLjE4OSAtIDAuMTg5ICogKDEgLSB2KSksIDAsIDBdLFxuICAgICAgICAgICAgWygwLjM0OSAtIDAuMzQ5ICogKDEgLSB2KSksICgwLjY4NiArIDAuMzE0ICogKDEgLSB2KSksICgwLjE2OCAtIDAuMTY4ICogKDEgLSB2KSksIDAsIDBdLFxuICAgICAgICAgICAgWygwLjI3MiAtIDAuMjcyICogKDEgLSB2KSksICgwLjUzNCAtIDAuNTM0ICogKDEgLSB2KSksICgwLjEzMSArIDAuODY5ICogKDEgLSB2KSksIDAsIDBdLFxuICAgICAgICAgICAgWzAsIDAsIDAsIDEsIDBdLFxuICAgICAgICAgICAgWzAsIDAsIDAsIDAsIDFdXG4gICAgICAgIF07XG4gICAgfSxcblxuICAgIGdyYXlzY2FsZSh2OiBudW1iZXIpIHtcbiAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgIFsoMC4yMTI2ICsgMC43ODc0ICogKDEgLSB2KSksICgwLjcxNTIgLSAwLjcxNTIgKiAoMSAtIHYpKSwgKDAuMDcyMiAtIDAuMDcyMiAqICgxIC0gdikpLCAwLCAwXSxcbiAgICAgICAgICAgIFsoMC4yMTI2IC0gMC4yMTI2ICogKDEgLSB2KSksICgwLjcxNTIgKyAwLjI4NDggKiAoMSAtIHYpKSwgKDAuMDcyMiAtIDAuMDcyMiAqICgxIC0gdikpLCAwLCAwXSxcbiAgICAgICAgICAgIFsoMC4yMTI2IC0gMC4yMTI2ICogKDEgLSB2KSksICgwLjcxNTIgLSAwLjcxNTIgKiAoMSAtIHYpKSwgKDAuMDcyMiArIDAuOTI3OCAqICgxIC0gdikpLCAwLCAwXSxcbiAgICAgICAgICAgIFswLCAwLCAwLCAxLCAwXSxcbiAgICAgICAgICAgIFswLCAwLCAwLCAwLCAxXVxuICAgICAgICBdO1xuICAgIH0sXG59O1xuIiwiaW1wb3J0IHtGaWx0ZXJDb25maWcsIFRoZW1lfSBmcm9tICcuLi9kZWZpbml0aW9ucyc7XG5pbXBvcnQge3BhcnNlLCByZ2JUb0hTTCwgaHNsVG9SR0IsIHJnYlRvU3RyaW5nLCByZ2JUb0hleFN0cmluZywgUkdCQSwgSFNMQX0gZnJvbSAnLi4vdXRpbHMvY29sb3InO1xuaW1wb3J0IHtzY2FsZX0gZnJvbSAnLi4vdXRpbHMvbWF0aCc7XG5pbXBvcnQge2FwcGx5Q29sb3JNYXRyaXgsIGNyZWF0ZUZpbHRlck1hdHJpeH0gZnJvbSAnLi91dGlscy9tYXRyaXgnO1xuXG5pbnRlcmZhY2UgQ29sb3JGdW5jdGlvbiB7XG4gICAgKGhzbDogSFNMQSk6IEhTTEE7XG59XG5cbmZ1bmN0aW9uIGdldEJnUG9sZSh0aGVtZTogVGhlbWUpIHtcbiAgICBjb25zdCBpc0RhcmtTY2hlbWUgPSB0aGVtZS5tb2RlID09PSAxO1xuICAgIGNvbnN0IHByb3A6IGtleW9mIFRoZW1lID0gaXNEYXJrU2NoZW1lID8gJ2RhcmtTY2hlbWVCYWNrZ3JvdW5kQ29sb3InIDogJ2xpZ2h0U2NoZW1lQmFja2dyb3VuZENvbG9yJztcbiAgICByZXR1cm4gdGhlbWVbcHJvcF07XG59XG5cbmZ1bmN0aW9uIGdldEZnUG9sZSh0aGVtZTogVGhlbWUpIHtcbiAgICBjb25zdCBpc0RhcmtTY2hlbWUgPSB0aGVtZS5tb2RlID09PSAxO1xuICAgIGNvbnN0IHByb3A6IGtleW9mIFRoZW1lID0gaXNEYXJrU2NoZW1lID8gJ2RhcmtTY2hlbWVUZXh0Q29sb3InIDogJ2xpZ2h0U2NoZW1lVGV4dENvbG9yJztcbiAgICByZXR1cm4gdGhlbWVbcHJvcF07XG59XG5cbmNvbnN0IGNvbG9yTW9kaWZpY2F0aW9uQ2FjaGUgPSBuZXcgTWFwPENvbG9yRnVuY3Rpb24sIE1hcDxzdHJpbmcsIHN0cmluZz4+KCk7XG5jb25zdCBjb2xvclBhcnNlQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgSFNMQT4oKTtcblxuZnVuY3Rpb24gcGFyc2VUb0hTTFdpdGhDYWNoZShjb2xvcjogc3RyaW5nKSB7XG4gICAgaWYgKGNvbG9yUGFyc2VDYWNoZS5oYXMoY29sb3IpKSB7XG4gICAgICAgIHJldHVybiBjb2xvclBhcnNlQ2FjaGUuZ2V0KGNvbG9yKTtcbiAgICB9XG4gICAgY29uc3QgcmdiID0gcGFyc2UoY29sb3IpO1xuICAgIGNvbnN0IGhzbCA9IHJnYlRvSFNMKHJnYik7XG4gICAgY29sb3JQYXJzZUNhY2hlLnNldChjb2xvciwgaHNsKTtcbiAgICByZXR1cm4gaHNsO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY2xlYXJDb2xvck1vZGlmaWNhdGlvbkNhY2hlKCkge1xuICAgIGNvbG9yTW9kaWZpY2F0aW9uQ2FjaGUuY2xlYXIoKTtcbiAgICBjb2xvclBhcnNlQ2FjaGUuY2xlYXIoKTtcbn1cblxuY29uc3QgcmdiQ2FjaGVLZXlzOiAoa2V5b2YgUkdCQSlbXSA9IFsncicsICdnJywgJ2InLCAnYSddO1xuY29uc3QgdGhlbWVDYWNoZUtleXM6IChrZXlvZiBUaGVtZSlbXSA9IFsnbW9kZScsICdicmlnaHRuZXNzJywgJ2NvbnRyYXN0JywgJ2dyYXlzY2FsZScsICdzZXBpYScsICdkYXJrU2NoZW1lQmFja2dyb3VuZENvbG9yJywgJ2RhcmtTY2hlbWVUZXh0Q29sb3InLCAnbGlnaHRTY2hlbWVCYWNrZ3JvdW5kQ29sb3InLCAnbGlnaHRTY2hlbWVUZXh0Q29sb3InXTtcblxuZnVuY3Rpb24gZ2V0Q2FjaGVJZChyZ2I6IFJHQkEsIHRoZW1lOiBUaGVtZSkge1xuICAgIHJldHVybiByZ2JDYWNoZUtleXMubWFwKChrKSA9PiByZ2Jba10gYXMgYW55KVxuICAgICAgICAuY29uY2F0KHRoZW1lQ2FjaGVLZXlzLm1hcCgoaykgPT4gdGhlbWVba10pKVxuICAgICAgICAuam9pbignOycpO1xufVxuXG5mdW5jdGlvbiBtb2RpZnlDb2xvcldpdGhDYWNoZShyZ2I6IFJHQkEsIHRoZW1lOiBUaGVtZSwgbW9kaWZ5SFNMOiAoaHNsOiBIU0xBLCBwb2xlPzogSFNMQSwgYW5vdGhlclBvbGU/OiBIU0xBKSA9PiBIU0xBLCBwb2xlQ29sb3I/OiBzdHJpbmcsIGFub3RoZXJQb2xlQ29sb3I/OiBzdHJpbmcpIHtcbiAgICBsZXQgZm5DYWNoZTogTWFwPHN0cmluZywgc3RyaW5nPjtcbiAgICBpZiAoY29sb3JNb2RpZmljYXRpb25DYWNoZS5oYXMobW9kaWZ5SFNMKSkge1xuICAgICAgICBmbkNhY2hlID0gY29sb3JNb2RpZmljYXRpb25DYWNoZS5nZXQobW9kaWZ5SFNMKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBmbkNhY2hlID0gbmV3IE1hcCgpO1xuICAgICAgICBjb2xvck1vZGlmaWNhdGlvbkNhY2hlLnNldChtb2RpZnlIU0wsIGZuQ2FjaGUpO1xuICAgIH1cbiAgICBjb25zdCBpZCA9IGdldENhY2hlSWQocmdiLCB0aGVtZSk7XG4gICAgaWYgKGZuQ2FjaGUuaGFzKGlkKSkge1xuICAgICAgICByZXR1cm4gZm5DYWNoZS5nZXQoaWQpO1xuICAgIH1cblxuICAgIGNvbnN0IGhzbCA9IHJnYlRvSFNMKHJnYik7XG4gICAgY29uc3QgcG9sZSA9IHBvbGVDb2xvciA9PSBudWxsID8gbnVsbCA6IHBhcnNlVG9IU0xXaXRoQ2FjaGUocG9sZUNvbG9yKTtcbiAgICBjb25zdCBhbm90aGVyUG9sZSA9IGFub3RoZXJQb2xlQ29sb3IgPT0gbnVsbCA/IG51bGwgOiBwYXJzZVRvSFNMV2l0aENhY2hlKGFub3RoZXJQb2xlQ29sb3IpO1xuICAgIGNvbnN0IG1vZGlmaWVkID0gbW9kaWZ5SFNMKGhzbCwgcG9sZSwgYW5vdGhlclBvbGUpO1xuICAgIGNvbnN0IHtyLCBnLCBiLCBhfSA9IGhzbFRvUkdCKG1vZGlmaWVkKTtcbiAgICBjb25zdCBtYXRyaXggPSBjcmVhdGVGaWx0ZXJNYXRyaXgodGhlbWUpO1xuICAgIGNvbnN0IFtyZiwgZ2YsIGJmXSA9IGFwcGx5Q29sb3JNYXRyaXgoW3IsIGcsIGJdLCBtYXRyaXgpO1xuXG4gICAgY29uc3QgY29sb3IgPSAoYSA9PT0gMSA/XG4gICAgICAgIHJnYlRvSGV4U3RyaW5nKHtyOiByZiwgZzogZ2YsIGI6IGJmfSkgOlxuICAgICAgICByZ2JUb1N0cmluZyh7cjogcmYsIGc6IGdmLCBiOiBiZiwgYX0pKTtcblxuICAgIGZuQ2FjaGUuc2V0KGlkLCBjb2xvcik7XG4gICAgcmV0dXJuIGNvbG9yO1xufVxuXG5mdW5jdGlvbiBub29wSFNMKGhzbDogSFNMQSkge1xuICAgIHJldHVybiBoc2w7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtb2RpZnlDb2xvcihyZ2I6IFJHQkEsIHRoZW1lOiBGaWx0ZXJDb25maWcpIHtcbiAgICByZXR1cm4gbW9kaWZ5Q29sb3JXaXRoQ2FjaGUocmdiLCB0aGVtZSwgbm9vcEhTTCk7XG59XG5cbmZ1bmN0aW9uIG1vZGlmeUxpZ2h0U2NoZW1lQ29sb3IocmdiOiBSR0JBLCB0aGVtZTogVGhlbWUpIHtcbiAgICBjb25zdCBwb2xlQmcgPSBnZXRCZ1BvbGUodGhlbWUpO1xuICAgIGNvbnN0IHBvbGVGZyA9IGdldEZnUG9sZSh0aGVtZSk7XG4gICAgcmV0dXJuIG1vZGlmeUNvbG9yV2l0aENhY2hlKHJnYiwgdGhlbWUsIG1vZGlmeUxpZ2h0TW9kZUhTTCwgcG9sZUZnLCBwb2xlQmcpO1xufVxuXG5mdW5jdGlvbiBtb2RpZnlMaWdodE1vZGVIU0woe2gsIHMsIGwsIGF9LCBwb2xlRmc6IEhTTEEsIHBvbGVCZzogSFNMQSkge1xuICAgIGNvbnN0IGlzRGFyayA9IGwgPCAwLjU7XG4gICAgbGV0IGlzTmV1dHJhbDogYm9vbGVhbjtcbiAgICBpZiAoaXNEYXJrKSB7XG4gICAgICAgIGlzTmV1dHJhbCA9IGwgPCAwLjIgfHwgcyA8IDAuMTI7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3QgaXNCbHVlID0gaCA+IDIwMCAmJiBoIDwgMjgwO1xuICAgICAgICBpc05ldXRyYWwgPSBzIDwgMC4yNCB8fCAobCA+IDAuOCAmJiBpc0JsdWUpO1xuICAgIH1cblxuICAgIGxldCBoeCA9IGg7XG4gICAgbGV0IHN4ID0gbDtcbiAgICBpZiAoaXNOZXV0cmFsKSB7XG4gICAgICAgIGlmIChpc0RhcmspIHtcbiAgICAgICAgICAgIGh4ID0gcG9sZUZnLmg7XG4gICAgICAgICAgICBzeCA9IHBvbGVGZy5zO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaHggPSBwb2xlQmcuaDtcbiAgICAgICAgICAgIHN4ID0gcG9sZUJnLnM7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBseCA9IHNjYWxlKGwsIDAsIDEsIHBvbGVGZy5sLCBwb2xlQmcubCk7XG5cbiAgICByZXR1cm4ge2g6IGh4LCBzOiBzeCwgbDogbHgsIGF9O1xufVxuXG5jb25zdCBNQVhfQkdfTElHSFRORVNTID0gMC40O1xuXG5mdW5jdGlvbiBtb2RpZnlCZ0hTTCh7aCwgcywgbCwgYX06IEhTTEEsIHBvbGU6IEhTTEEpIHtcbiAgICBjb25zdCBpc0RhcmsgPSBsIDwgMC41O1xuICAgIGNvbnN0IGlzQmx1ZSA9IGggPiAyMDAgJiYgaCA8IDI4MDtcbiAgICBjb25zdCBpc05ldXRyYWwgPSBzIDwgMC4xMiB8fCAobCA+IDAuOCAmJiBpc0JsdWUpO1xuICAgIGlmIChpc0RhcmspIHtcbiAgICAgICAgY29uc3QgbHggPSBzY2FsZShsLCAwLCAwLjUsIDAsIE1BWF9CR19MSUdIVE5FU1MpO1xuICAgICAgICBpZiAoaXNOZXV0cmFsKSB7XG4gICAgICAgICAgICBjb25zdCBoeCA9IHBvbGUuaDtcbiAgICAgICAgICAgIGNvbnN0IHN4ID0gcG9sZS5zO1xuICAgICAgICAgICAgcmV0dXJuIHtoOiBoeCwgczogc3gsIGw6IGx4LCBhfTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4ge2gsIHMsIGw6IGx4LCBhfTtcbiAgICB9XG5cbiAgICBjb25zdCBseCA9IHNjYWxlKGwsIDAuNSwgMSwgTUFYX0JHX0xJR0hUTkVTUywgcG9sZS5sKTtcblxuICAgIGlmIChpc05ldXRyYWwpIHtcbiAgICAgICAgY29uc3QgaHggPSBwb2xlLmg7XG4gICAgICAgIGNvbnN0IHN4ID0gcG9sZS5zO1xuICAgICAgICByZXR1cm4ge2g6IGh4LCBzOiBzeCwgbDogbHgsIGF9O1xuICAgIH1cblxuICAgIGxldCBoeCA9IGg7XG4gICAgY29uc3QgaXNZZWxsb3cgPSBoID4gNjAgJiYgaCA8IDE4MDtcbiAgICBpZiAoaXNZZWxsb3cpIHtcbiAgICAgICAgY29uc3QgaXNDbG9zZXJUb0dyZWVuID0gaCA+IDEyMDtcbiAgICAgICAgaWYgKGlzQ2xvc2VyVG9HcmVlbikge1xuICAgICAgICAgICAgaHggPSBzY2FsZShoLCAxMjAsIDE4MCwgMTM1LCAxODApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaHggPSBzY2FsZShoLCA2MCwgMTIwLCA2MCwgMTA1KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB7aDogaHgsIHMsIGw6IGx4LCBhfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1vZGlmeUJhY2tncm91bmRDb2xvcihyZ2I6IFJHQkEsIHRoZW1lOiBUaGVtZSkge1xuICAgIGlmICh0aGVtZS5tb2RlID09PSAwKSB7XG4gICAgICAgIHJldHVybiBtb2RpZnlMaWdodFNjaGVtZUNvbG9yKHJnYiwgdGhlbWUpO1xuICAgIH1cbiAgICBjb25zdCBwb2xlID0gZ2V0QmdQb2xlKHRoZW1lKTtcbiAgICByZXR1cm4gbW9kaWZ5Q29sb3JXaXRoQ2FjaGUocmdiLCB7Li4udGhlbWUsIG1vZGU6IDB9LCBtb2RpZnlCZ0hTTCwgcG9sZSk7XG59XG5cbmNvbnN0IE1JTl9GR19MSUdIVE5FU1MgPSAwLjU1O1xuXG5mdW5jdGlvbiBtb2RpZnlCbHVlRmdIdWUoaHVlOiBudW1iZXIpIHtcbiAgICByZXR1cm4gc2NhbGUoaHVlLCAyMDUsIDI0NSwgMjA1LCAyMjApO1xufVxuXG5mdW5jdGlvbiBtb2RpZnlGZ0hTTCh7aCwgcywgbCwgYX06IEhTTEEsIHBvbGU6IEhTTEEpIHtcbiAgICBjb25zdCBpc0xpZ2h0ID0gbCA+IDAuNTtcbiAgICBjb25zdCBpc05ldXRyYWwgPSBsIDwgMC4yIHx8IHMgPCAwLjI0O1xuICAgIGNvbnN0IGlzQmx1ZSA9ICFpc05ldXRyYWwgJiYgaCA+IDIwNSAmJiBoIDwgMjQ1O1xuICAgIGlmIChpc0xpZ2h0KSB7XG4gICAgICAgIGNvbnN0IGx4ID0gc2NhbGUobCwgMC41LCAxLCBNSU5fRkdfTElHSFRORVNTLCBwb2xlLmwpO1xuICAgICAgICBpZiAoaXNOZXV0cmFsKSB7XG4gICAgICAgICAgICBjb25zdCBoeCA9IHBvbGUuaDtcbiAgICAgICAgICAgIGNvbnN0IHN4ID0gcG9sZS5zO1xuICAgICAgICAgICAgcmV0dXJuIHtoOiBoeCwgczogc3gsIGw6IGx4LCBhfTtcbiAgICAgICAgfVxuICAgICAgICBsZXQgaHggPSBoO1xuICAgICAgICBpZiAoaXNCbHVlKSB7XG4gICAgICAgICAgICBoeCA9IG1vZGlmeUJsdWVGZ0h1ZShoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4ge2g6IGh4LCBzLCBsOiBseCwgYX07XG4gICAgfVxuXG4gICAgaWYgKGlzTmV1dHJhbCkge1xuICAgICAgICBjb25zdCBoeCA9IHBvbGUuaDtcbiAgICAgICAgY29uc3Qgc3ggPSBwb2xlLnM7XG4gICAgICAgIGNvbnN0IGx4ID0gc2NhbGUobCwgMCwgMC41LCBwb2xlLmwsIE1JTl9GR19MSUdIVE5FU1MpO1xuICAgICAgICByZXR1cm4ge2g6IGh4LCBzOiBzeCwgbDogbHgsIGF9O1xuICAgIH1cblxuICAgIGxldCBoeCA9IGg7XG4gICAgbGV0IGx4ID0gbDtcbiAgICBpZiAoaXNCbHVlKSB7XG4gICAgICAgIGh4ID0gbW9kaWZ5Qmx1ZUZnSHVlKGgpO1xuICAgICAgICBseCA9IHNjYWxlKGwsIDAsIDAuNSwgcG9sZS5sLCBNYXRoLm1pbigxLCBNSU5fRkdfTElHSFRORVNTICsgMC4wNSkpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIGx4ID0gc2NhbGUobCwgMCwgMC41LCBwb2xlLmwsIE1JTl9GR19MSUdIVE5FU1MpO1xuICAgIH1cblxuICAgIHJldHVybiB7aDogaHgsIHMsIGw6IGx4LCBhfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1vZGlmeUZvcmVncm91bmRDb2xvcihyZ2I6IFJHQkEsIHRoZW1lOiBUaGVtZSkge1xuICAgIGlmICh0aGVtZS5tb2RlID09PSAwKSB7XG4gICAgICAgIHJldHVybiBtb2RpZnlMaWdodFNjaGVtZUNvbG9yKHJnYiwgdGhlbWUpO1xuICAgIH1cbiAgICBjb25zdCBwb2xlID0gZ2V0RmdQb2xlKHRoZW1lKTtcbiAgICByZXR1cm4gbW9kaWZ5Q29sb3JXaXRoQ2FjaGUocmdiLCB7Li4udGhlbWUsIG1vZGU6IDB9LCBtb2RpZnlGZ0hTTCwgcG9sZSk7XG59XG5cbmZ1bmN0aW9uIG1vZGlmeUJvcmRlckhTTCh7aCwgcywgbCwgYX0sIHBvbGVGZzogSFNMQSwgcG9sZUJnOiBIU0xBKSB7XG4gICAgY29uc3QgaXNEYXJrID0gbCA8IDAuNTtcbiAgICBjb25zdCBpc05ldXRyYWwgPSBsIDwgMC4yIHx8IHMgPCAwLjI0O1xuXG4gICAgbGV0IGh4ID0gaDtcbiAgICBsZXQgc3ggPSBzO1xuXG4gICAgaWYgKGlzTmV1dHJhbCkge1xuICAgICAgICBpZiAoaXNEYXJrKSB7XG4gICAgICAgICAgICBoeCA9IHBvbGVGZy5oO1xuICAgICAgICAgICAgc3ggPSBwb2xlRmcucztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGh4ID0gcG9sZUJnLmg7XG4gICAgICAgICAgICBzeCA9IHBvbGVCZy5zO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgbHggPSBzY2FsZShsLCAwLCAxLCAwLjUsIDAuMik7XG5cbiAgICByZXR1cm4ge2g6IGh4LCBzOiBzeCwgbDogbHgsIGF9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbW9kaWZ5Qm9yZGVyQ29sb3IocmdiOiBSR0JBLCB0aGVtZTogVGhlbWUpIHtcbiAgICBpZiAodGhlbWUubW9kZSA9PT0gMCkge1xuICAgICAgICByZXR1cm4gbW9kaWZ5TGlnaHRTY2hlbWVDb2xvcihyZ2IsIHRoZW1lKTtcbiAgICB9XG4gICAgY29uc3QgcG9sZUZnID0gZ2V0RmdQb2xlKHRoZW1lKTtcbiAgICBjb25zdCBwb2xlQmcgPSBnZXRCZ1BvbGUodGhlbWUpO1xuICAgIHJldHVybiBtb2RpZnlDb2xvcldpdGhDYWNoZShyZ2IsIHsuLi50aGVtZSwgbW9kZTogMH0sIG1vZGlmeUJvcmRlckhTTCwgcG9sZUZnLCBwb2xlQmcpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbW9kaWZ5U2hhZG93Q29sb3IocmdiOiBSR0JBLCBmaWx0ZXI6IEZpbHRlckNvbmZpZykge1xuICAgIHJldHVybiBtb2RpZnlCYWNrZ3JvdW5kQ29sb3IocmdiLCBmaWx0ZXIpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbW9kaWZ5R3JhZGllbnRDb2xvcihyZ2I6IFJHQkEsIGZpbHRlcjogRmlsdGVyQ29uZmlnKSB7XG4gICAgcmV0dXJuIG1vZGlmeUJhY2tncm91bmRDb2xvcihyZ2IsIGZpbHRlcik7XG59XG4iLCJleHBvcnQgZnVuY3Rpb24gaXNDaHJvbWl1bUJhc2VkKCkge1xuICAgIHJldHVybiBuYXZpZ2F0b3IudXNlckFnZW50LnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ2Nocm9tZScpIHx8IG5hdmlnYXRvci51c2VyQWdlbnQudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnY2hyb21pdW0nKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzRmlyZWZveCgpIHtcbiAgICByZXR1cm4gbmF2aWdhdG9yLnVzZXJBZ2VudC5pbmNsdWRlcygnRmlyZWZveCcpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNWaXZhbGRpKCkge1xuICAgIHJldHVybiBuYXZpZ2F0b3IudXNlckFnZW50LnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ3ZpdmFsZGknKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzWWFCcm93c2VyKCkge1xuICAgIHJldHVybiBuYXZpZ2F0b3IudXNlckFnZW50LnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ3lhYnJvd3NlcicpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNPcGVyYSgpIHtcbiAgICBjb25zdCBhZ2VudCA9IG5hdmlnYXRvci51c2VyQWdlbnQudG9Mb3dlckNhc2UoKTtcbiAgICByZXR1cm4gYWdlbnQuaW5jbHVkZXMoJ29wcicpIHx8IGFnZW50LmluY2x1ZGVzKCdvcGVyYScpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNFZGdlKCkge1xuICAgIHJldHVybiBuYXZpZ2F0b3IudXNlckFnZW50LmluY2x1ZGVzKCdFZGcnKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzV2luZG93cygpIHtcbiAgICBpZiAodHlwZW9mIG5hdmlnYXRvciA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIHJldHVybiBuYXZpZ2F0b3IucGxhdGZvcm0udG9Mb3dlckNhc2UoKS5zdGFydHNXaXRoKCd3aW4nKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzTWFjT1MoKSB7XG4gICAgaWYgKHR5cGVvZiBuYXZpZ2F0b3IgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICByZXR1cm4gbmF2aWdhdG9yLnBsYXRmb3JtLnRvTG93ZXJDYXNlKCkuc3RhcnRzV2l0aCgnbWFjJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc01vYmlsZSgpIHtcbiAgICBpZiAodHlwZW9mIG5hdmlnYXRvciA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIHJldHVybiBuYXZpZ2F0b3IudXNlckFnZW50LnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ21vYmlsZScpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q2hyb21lVmVyc2lvbigpIHtcbiAgICBjb25zdCBhZ2VudCA9IG5hdmlnYXRvci51c2VyQWdlbnQudG9Mb3dlckNhc2UoKTtcbiAgICBjb25zdCBtID0gYWdlbnQubWF0Y2goL2Nocm9tW2V8aXVtXVxcLyhbXiBdKykvKTtcbiAgICBpZiAobSAmJiBtWzFdKSB7XG4gICAgICAgIHJldHVybiBtWzFdO1xuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNvbXBhcmVDaHJvbWVWZXJzaW9ucygkYTogc3RyaW5nLCAkYjogc3RyaW5nKSB7XG4gICAgY29uc3QgYSA9ICRhLnNwbGl0KCcuJykubWFwKCh4KSA9PiBwYXJzZUludCh4KSk7XG4gICAgY29uc3QgYiA9ICRiLnNwbGl0KCcuJykubWFwKCh4KSA9PiBwYXJzZUludCh4KSk7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmIChhW2ldICE9PSBiW2ldKSB7XG4gICAgICAgICAgICByZXR1cm4gYVtpXSA8IGJbaV0gPyAtMSA6IDE7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIDA7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0RlZmluZWRTZWxlY3RvclN1cHBvcnRlZCgpIHtcbiAgICB0cnkge1xuICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCc6ZGVmaW5lZCcpO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbn1cblxuZXhwb3J0IGNvbnN0IElTX1NIQURPV19ET01fU1VQUE9SVEVEID0gdHlwZW9mIFNoYWRvd1Jvb3QgPT09ICdmdW5jdGlvbic7XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0NTU1N0eWxlU2hlZXRDb25zdHJ1Y3RvclN1cHBvcnRlZCgpIHtcbiAgICB0cnkge1xuICAgICAgICBuZXcgQ1NTU3R5bGVTaGVldCgpO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbn1cbiIsImltcG9ydCB7VXNlclNldHRpbmdzfSBmcm9tICcuLi9kZWZpbml0aW9ucyc7XG5pbXBvcnQge2lzSVBWNiwgY29tcGFyZUlQVjZ9IGZyb20gJy4vaXB2Nic7XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRVUkxIb3N0T3JQcm90b2NvbCgkdXJsOiBzdHJpbmcpIHtcbiAgICBjb25zdCB1cmwgPSBuZXcgVVJMKCR1cmwpO1xuICAgIGlmICh1cmwuaG9zdCkge1xuICAgICAgICByZXR1cm4gdXJsLmhvc3Q7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHVybC5wcm90b2NvbDtcbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjb21wYXJlVVJMUGF0dGVybnMoYTogc3RyaW5nLCBiOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gYS5sb2NhbGVDb21wYXJlKGIpO1xufVxuXG4vKipcbiAqIERldGVybWluZXMgd2hldGhlciBVUkwgaGFzIGEgbWF0Y2ggaW4gVVJMIHRlbXBsYXRlIGxpc3QuXG4gKiBAcGFyYW0gdXJsIFNpdGUgVVJMLlxuICogQHBhcmFtbGlzdCBMaXN0IHRvIHNlYXJjaCBpbnRvLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaXNVUkxJbkxpc3QodXJsOiBzdHJpbmcsIGxpc3Q6IHN0cmluZ1tdKSB7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBsaXN0Lmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmIChpc1VSTE1hdGNoZWQodXJsLCBsaXN0W2ldKSkge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xufVxuXG4vKipcbiAqIERldGVybWluZXMgd2hldGhlciBVUkwgbWF0Y2hlcyB0aGUgdGVtcGxhdGUuXG4gKiBAcGFyYW0gdXJsIFVSTC5cbiAqIEBwYXJhbSB1cmxUZW1wbGF0ZSBVUkwgdGVtcGxhdGUgKFwiZ29vZ2xlLipcIiwgXCJ5b3V0dWJlLmNvbVwiIGV0YykuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc1VSTE1hdGNoZWQodXJsOiBzdHJpbmcsIHVybFRlbXBsYXRlOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICBjb25zdCBpc0ZpcnN0SVBWNiA9IGlzSVBWNih1cmwpO1xuICAgIGNvbnN0IGlzU2Vjb25kSVBWNiA9IGlzSVBWNih1cmxUZW1wbGF0ZSk7XG4gICAgaWYgKGlzRmlyc3RJUFY2ICYmIGlzU2Vjb25kSVBWNikge1xuICAgICAgICByZXR1cm4gY29tcGFyZUlQVjYodXJsLCB1cmxUZW1wbGF0ZSk7XG4gICAgfSBlbHNlIGlmICghaXNTZWNvbmRJUFY2ICYmICFpc1NlY29uZElQVjYpIHtcbiAgICAgICAgY29uc3QgcmVnZXggPSBjcmVhdGVVcmxSZWdleCh1cmxUZW1wbGF0ZSk7XG4gICAgICAgIHJldHVybiBCb29sZWFuKHVybC5tYXRjaChyZWdleCkpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVVybFJlZ2V4KHVybFRlbXBsYXRlOiBzdHJpbmcpOiBSZWdFeHAge1xuICAgIHVybFRlbXBsYXRlID0gdXJsVGVtcGxhdGUudHJpbSgpO1xuICAgIGNvbnN0IGV4YWN0QmVnaW5uaW5nID0gKHVybFRlbXBsYXRlWzBdID09PSAnXicpO1xuICAgIGNvbnN0IGV4YWN0RW5kaW5nID0gKHVybFRlbXBsYXRlW3VybFRlbXBsYXRlLmxlbmd0aCAtIDFdID09PSAnJCcpO1xuXG4gICAgdXJsVGVtcGxhdGUgPSAodXJsVGVtcGxhdGVcbiAgICAgICAgLnJlcGxhY2UoL15cXF4vLCAnJykgLy8gUmVtb3ZlIF4gYXQgc3RhcnRcbiAgICAgICAgLnJlcGxhY2UoL1xcJCQvLCAnJykgLy8gUmVtb3ZlICQgYXQgZW5kXG4gICAgICAgIC5yZXBsYWNlKC9eLio/XFwvezIsM30vLCAnJykgLy8gUmVtb3ZlIHNjaGVtZVxuICAgICAgICAucmVwbGFjZSgvXFw/LiokLywgJycpIC8vIFJlbW92ZSBxdWVyeVxuICAgICAgICAucmVwbGFjZSgvXFwvJC8sICcnKSAvLyBSZW1vdmUgbGFzdCBzbGFzaFxuICAgICk7XG5cbiAgICBsZXQgc2xhc2hJbmRleDogbnVtYmVyO1xuICAgIGxldCBiZWZvcmVTbGFzaDogc3RyaW5nO1xuICAgIGxldCBhZnRlclNsYXNoOiBzdHJpbmc7XG4gICAgaWYgKChzbGFzaEluZGV4ID0gdXJsVGVtcGxhdGUuaW5kZXhPZignLycpKSA+PSAwKSB7XG4gICAgICAgIGJlZm9yZVNsYXNoID0gdXJsVGVtcGxhdGUuc3Vic3RyaW5nKDAsIHNsYXNoSW5kZXgpOyAvLyBnb29nbGUuKlxuICAgICAgICBhZnRlclNsYXNoID0gdXJsVGVtcGxhdGUucmVwbGFjZSgnJCcsICcnKS5zdWJzdHJpbmcoc2xhc2hJbmRleCk7IC8vIC9sb2dpbi9hYmNcbiAgICB9IGVsc2Uge1xuICAgICAgICBiZWZvcmVTbGFzaCA9IHVybFRlbXBsYXRlLnJlcGxhY2UoJyQnLCAnJyk7XG4gICAgfVxuXG4gICAgLy9cbiAgICAvLyBTQ0hFTUUgYW5kIFNVQkRPTUFJTlNcblxuICAgIGxldCByZXN1bHQgPSAoZXhhY3RCZWdpbm5pbmcgP1xuICAgICAgICAnXiguKj9cXFxcOlxcXFwvezIsM30pPycgLy8gU2NoZW1lXG4gICAgICAgIDogJ14oLio/XFxcXDpcXFxcL3syLDN9KT8oW15cXC9dKj9cXFxcLik/JyAvLyBTY2hlbWUgYW5kIHN1YmRvbWFpbnNcbiAgICApO1xuXG4gICAgLy9cbiAgICAvLyBIT1NUIGFuZCBQT1JUXG5cbiAgICBjb25zdCBob3N0UGFydHMgPSBiZWZvcmVTbGFzaC5zcGxpdCgnLicpO1xuICAgIHJlc3VsdCArPSAnKCc7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBob3N0UGFydHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKGhvc3RQYXJ0c1tpXSA9PT0gJyonKSB7XG4gICAgICAgICAgICBob3N0UGFydHNbaV0gPSAnW15cXFxcLlxcXFwvXSs/JztcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXN1bHQgKz0gaG9zdFBhcnRzLmpvaW4oJ1xcXFwuJyk7XG4gICAgcmVzdWx0ICs9ICcpJztcblxuICAgIC8vXG4gICAgLy8gUEFUSCBhbmQgUVVFUllcblxuICAgIGlmIChhZnRlclNsYXNoKSB7XG4gICAgICAgIHJlc3VsdCArPSAnKCc7XG4gICAgICAgIHJlc3VsdCArPSBhZnRlclNsYXNoLnJlcGxhY2UoJy8nLCAnXFxcXC8nKTtcbiAgICAgICAgcmVzdWx0ICs9ICcpJztcbiAgICB9XG5cbiAgICByZXN1bHQgKz0gKGV4YWN0RW5kaW5nID9cbiAgICAgICAgJyhcXFxcLz8oXFxcXD9bXlxcL10qPyk/KSQnIC8vIEFsbCBmb2xsb3dpbmcgcXVlcmllc1xuICAgICAgICA6ICcoXFxcXC8/Lio/KSQnIC8vIEFsbCBmb2xsb3dpbmcgcGF0aHMgYW5kIHF1ZXJpZXNcbiAgICApO1xuXG4gICAgLy9cbiAgICAvLyBSZXN1bHRcblxuICAgIHJldHVybiBuZXcgUmVnRXhwKHJlc3VsdCwgJ2knKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzUERGKHVybDogc3RyaW5nKSB7XG4gICAgaWYgKHVybC5pbmNsdWRlcygnLnBkZicpKSB7XG4gICAgICAgIGlmICh1cmwuaW5jbHVkZXMoJz8nKSkge1xuICAgICAgICAgICAgdXJsID0gdXJsLnN1YnN0cmluZygwLCB1cmwubGFzdEluZGV4T2YoJz8nKSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHVybC5pbmNsdWRlcygnIycpKSB7XG4gICAgICAgICAgICB1cmwgPSB1cmwuc3Vic3RyaW5nKDAsIHVybC5sYXN0SW5kZXhPZignIycpKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodXJsLm1hdGNoKC8od2lraXBlZGlhfHdpa2ltZWRpYSkub3JnL2kpICYmIHVybC5tYXRjaCgvKHdpa2lwZWRpYXx3aWtpbWVkaWEpXFwub3JnXFwvLipcXC9bYS16XStcXDpbXlxcOlxcL10rXFwucGRmL2kpKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHVybC5lbmRzV2l0aCgnLnBkZicpKSB7XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gdXJsLmxlbmd0aDsgMCA8IGk7IGktLSkge1xuICAgICAgICAgICAgICAgIGlmICh1cmxbaV0gPT09ICc9Jykge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICh1cmxbaV0gPT09ICcvJykge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNVUkxFbmFibGVkKHVybDogc3RyaW5nLCB1c2VyU2V0dGluZ3M6IFVzZXJTZXR0aW5ncywge2lzUHJvdGVjdGVkLCBpc0luRGFya0xpc3R9KSB7XG4gICAgaWYgKGlzUHJvdGVjdGVkICYmICF1c2VyU2V0dGluZ3MuZW5hYmxlRm9yUHJvdGVjdGVkUGFnZXMpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBpZiAoaXNQREYodXJsKSkge1xuICAgICAgICByZXR1cm4gdXNlclNldHRpbmdzLmVuYWJsZUZvclBERjtcbiAgICB9XG4gICAgY29uc3QgaXNVUkxJblVzZXJMaXN0ID0gaXNVUkxJbkxpc3QodXJsLCB1c2VyU2V0dGluZ3Muc2l0ZUxpc3QpO1xuICAgIGlmICh1c2VyU2V0dGluZ3MuYXBwbHlUb0xpc3RlZE9ubHkpIHtcbiAgICAgICAgcmV0dXJuIGlzVVJMSW5Vc2VyTGlzdDtcbiAgICB9XG4gICAgLy8gVE9ETzogVXNlIGBzaXRlTGlzdEVuYWJsZWRgLCBgc2l0ZUxpc3REaXNhYmxlZGAsIGBlbmFibGVkQnlEZWZhdWx0YCBvcHRpb25zLlxuICAgIC8vIERlbGV0ZSBgc2l0ZUxpc3RgIGFuZCBgYXBwbHlUb0xpc3RlZE9ubHlgIG9wdGlvbnMsIHRyYW5zZmVyIHVzZXIncyB2YWx1ZXMuXG4gICAgY29uc3QgaXNVUkxJbkVuYWJsZWRMaXN0ID0gaXNVUkxJbkxpc3QodXJsLCB1c2VyU2V0dGluZ3Muc2l0ZUxpc3RFbmFibGVkKTtcbiAgICBpZiAoaXNVUkxJbkVuYWJsZWRMaXN0ICYmIGlzSW5EYXJrTGlzdCkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuICghaXNJbkRhcmtMaXN0ICYmICFpc1VSTEluVXNlckxpc3QpO1xufVxuIiwiaW1wb3J0IHtGaWx0ZXJDb25maWd9IGZyb20gJy4uL2RlZmluaXRpb25zJztcblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVRleHRTdHlsZShjb25maWc6IEZpbHRlckNvbmZpZyk6IHN0cmluZyB7XG4gICAgY29uc3QgbGluZXM6IHN0cmluZ1tdID0gW107XG4gICAgLy8gRG9uJ3QgdGFyZ2V0IHByZSBlbGVtZW50cyBhcyB0aGV5IGFyZSBwcmVmb3JtYXR0ZWQgZWxlbWVudCdzIGUuZy4gY29kZSBibG9ja3NcbiAgICBsaW5lcy5wdXNoKCcqOm5vdChwcmUpIHsnKTtcblxuICAgIGlmIChjb25maWcudXNlRm9udCAmJiBjb25maWcuZm9udEZhbWlseSkge1xuICAgICAgICAvLyBUT0RPOiBWYWxpZGF0ZS4uLlxuICAgICAgICBsaW5lcy5wdXNoKGAgIGZvbnQtZmFtaWx5OiAke2NvbmZpZy5mb250RmFtaWx5fSAhaW1wb3J0YW50O2ApO1xuICAgIH1cblxuICAgIGlmIChjb25maWcudGV4dFN0cm9rZSA+IDApIHtcbiAgICAgICAgbGluZXMucHVzaChgICAtd2Via2l0LXRleHQtc3Ryb2tlOiAke2NvbmZpZy50ZXh0U3Ryb2tlfXB4ICFpbXBvcnRhbnQ7YCk7XG4gICAgICAgIGxpbmVzLnB1c2goYCAgdGV4dC1zdHJva2U6ICR7Y29uZmlnLnRleHRTdHJva2V9cHggIWltcG9ydGFudDtgKTtcbiAgICB9XG5cbiAgICBsaW5lcy5wdXNoKCd9Jyk7XG5cbiAgICByZXR1cm4gbGluZXMuam9pbignXFxuJyk7XG59XG4iLCJpbXBvcnQge2Zvcm1hdFNpdGVzRml4ZXNDb25maWd9IGZyb20gJy4vdXRpbHMvZm9ybWF0JztcbmltcG9ydCB7YXBwbHlDb2xvck1hdHJpeCwgY3JlYXRlRmlsdGVyTWF0cml4fSBmcm9tICcuL3V0aWxzL21hdHJpeCc7XG5pbXBvcnQge3BhcnNlU2l0ZXNGaXhlc0NvbmZpZ30gZnJvbSAnLi91dGlscy9wYXJzZSc7XG5pbXBvcnQge3BhcnNlQXJyYXksIGZvcm1hdEFycmF5fSBmcm9tICcuLi91dGlscy90ZXh0JztcbmltcG9ydCB7Y29tcGFyZVVSTFBhdHRlcm5zLCBpc1VSTEluTGlzdH0gZnJvbSAnLi4vdXRpbHMvdXJsJztcbmltcG9ydCB7Y3JlYXRlVGV4dFN0eWxlfSBmcm9tICcuL3RleHQtc3R5bGUnO1xuaW1wb3J0IHtGaWx0ZXJDb25maWcsIEludmVyc2lvbkZpeH0gZnJvbSAnLi4vZGVmaW5pdGlvbnMnO1xuaW1wb3J0IHtjb21wYXJlQ2hyb21lVmVyc2lvbnMsIGdldENocm9tZVZlcnNpb24sIGlzQ2hyb21pdW1CYXNlZH0gZnJvbSAnLi4vdXRpbHMvcGxhdGZvcm0nO1xuXG5leHBvcnQgZW51bSBGaWx0ZXJNb2RlIHtcbiAgICBsaWdodCA9IDAsXG4gICAgZGFyayA9IDFcbn1cblxuLyoqXG4gKiBUaGlzIGNoZWNrcyBpZiB0aGUgY3VycmVudCBjaHJvbWl1bSB2ZXJzaW9uIGhhcyB0aGUgcGF0Y2ggaW4gaXQuXG4gKiBBcyBvZiBDaHJvbWl1bSB2ODEuMC40MDM1LjAgdGhpcyBoYXMgYmVlbiB0aGUgc2l0dWF0aW9uXG4gKlxuICogQnVnIHJlcG9ydDogaHR0cHM6Ly9idWdzLmNocm9taXVtLm9yZy9wL2Nocm9taXVtL2lzc3Vlcy9kZXRhaWw/aWQ9NTAxNTgyXG4gKiBQYXRjaDogaHR0cHM6Ly9jaHJvbWl1bS1yZXZpZXcuZ29vZ2xlc291cmNlLmNvbS9jL2Nocm9taXVtL3NyYy8rLzE5NzkyNThcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGhhc0Nocm9taXVtSXNzdWU1MDE1ODIoKSB7XG4gICAgY29uc3QgY2hyb21lVmVyc2lvbiA9IGdldENocm9tZVZlcnNpb24oKTtcbiAgICByZXR1cm4gQm9vbGVhbihcbiAgICAgICAgaXNDaHJvbWl1bUJhc2VkKCkgJiZcbiAgICAgICAgY29tcGFyZUNocm9tZVZlcnNpb25zKGNocm9tZVZlcnNpb24sICc4MS4wLjQwMzUuMCcpID49IDBcbiAgICApO1xufVxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBjcmVhdGVDU1NGaWx0ZXJTdHlsZWhlZXQoY29uZmlnOiBGaWx0ZXJDb25maWcsIHVybDogc3RyaW5nLCBmcmFtZVVSTDogc3RyaW5nLCBpbnZlcnNpb25GaXhlczogSW52ZXJzaW9uRml4W10pIHtcbiAgICBjb25zdCBmaWx0ZXJWYWx1ZSA9IGdldENTU0ZpbHRlclZhbHVlKGNvbmZpZyk7XG4gICAgY29uc3QgcmV2ZXJzZUZpbHRlclZhbHVlID0gJ2ludmVydCgxMDAlKSBodWUtcm90YXRlKDE4MGRlZyknO1xuICAgIHJldHVybiBjc3NGaWx0ZXJTdHlsZWhlZXRUZW1wbGF0ZShmaWx0ZXJWYWx1ZSwgcmV2ZXJzZUZpbHRlclZhbHVlLCBjb25maWcsIHVybCwgZnJhbWVVUkwsIGludmVyc2lvbkZpeGVzKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNzc0ZpbHRlclN0eWxlaGVldFRlbXBsYXRlKGZpbHRlclZhbHVlOiBzdHJpbmcsIHJldmVyc2VGaWx0ZXJWYWx1ZTogc3RyaW5nLCBjb25maWc6IEZpbHRlckNvbmZpZywgdXJsOiBzdHJpbmcsIGZyYW1lVVJMOiBzdHJpbmcsIGludmVyc2lvbkZpeGVzOiBJbnZlcnNpb25GaXhbXSkge1xuICAgIGNvbnN0IGZpeCA9IGdldEludmVyc2lvbkZpeGVzRm9yKGZyYW1lVVJMIHx8IHVybCwgaW52ZXJzaW9uRml4ZXMpO1xuXG4gICAgY29uc3QgbGluZXM6IHN0cmluZ1tdID0gW107XG5cbiAgICBsaW5lcy5wdXNoKCdAbWVkaWEgc2NyZWVuIHsnKTtcblxuICAgIC8vIEFkZCBsZWFkaW5nIHJ1bGVcbiAgICBpZiAoZmlsdGVyVmFsdWUgJiYgIWZyYW1lVVJMKSB7XG4gICAgICAgIGxpbmVzLnB1c2goJycpO1xuICAgICAgICBsaW5lcy5wdXNoKCcvKiBMZWFkaW5nIHJ1bGUgKi8nKTtcbiAgICAgICAgbGluZXMucHVzaChjcmVhdGVMZWFkaW5nUnVsZShmaWx0ZXJWYWx1ZSkpO1xuICAgIH1cblxuICAgIGlmIChjb25maWcubW9kZSA9PT0gRmlsdGVyTW9kZS5kYXJrKSB7XG4gICAgICAgIC8vIEFkZCByZXZlcnNlIHJ1bGVcbiAgICAgICAgbGluZXMucHVzaCgnJyk7XG4gICAgICAgIGxpbmVzLnB1c2goJy8qIFJldmVyc2UgcnVsZSAqLycpO1xuICAgICAgICBsaW5lcy5wdXNoKGNyZWF0ZVJldmVyc2VSdWxlKHJldmVyc2VGaWx0ZXJWYWx1ZSwgZml4KSk7XG4gICAgfVxuXG4gICAgaWYgKGNvbmZpZy51c2VGb250IHx8IGNvbmZpZy50ZXh0U3Ryb2tlID4gMCkge1xuICAgICAgICAvLyBBZGQgdGV4dCBydWxlXG4gICAgICAgIGxpbmVzLnB1c2goJycpO1xuICAgICAgICBsaW5lcy5wdXNoKCcvKiBGb250ICovJyk7XG4gICAgICAgIGxpbmVzLnB1c2goY3JlYXRlVGV4dFN0eWxlKGNvbmZpZykpO1xuICAgIH1cblxuICAgIC8vIEZpeCBiYWQgZm9udCBoaW50aW5nIGFmdGVyIGludmVyc2lvblxuICAgIGxpbmVzLnB1c2goJycpO1xuICAgIGxpbmVzLnB1c2goJy8qIFRleHQgY29udHJhc3QgKi8nKTtcbiAgICBsaW5lcy5wdXNoKCdodG1sIHsnKTtcbiAgICBsaW5lcy5wdXNoKCcgIHRleHQtc2hhZG93OiAwIDAgMCAhaW1wb3J0YW50OycpO1xuICAgIGxpbmVzLnB1c2goJ30nKTtcblxuICAgIC8vIEZ1bGwgc2NyZWVuIGZpeFxuICAgIGxpbmVzLnB1c2goJycpO1xuICAgIGxpbmVzLnB1c2goJy8qIEZ1bGwgc2NyZWVuICovJyk7XG4gICAgWyc6LXdlYmtpdC1mdWxsLXNjcmVlbicsICc6LW1vei1mdWxsLXNjcmVlbicsICc6ZnVsbHNjcmVlbiddLmZvckVhY2goKGZ1bGxTY3JlZW4pID0+IHtcbiAgICAgICAgbGluZXMucHVzaChgJHtmdWxsU2NyZWVufSwgJHtmdWxsU2NyZWVufSAqIHtgKTtcbiAgICAgICAgbGluZXMucHVzaCgnICAtd2Via2l0LWZpbHRlcjogbm9uZSAhaW1wb3J0YW50OycpO1xuICAgICAgICBsaW5lcy5wdXNoKCcgIGZpbHRlcjogbm9uZSAhaW1wb3J0YW50OycpO1xuICAgICAgICBsaW5lcy5wdXNoKCd9Jyk7XG4gICAgfSk7XG5cbiAgICBpZiAoIWZyYW1lVVJMKSB7XG4gICAgICAgIC8vIElmIHVzZXIgaGFzIHRoZSBjaHJvbWUgaXNzdWUgdGhlIGNvbG9ycyBzaG91bGQgYmUgdGhlIG90aGVyIHdheSBhcm91bmQgYXMgb2YgdGhlIHJvb3Rjb2xvcnMgd2lsbCBhZmZlY3QgdGhlIHdob2xlIGJhY2tncm91bmQgY29sb3Igb2YgdGhlIHBhZ2VcbiAgICAgICAgY29uc3Qgcm9vdENvbG9ycyA9IGhhc0Nocm9taXVtSXNzdWU1MDE1ODIoKSAmJiBjb25maWcubW9kZSA9PT0gRmlsdGVyTW9kZS5kYXJrID8gWzAsIDAsIDBdIDogWzI1NSwgMjU1LCAyNTVdO1xuICAgICAgICBjb25zdCBbciwgZywgYl0gPSBhcHBseUNvbG9yTWF0cml4KHJvb3RDb2xvcnMsIGNyZWF0ZUZpbHRlck1hdHJpeChjb25maWcpKTtcbiAgICAgICAgY29uc3QgYmdDb2xvciA9IHtcbiAgICAgICAgICAgIHI6IE1hdGgucm91bmQociksXG4gICAgICAgICAgICBnOiBNYXRoLnJvdW5kKGcpLFxuICAgICAgICAgICAgYjogTWF0aC5yb3VuZChiKSxcbiAgICAgICAgICAgIHRvU3RyaW5nKCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBgcmdiKCR7dGhpcy5yfSwke3RoaXMuZ30sJHt0aGlzLmJ9KWA7XG4gICAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgICAgICBsaW5lcy5wdXNoKCcnKTtcbiAgICAgICAgbGluZXMucHVzaCgnLyogUGFnZSBiYWNrZ3JvdW5kICovJyk7XG4gICAgICAgIGxpbmVzLnB1c2goJ2h0bWwgeycpO1xuICAgICAgICBsaW5lcy5wdXNoKGAgIGJhY2tncm91bmQ6ICR7YmdDb2xvcn0gIWltcG9ydGFudDtgKTtcbiAgICAgICAgbGluZXMucHVzaCgnfScpO1xuICAgIH1cblxuICAgIGlmIChmaXguY3NzICYmIGZpeC5jc3MubGVuZ3RoID4gMCAmJiBjb25maWcubW9kZSA9PT0gRmlsdGVyTW9kZS5kYXJrKSB7XG4gICAgICAgIGxpbmVzLnB1c2goJycpO1xuICAgICAgICBsaW5lcy5wdXNoKCcvKiBDdXN0b20gcnVsZXMgKi8nKTtcbiAgICAgICAgbGluZXMucHVzaChmaXguY3NzKTtcbiAgICB9XG5cbiAgICBsaW5lcy5wdXNoKCcnKTtcbiAgICBsaW5lcy5wdXNoKCd9Jyk7XG5cbiAgICByZXR1cm4gbGluZXMuam9pbignXFxuJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRDU1NGaWx0ZXJWYWx1ZShjb25maWc6IEZpbHRlckNvbmZpZykge1xuICAgIGNvbnN0IGZpbHRlcnM6IHN0cmluZ1tdID0gW107XG5cbiAgICBpZiAoY29uZmlnLm1vZGUgPT09IEZpbHRlck1vZGUuZGFyaykge1xuICAgICAgICBmaWx0ZXJzLnB1c2goJ2ludmVydCgxMDAlKSBodWUtcm90YXRlKDE4MGRlZyknKTtcbiAgICB9XG4gICAgaWYgKGNvbmZpZy5icmlnaHRuZXNzICE9PSAxMDApIHtcbiAgICAgICAgZmlsdGVycy5wdXNoKGBicmlnaHRuZXNzKCR7Y29uZmlnLmJyaWdodG5lc3N9JSlgKTtcbiAgICB9XG4gICAgaWYgKGNvbmZpZy5jb250cmFzdCAhPT0gMTAwKSB7XG4gICAgICAgIGZpbHRlcnMucHVzaChgY29udHJhc3QoJHtjb25maWcuY29udHJhc3R9JSlgKTtcbiAgICB9XG4gICAgaWYgKGNvbmZpZy5ncmF5c2NhbGUgIT09IDApIHtcbiAgICAgICAgZmlsdGVycy5wdXNoKGBncmF5c2NhbGUoJHtjb25maWcuZ3JheXNjYWxlfSUpYCk7XG4gICAgfVxuICAgIGlmIChjb25maWcuc2VwaWEgIT09IDApIHtcbiAgICAgICAgZmlsdGVycy5wdXNoKGBzZXBpYSgke2NvbmZpZy5zZXBpYX0lKWApO1xuICAgIH1cblxuICAgIGlmIChmaWx0ZXJzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICByZXR1cm4gZmlsdGVycy5qb2luKCcgJyk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUxlYWRpbmdSdWxlKGZpbHRlclZhbHVlOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIHJldHVybiBbXG4gICAgICAgICdodG1sIHsnLFxuICAgICAgICBgICAtd2Via2l0LWZpbHRlcjogJHtmaWx0ZXJWYWx1ZX0gIWltcG9ydGFudDtgLFxuICAgICAgICBgICBmaWx0ZXI6ICR7ZmlsdGVyVmFsdWV9ICFpbXBvcnRhbnQ7YCxcbiAgICAgICAgJ30nXG4gICAgXS5qb2luKCdcXG4nKTtcbn1cblxuZnVuY3Rpb24gam9pblNlbGVjdG9ycyhzZWxlY3RvcnM6IHN0cmluZ1tdKSB7XG4gICAgcmV0dXJuIHNlbGVjdG9ycy5tYXAoKHMpID0+IHMucmVwbGFjZSgvXFwsJC8sICcnKSkuam9pbignLFxcbicpO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVSZXZlcnNlUnVsZShyZXZlcnNlRmlsdGVyVmFsdWU6IHN0cmluZywgZml4OiBJbnZlcnNpb25GaXgpOiBzdHJpbmcge1xuICAgIGNvbnN0IGxpbmVzOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgaWYgKGZpeC5pbnZlcnQubGVuZ3RoID4gMCkge1xuICAgICAgICBsaW5lcy5wdXNoKGAke2pvaW5TZWxlY3RvcnMoZml4LmludmVydCl9IHtgKTtcbiAgICAgICAgbGluZXMucHVzaChgICAtd2Via2l0LWZpbHRlcjogJHtyZXZlcnNlRmlsdGVyVmFsdWV9ICFpbXBvcnRhbnQ7YCk7XG4gICAgICAgIGxpbmVzLnB1c2goYCAgZmlsdGVyOiAke3JldmVyc2VGaWx0ZXJWYWx1ZX0gIWltcG9ydGFudDtgKTtcbiAgICAgICAgbGluZXMucHVzaCgnfScpO1xuICAgIH1cblxuICAgIGlmIChmaXgubm9pbnZlcnQubGVuZ3RoID4gMCkge1xuICAgICAgICBsaW5lcy5wdXNoKGAke2pvaW5TZWxlY3RvcnMoZml4Lm5vaW52ZXJ0KX0ge2ApO1xuICAgICAgICBsaW5lcy5wdXNoKCcgIC13ZWJraXQtZmlsdGVyOiBub25lICFpbXBvcnRhbnQ7Jyk7XG4gICAgICAgIGxpbmVzLnB1c2goJyAgZmlsdGVyOiBub25lICFpbXBvcnRhbnQ7Jyk7XG4gICAgICAgIGxpbmVzLnB1c2goJ30nKTtcbiAgICB9XG5cbiAgICBpZiAoZml4LnJlbW92ZWJnLmxlbmd0aCA+IDApIHtcbiAgICAgICAgbGluZXMucHVzaChgJHtqb2luU2VsZWN0b3JzKGZpeC5yZW1vdmViZyl9IHtgKTtcbiAgICAgICAgbGluZXMucHVzaCgnICBiYWNrZ3JvdW5kOiB3aGl0ZSAhaW1wb3J0YW50OycpO1xuICAgICAgICBsaW5lcy5wdXNoKCd9Jyk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGxpbmVzLmpvaW4oJ1xcbicpO1xufVxuXG4vKipcbiogUmV0dXJucyBmaXhlcyBmb3IgYSBnaXZlbiBVUkwuXG4qIElmIG5vIG1hdGNoZXMgZm91bmQsIGNvbW1vbiBmaXhlcyB3aWxsIGJlIHJldHVybmVkLlxuKiBAcGFyYW0gdXJsIFNpdGUgVVJMLlxuKiBAcGFyYW0gaW52ZXJzaW9uRml4ZXMgTGlzdCBvZiBpbnZlcnNpb24gZml4ZXMuXG4qL1xuZXhwb3J0IGZ1bmN0aW9uIGdldEludmVyc2lvbkZpeGVzRm9yKHVybDogc3RyaW5nLCBpbnZlcnNpb25GaXhlczogSW52ZXJzaW9uRml4W10pOiBJbnZlcnNpb25GaXgge1xuICAgIGNvbnN0IGNvbW1vbiA9IHtcbiAgICAgICAgdXJsOiBpbnZlcnNpb25GaXhlc1swXS51cmwsXG4gICAgICAgIGludmVydDogaW52ZXJzaW9uRml4ZXNbMF0uaW52ZXJ0IHx8IFtdLFxuICAgICAgICBub2ludmVydDogaW52ZXJzaW9uRml4ZXNbMF0ubm9pbnZlcnQgfHwgW10sXG4gICAgICAgIHJlbW92ZWJnOiBpbnZlcnNpb25GaXhlc1swXS5yZW1vdmViZyB8fCBbXSxcbiAgICAgICAgY3NzOiBpbnZlcnNpb25GaXhlc1swXS5jc3MgfHwgJycsXG4gICAgfTtcblxuICAgIGlmICh1cmwpIHtcbiAgICAgICAgLy8gU2VhcmNoIGZvciBtYXRjaCB3aXRoIGdpdmVuIFVSTFxuICAgICAgICBjb25zdCBtYXRjaGVzID0gaW52ZXJzaW9uRml4ZXNcbiAgICAgICAgICAgIC5zbGljZSgxKVxuICAgICAgICAgICAgLmZpbHRlcigocykgPT4gaXNVUkxJbkxpc3QodXJsLCBzLnVybCkpXG4gICAgICAgICAgICAuc29ydCgoYSwgYikgPT4gYi51cmxbMF0ubGVuZ3RoIC0gYS51cmxbMF0ubGVuZ3RoKTtcbiAgICAgICAgaWYgKG1hdGNoZXMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgY29uc3QgZm91bmQgPSBtYXRjaGVzWzBdO1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICB1cmw6IGZvdW5kLnVybCxcbiAgICAgICAgICAgICAgICBpbnZlcnQ6IGNvbW1vbi5pbnZlcnQuY29uY2F0KGZvdW5kLmludmVydCB8fCBbXSksXG4gICAgICAgICAgICAgICAgbm9pbnZlcnQ6IGNvbW1vbi5ub2ludmVydC5jb25jYXQoZm91bmQubm9pbnZlcnQgfHwgW10pLFxuICAgICAgICAgICAgICAgIHJlbW92ZWJnOiBjb21tb24ucmVtb3ZlYmcuY29uY2F0KGZvdW5kLnJlbW92ZWJnIHx8IFtdKSxcbiAgICAgICAgICAgICAgICBjc3M6IFtjb21tb24uY3NzLCBmb3VuZC5jc3NdLmZpbHRlcigocykgPT4gcykuam9pbignXFxuJyksXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBjb21tb247XG59XG5cbmNvbnN0IGludmVyc2lvbkZpeGVzQ29tbWFuZHMgPSB7XG4gICAgJ0lOVkVSVCc6ICdpbnZlcnQnLFxuICAgICdOTyBJTlZFUlQnOiAnbm9pbnZlcnQnLFxuICAgICdSRU1PVkUgQkcnOiAncmVtb3ZlYmcnLFxuICAgICdDU1MnOiAnY3NzJyxcbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZUludmVyc2lvbkZpeGVzKHRleHQ6IHN0cmluZykge1xuICAgIHJldHVybiBwYXJzZVNpdGVzRml4ZXNDb25maWc8SW52ZXJzaW9uRml4Pih0ZXh0LCB7XG4gICAgICAgIGNvbW1hbmRzOiBPYmplY3Qua2V5cyhpbnZlcnNpb25GaXhlc0NvbW1hbmRzKSxcbiAgICAgICAgZ2V0Q29tbWFuZFByb3BOYW1lOiAoY29tbWFuZCkgPT4gaW52ZXJzaW9uRml4ZXNDb21tYW5kc1tjb21tYW5kXSB8fCBudWxsLFxuICAgICAgICBwYXJzZUNvbW1hbmRWYWx1ZTogKGNvbW1hbmQsIHZhbHVlKSA9PiB7XG4gICAgICAgICAgICBpZiAoY29tbWFuZCA9PT0gJ0NTUycpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdmFsdWUudHJpbSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHBhcnNlQXJyYXkodmFsdWUpO1xuICAgICAgICB9LFxuICAgIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZm9ybWF0SW52ZXJzaW9uRml4ZXMoaW52ZXJzaW9uRml4ZXM6IEludmVyc2lvbkZpeFtdKSB7XG4gICAgY29uc3QgZml4ZXMgPSBpbnZlcnNpb25GaXhlcy5zbGljZSgpLnNvcnQoKGEsIGIpID0+IGNvbXBhcmVVUkxQYXR0ZXJucyhhLnVybFswXSwgYi51cmxbMF0pKTtcblxuICAgIHJldHVybiBmb3JtYXRTaXRlc0ZpeGVzQ29uZmlnKGZpeGVzLCB7XG4gICAgICAgIHByb3BzOiBPYmplY3QudmFsdWVzKGludmVyc2lvbkZpeGVzQ29tbWFuZHMpLFxuICAgICAgICBnZXRQcm9wQ29tbWFuZE5hbWU6IChwcm9wKSA9PiBPYmplY3QuZW50cmllcyhpbnZlcnNpb25GaXhlc0NvbW1hbmRzKS5maW5kKChbLCBwXSkgPT4gcCA9PT0gcHJvcClbMF0sXG4gICAgICAgIGZvcm1hdFByb3BWYWx1ZTogKHByb3AsIHZhbHVlKSA9PiB7XG4gICAgICAgICAgICBpZiAocHJvcCA9PT0gJ2NzcycpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdmFsdWUudHJpbSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGZvcm1hdEFycmF5KHZhbHVlKS50cmltKCk7XG4gICAgICAgIH0sXG4gICAgICAgIHNob3VsZElnbm9yZVByb3A6IChwcm9wLCB2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgaWYgKHByb3AgPT09ICdjc3MnKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuICF2YWx1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiAhKEFycmF5LmlzQXJyYXkodmFsdWUpICYmIHZhbHVlLmxlbmd0aCA+IDApO1xuICAgICAgICB9XG4gICAgfSk7XG59XG4iLCJpbXBvcnQge2NyZWF0ZUZpbHRlck1hdHJpeCwgTWF0cml4fSBmcm9tICcuL3V0aWxzL21hdHJpeCc7XG5pbXBvcnQge2lzRmlyZWZveH0gZnJvbSAnLi4vdXRpbHMvcGxhdGZvcm0nO1xuaW1wb3J0IHtjc3NGaWx0ZXJTdHlsZWhlZXRUZW1wbGF0ZX0gZnJvbSAnLi9jc3MtZmlsdGVyJztcbmltcG9ydCB7RmlsdGVyQ29uZmlnLCBJbnZlcnNpb25GaXh9IGZyb20gJy4uL2RlZmluaXRpb25zJztcblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVNWR0ZpbHRlclN0eWxlc2hlZXQoY29uZmlnOiBGaWx0ZXJDb25maWcsIHVybDogc3RyaW5nLCBmcmFtZVVSTDogc3RyaW5nLCBpbnZlcnNpb25GaXhlczogSW52ZXJzaW9uRml4W10pIHtcbiAgICBsZXQgZmlsdGVyVmFsdWU6IHN0cmluZztcbiAgICBsZXQgcmV2ZXJzZUZpbHRlclZhbHVlOiBzdHJpbmc7XG4gICAgaWYgKGlzRmlyZWZveCgpKSB7XG4gICAgICAgIGZpbHRlclZhbHVlID0gZ2V0RW1iZWRkZWRTVkdGaWx0ZXJWYWx1ZShnZXRTVkdGaWx0ZXJNYXRyaXhWYWx1ZShjb25maWcpKTtcbiAgICAgICAgcmV2ZXJzZUZpbHRlclZhbHVlID0gZ2V0RW1iZWRkZWRTVkdGaWx0ZXJWYWx1ZShnZXRTVkdSZXZlcnNlRmlsdGVyTWF0cml4VmFsdWUoKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgLy8gQ2hyb21lIGZhaWxzIHdpdGggXCJVbnNhZmUgYXR0ZW1wdCB0byBsb2FkIFVSTCAuLi4gRG9tYWlucywgcHJvdG9jb2xzIGFuZCBwb3J0cyBtdXN0IG1hdGNoLlxuICAgICAgICBmaWx0ZXJWYWx1ZSA9ICd1cmwoI2RhcmstcmVhZGVyLWZpbHRlciknO1xuICAgICAgICByZXZlcnNlRmlsdGVyVmFsdWUgPSAndXJsKCNkYXJrLXJlYWRlci1yZXZlcnNlLWZpbHRlciknO1xuICAgIH1cbiAgICByZXR1cm4gY3NzRmlsdGVyU3R5bGVoZWV0VGVtcGxhdGUoZmlsdGVyVmFsdWUsIHJldmVyc2VGaWx0ZXJWYWx1ZSwgY29uZmlnLCB1cmwsIGZyYW1lVVJMLCBpbnZlcnNpb25GaXhlcyk7XG59XG5cbmZ1bmN0aW9uIGdldEVtYmVkZGVkU1ZHRmlsdGVyVmFsdWUobWF0cml4VmFsdWU6IHN0cmluZykge1xuICAgIGNvbnN0IGlkID0gJ2RhcmstcmVhZGVyLWZpbHRlcic7XG4gICAgY29uc3Qgc3ZnID0gW1xuICAgICAgICAnPHN2ZyB4bWxucz1cImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCI+JyxcbiAgICAgICAgYDxmaWx0ZXIgaWQ9XCIke2lkfVwiIHN0eWxlPVwiY29sb3ItaW50ZXJwb2xhdGlvbi1maWx0ZXJzOiBzUkdCO1wiPmAsXG4gICAgICAgIGA8ZmVDb2xvck1hdHJpeCB0eXBlPVwibWF0cml4XCIgdmFsdWVzPVwiJHttYXRyaXhWYWx1ZX1cIiAvPmAsXG4gICAgICAgICc8L2ZpbHRlcj4nLFxuICAgICAgICAnPC9zdmc+JyxcbiAgICBdLmpvaW4oJycpO1xuICAgIHJldHVybiBgdXJsKGRhdGE6aW1hZ2Uvc3ZnK3htbDtiYXNlNjQsJHtidG9hKHN2Zyl9IyR7aWR9KWA7XG59XG5cbmZ1bmN0aW9uIHRvU1ZHTWF0cml4KG1hdHJpeDogbnVtYmVyW11bXSkge1xuICAgIHJldHVybiBtYXRyaXguc2xpY2UoMCwgNCkubWFwKG0gPT4gbS5tYXAobSA9PiBtLnRvRml4ZWQoMykpLmpvaW4oJyAnKSkuam9pbignICcpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0U1ZHRmlsdGVyTWF0cml4VmFsdWUoY29uZmlnOiBGaWx0ZXJDb25maWcpIHtcbiAgICByZXR1cm4gdG9TVkdNYXRyaXgoY3JlYXRlRmlsdGVyTWF0cml4KGNvbmZpZykpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0U1ZHUmV2ZXJzZUZpbHRlck1hdHJpeFZhbHVlKCkge1xuICAgIHJldHVybiB0b1NWR01hdHJpeChNYXRyaXguaW52ZXJ0Tkh1ZSgpKTtcbn1cbiIsImludGVyZmFjZSBGZXRjaFJlcXVlc3Qge1xuICAgIHVybDogc3RyaW5nO1xuICAgIHJlc3BvbnNlVHlwZTogJ2RhdGEtdXJsJyB8ICd0ZXh0JztcbiAgICBtaW1lVHlwZT86IHN0cmluZztcbn1cblxubGV0IGNvdW50ZXIgPSAwO1xuY29uc3QgcmVzb2x2ZXJzID0gbmV3IE1hcDxudW1iZXIsIChkYXRhKSA9PiB2b2lkPigpO1xuY29uc3QgcmVqZWN0b3JzID0gbmV3IE1hcDxudW1iZXIsIChlcnJvcikgPT4gdm9pZD4oKTtcblxuZXhwb3J0IGZ1bmN0aW9uIGJnRmV0Y2gocmVxdWVzdDogRmV0Y2hSZXF1ZXN0KSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlPHN0cmluZz4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICBjb25zdCBpZCA9ICsrY291bnRlcjtcbiAgICAgICAgcmVzb2x2ZXJzLnNldChpZCwgcmVzb2x2ZSk7XG4gICAgICAgIHJlamVjdG9ycy5zZXQoaWQsIHJlamVjdCk7XG4gICAgICAgIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHt0eXBlOiAnZmV0Y2gnLCBkYXRhOiByZXF1ZXN0LCBpZH0pO1xuICAgIH0pO1xufVxuXG5jaHJvbWUucnVudGltZS5vbk1lc3NhZ2UuYWRkTGlzdGVuZXIoKHt0eXBlLCBkYXRhLCBlcnJvciwgaWR9KSA9PiB7XG4gICAgaWYgKHR5cGUgPT09ICdmZXRjaC1yZXNwb25zZScpIHtcbiAgICAgICAgY29uc3QgcmVzb2x2ZSA9IHJlc29sdmVycy5nZXQoaWQpO1xuICAgICAgICBjb25zdCByZWplY3QgPSByZWplY3RvcnMuZ2V0KGlkKTtcbiAgICAgICAgcmVzb2x2ZXJzLmRlbGV0ZShpZCk7XG4gICAgICAgIHJlamVjdG9ycy5kZWxldGUoaWQpO1xuICAgICAgICBpZiAoZXJyb3IpIHtcbiAgICAgICAgICAgIHJlamVjdCAmJiByZWplY3QoZXJyb3IpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmVzb2x2ZSAmJiByZXNvbHZlKGRhdGEpO1xuICAgICAgICB9XG4gICAgfVxufSk7XG4iLCJpbXBvcnQge2lzRmlyZWZveH0gZnJvbSAnLi9wbGF0Zm9ybSc7XG5cbmFzeW5jIGZ1bmN0aW9uIGdldE9LUmVzcG9uc2UodXJsOiBzdHJpbmcsIG1pbWVUeXBlPzogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChcbiAgICAgICAgdXJsLFxuICAgICAgICB7XG4gICAgICAgICAgICBjYWNoZTogJ2ZvcmNlLWNhY2hlJyxcbiAgICAgICAgICAgIGNyZWRlbnRpYWxzOiAnb21pdCcsXG4gICAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIEZpcmVmb3ggYnVnLCBjb250ZW50IHR5cGUgaXMgXCJhcHBsaWNhdGlvbi94LXVua25vd24tY29udGVudC10eXBlXCJcbiAgICBpZiAoaXNGaXJlZm94KCkgJiYgbWltZVR5cGUgPT09ICd0ZXh0L2NzcycgJiYgdXJsLnN0YXJ0c1dpdGgoJ21vei1leHRlbnNpb246Ly8nKSAmJiB1cmwuZW5kc1dpdGgoJy5jc3MnKSkge1xuICAgICAgICByZXR1cm4gcmVzcG9uc2U7XG4gICAgfVxuXG4gICAgaWYgKG1pbWVUeXBlICYmICFyZXNwb25zZS5oZWFkZXJzLmdldCgnQ29udGVudC1UeXBlJykuc3RhcnRzV2l0aChtaW1lVHlwZSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBNaW1lIHR5cGUgbWlzbWF0Y2ggd2hlbiBsb2FkaW5nICR7dXJsfWApO1xuICAgIH1cblxuICAgIGlmICghcmVzcG9uc2Uub2spIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmFibGUgdG8gbG9hZCAke3VybH0gJHtyZXNwb25zZS5zdGF0dXN9ICR7cmVzcG9uc2Uuc3RhdHVzVGV4dH1gKTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVzcG9uc2U7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBsb2FkQXNEYXRhVVJMKHVybDogc3RyaW5nLCBtaW1lVHlwZT86IHN0cmluZykge1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZ2V0T0tSZXNwb25zZSh1cmwsIG1pbWVUeXBlKTtcbiAgICByZXR1cm4gYXdhaXQgcmVhZFJlc3BvbnNlQXNEYXRhVVJMKHJlc3BvbnNlKTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJlYWRSZXNwb25zZUFzRGF0YVVSTChyZXNwb25zZTogUmVzcG9uc2UpIHtcbiAgICBjb25zdCBibG9iID0gYXdhaXQgcmVzcG9uc2UuYmxvYigpO1xuICAgIGNvbnN0IGRhdGFVUkwgPSBhd2FpdCAobmV3IFByb21pc2U8c3RyaW5nPigocmVzb2x2ZSkgPT4ge1xuICAgICAgICBjb25zdCByZWFkZXIgPSBuZXcgRmlsZVJlYWRlcigpO1xuICAgICAgICByZWFkZXIub25sb2FkZW5kID0gKCkgPT4gcmVzb2x2ZShyZWFkZXIucmVzdWx0IGFzIHN0cmluZyk7XG4gICAgICAgIHJlYWRlci5yZWFkQXNEYXRhVVJMKGJsb2IpO1xuICAgIH0pKTtcbiAgICByZXR1cm4gZGF0YVVSTDtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGxvYWRBc1RleHQodXJsOiBzdHJpbmcsIG1pbWVUeXBlPzogc3RyaW5nKSB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBnZXRPS1Jlc3BvbnNlKHVybCwgbWltZVR5cGUpO1xuICAgIHJldHVybiBhd2FpdCByZXNwb25zZS50ZXh0KCk7XG59XG4iLCJpbXBvcnQge2dldFNWR0ZpbHRlck1hdHJpeFZhbHVlfSBmcm9tICcuLi8uLi9nZW5lcmF0b3JzL3N2Zy1maWx0ZXInO1xuaW1wb3J0IHtiZ0ZldGNofSBmcm9tICcuL25ldHdvcmsnO1xuaW1wb3J0IHtnZXRVUkxIb3N0T3JQcm90b2NvbH0gZnJvbSAnLi4vLi4vdXRpbHMvdXJsJztcbmltcG9ydCB7bG9hZEFzRGF0YVVSTH0gZnJvbSAnLi4vLi4vdXRpbHMvbmV0d29yayc7XG5pbXBvcnQge0ZpbHRlckNvbmZpZ30gZnJvbSAnLi4vLi4vZGVmaW5pdGlvbnMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIEltYWdlRGV0YWlscyB7XG4gICAgc3JjOiBzdHJpbmc7XG4gICAgZGF0YVVSTDogc3RyaW5nO1xuICAgIHdpZHRoOiBudW1iZXI7XG4gICAgaGVpZ2h0OiBudW1iZXI7XG4gICAgaXNEYXJrOiBib29sZWFuO1xuICAgIGlzTGlnaHQ6IGJvb2xlYW47XG4gICAgaXNUcmFuc3BhcmVudDogYm9vbGVhbjtcbiAgICBpc0xhcmdlOiBib29sZWFuO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0SW1hZ2VEZXRhaWxzKHVybDogc3RyaW5nKSB7XG4gICAgbGV0IGRhdGFVUkw6IHN0cmluZztcbiAgICBpZiAodXJsLnN0YXJ0c1dpdGgoJ2RhdGE6JykpIHtcbiAgICAgICAgZGF0YVVSTCA9IHVybDtcbiAgICB9IGVsc2Uge1xuICAgICAgICBkYXRhVVJMID0gYXdhaXQgZ2V0SW1hZ2VEYXRhVVJMKHVybCk7XG4gICAgfVxuICAgIGNvbnN0IGltYWdlID0gYXdhaXQgdXJsVG9JbWFnZShkYXRhVVJMKTtcbiAgICBjb25zdCBpbmZvID0gYW5hbHl6ZUltYWdlKGltYWdlKTtcbiAgICByZXR1cm4ge1xuICAgICAgICBzcmM6IHVybCxcbiAgICAgICAgZGF0YVVSTCxcbiAgICAgICAgd2lkdGg6IGltYWdlLm5hdHVyYWxXaWR0aCxcbiAgICAgICAgaGVpZ2h0OiBpbWFnZS5uYXR1cmFsSGVpZ2h0LFxuICAgICAgICAuLi5pbmZvLFxuICAgIH07XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdldEltYWdlRGF0YVVSTCh1cmw6IHN0cmluZykge1xuICAgIGlmIChnZXRVUkxIb3N0T3JQcm90b2NvbCh1cmwpID09PSAobG9jYXRpb24uaG9zdCB8fCBsb2NhdGlvbi5wcm90b2NvbCkpIHtcbiAgICAgICAgcmV0dXJuIGF3YWl0IGxvYWRBc0RhdGFVUkwodXJsKTtcbiAgICB9XG4gICAgcmV0dXJuIGF3YWl0IGJnRmV0Y2goe3VybCwgcmVzcG9uc2VUeXBlOiAnZGF0YS11cmwnfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHVybFRvSW1hZ2UodXJsOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2U8SFRNTEltYWdlRWxlbWVudD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICBjb25zdCBpbWFnZSA9IG5ldyBJbWFnZSgpO1xuICAgICAgICBpbWFnZS5vbmxvYWQgPSAoKSA9PiByZXNvbHZlKGltYWdlKTtcbiAgICAgICAgaW1hZ2Uub25lcnJvciA9ICgpID0+IHJlamVjdChgVW5hYmxlIHRvIGxvYWQgaW1hZ2UgJHt1cmx9YCk7XG4gICAgICAgIGltYWdlLnNyYyA9IHVybDtcbiAgICB9KTtcbn1cblxuY29uc3QgTUFYX0FOQUxJWkVfUElYRUxTX0NPVU5UID0gMzIgKiAzMjtcbmxldCBjYW52YXM6IEhUTUxDYW52YXNFbGVtZW50IHwgT2Zmc2NyZWVuQ2FudmFzO1xubGV0IGNvbnRleHQ6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCB8IE9mZnNjcmVlbkNhbnZhc1JlbmRlcmluZ0NvbnRleHQyRDtcblxuZnVuY3Rpb24gY3JlYXRlQ2FudmFzKCkge1xuICAgIGNvbnN0IG1heFdpZHRoID0gTUFYX0FOQUxJWkVfUElYRUxTX0NPVU5UO1xuICAgIGNvbnN0IG1heEhlaWdodCA9IE1BWF9BTkFMSVpFX1BJWEVMU19DT1VOVDtcbiAgICBjYW52YXMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdjYW52YXMnKTtcbiAgICBjYW52YXMud2lkdGggPSBtYXhXaWR0aDtcbiAgICBjYW52YXMuaGVpZ2h0ID0gbWF4SGVpZ2h0O1xuICAgIGNvbnRleHQgPSBjYW52YXMuZ2V0Q29udGV4dCgnMmQnKTtcbiAgICBjb250ZXh0LmltYWdlU21vb3RoaW5nRW5hYmxlZCA9IGZhbHNlO1xufVxuXG5mdW5jdGlvbiByZW1vdmVDYW52YXMoKSB7XG4gICAgY2FudmFzID0gbnVsbDtcbiAgICBjb250ZXh0ID0gbnVsbDtcbn1cblxuZnVuY3Rpb24gYW5hbHl6ZUltYWdlKGltYWdlOiBIVE1MSW1hZ2VFbGVtZW50KSB7XG4gICAgaWYgKCFjYW52YXMpIHtcbiAgICAgICAgY3JlYXRlQ2FudmFzKCk7XG4gICAgfVxuICAgIGNvbnN0IHtuYXR1cmFsV2lkdGgsIG5hdHVyYWxIZWlnaHR9ID0gaW1hZ2U7XG4gICAgY29uc3QgbmF0dXJhbFBpeGVsc0NvdW50ID0gbmF0dXJhbFdpZHRoICogbmF0dXJhbEhlaWdodDtcbiAgICBjb25zdCBrID0gTWF0aC5taW4oMSwgTWF0aC5zcXJ0KE1BWF9BTkFMSVpFX1BJWEVMU19DT1VOVCAvIG5hdHVyYWxQaXhlbHNDb3VudCkpO1xuICAgIGNvbnN0IHdpZHRoID0gTWF0aC5jZWlsKG5hdHVyYWxXaWR0aCAqIGspO1xuICAgIGNvbnN0IGhlaWdodCA9IE1hdGguY2VpbChuYXR1cmFsSGVpZ2h0ICogayk7XG4gICAgY29udGV4dC5jbGVhclJlY3QoMCwgMCwgd2lkdGgsIGhlaWdodCk7XG5cbiAgICBjb250ZXh0LmRyYXdJbWFnZShpbWFnZSwgMCwgMCwgbmF0dXJhbFdpZHRoLCBuYXR1cmFsSGVpZ2h0LCAwLCAwLCB3aWR0aCwgaGVpZ2h0KTtcbiAgICBjb25zdCBpbWFnZURhdGEgPSBjb250ZXh0LmdldEltYWdlRGF0YSgwLCAwLCB3aWR0aCwgaGVpZ2h0KTtcbiAgICBjb25zdCBkID0gaW1hZ2VEYXRhLmRhdGE7XG5cbiAgICBjb25zdCBUUkFOU1BBUkVOVF9BTFBIQV9USFJFU0hPTEQgPSAwLjA1O1xuICAgIGNvbnN0IERBUktfTElHSFRORVNTX1RIUkVTSE9MRCA9IDAuNDtcbiAgICBjb25zdCBMSUdIVF9MSUdIVE5FU1NfVEhSRVNIT0xEID0gMC43O1xuXG4gICAgbGV0IHRyYW5zcGFyZW50UGl4ZWxzQ291bnQgPSAwO1xuICAgIGxldCBkYXJrUGl4ZWxzQ291bnQgPSAwO1xuICAgIGxldCBsaWdodFBpeGVsc0NvdW50ID0gMDtcblxuICAgIGxldCBpOiBudW1iZXIsIHg6IG51bWJlciwgeTogbnVtYmVyO1xuICAgIGxldCByOiBudW1iZXIsIGc6IG51bWJlciwgYjogbnVtYmVyLCBhOiBudW1iZXI7XG4gICAgbGV0IGw6IG51bWJlcjtcbiAgICBmb3IgKHkgPSAwOyB5IDwgaGVpZ2h0OyB5KyspIHtcbiAgICAgICAgZm9yICh4ID0gMDsgeCA8IHdpZHRoOyB4KyspIHtcbiAgICAgICAgICAgIGkgPSA0ICogKHkgKiB3aWR0aCArIHgpO1xuICAgICAgICAgICAgciA9IGRbaSArIDBdIC8gMjU1O1xuICAgICAgICAgICAgZyA9IGRbaSArIDFdIC8gMjU1O1xuICAgICAgICAgICAgYiA9IGRbaSArIDJdIC8gMjU1O1xuICAgICAgICAgICAgYSA9IGRbaSArIDNdIC8gMjU1O1xuXG4gICAgICAgICAgICBpZiAoYSA8IFRSQU5TUEFSRU5UX0FMUEhBX1RIUkVTSE9MRCkge1xuICAgICAgICAgICAgICAgIHRyYW5zcGFyZW50UGl4ZWxzQ291bnQrKztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gVXNlIHNSR0IgdG8gZGV0ZXJtaW5lIHRoZSBgcGl4ZWwgTGlnaHRuZXNzYFxuICAgICAgICAgICAgICAgIC8vIGh0dHBzOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL1JlbGF0aXZlX2x1bWluYW5jZVxuICAgICAgICAgICAgICAgIGwgPSAwLjIxMjYgKiByICsgMC43MTUyICogZyArIDAuMDcyMiAqIGI7XG4gICAgICAgICAgICAgICAgaWYgKGwgPCBEQVJLX0xJR0hUTkVTU19USFJFU0hPTEQpIHtcbiAgICAgICAgICAgICAgICAgICAgZGFya1BpeGVsc0NvdW50Kys7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChsID4gTElHSFRfTElHSFRORVNTX1RIUkVTSE9MRCkge1xuICAgICAgICAgICAgICAgICAgICBsaWdodFBpeGVsc0NvdW50Kys7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgdG90YWxQaXhlbHNDb3VudCA9IHdpZHRoICogaGVpZ2h0O1xuICAgIGNvbnN0IG9wYXF1ZVBpeGVsc0NvdW50ID0gdG90YWxQaXhlbHNDb3VudCAtIHRyYW5zcGFyZW50UGl4ZWxzQ291bnQ7XG5cbiAgICBjb25zdCBEQVJLX0lNQUdFX1RIUkVTSE9MRCA9IDAuNztcbiAgICBjb25zdCBMSUdIVF9JTUFHRV9USFJFU0hPTEQgPSAwLjc7XG4gICAgY29uc3QgVFJBTlNQQVJFTlRfSU1BR0VfVEhSRVNIT0xEID0gMC4xO1xuICAgIGNvbnN0IExBUkdFX0lNQUdFX1BJWEVMU19DT1VOVCA9IDgwMCAqIDYwMDtcblxuICAgIHJldHVybiB7XG4gICAgICAgIGlzRGFyazogKChkYXJrUGl4ZWxzQ291bnQgLyBvcGFxdWVQaXhlbHNDb3VudCkgPj0gREFSS19JTUFHRV9USFJFU0hPTEQpLFxuICAgICAgICBpc0xpZ2h0OiAoKGxpZ2h0UGl4ZWxzQ291bnQgLyBvcGFxdWVQaXhlbHNDb3VudCkgPj0gTElHSFRfSU1BR0VfVEhSRVNIT0xEKSxcbiAgICAgICAgaXNUcmFuc3BhcmVudDogKCh0cmFuc3BhcmVudFBpeGVsc0NvdW50IC8gdG90YWxQaXhlbHNDb3VudCkgPj0gVFJBTlNQQVJFTlRfSU1BR0VfVEhSRVNIT0xEKSxcbiAgICAgICAgaXNMYXJnZTogKG5hdHVyYWxQaXhlbHNDb3VudCA+PSBMQVJHRV9JTUFHRV9QSVhFTFNfQ09VTlQpLFxuICAgIH07XG59XG5cbmNvbnN0IG9iamVjdFVSTHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuZXhwb3J0IGZ1bmN0aW9uIGdldEZpbHRlcmVkSW1hZ2VEYXRhVVJMKHtkYXRhVVJMLCB3aWR0aCwgaGVpZ2h0fTogSW1hZ2VEZXRhaWxzLCBmaWx0ZXI6IEZpbHRlckNvbmZpZykge1xuICAgIGNvbnN0IG1hdHJpeCA9IGdldFNWR0ZpbHRlck1hdHJpeFZhbHVlKGZpbHRlcik7XG4gICAgY29uc3Qgc3ZnID0gW1xuICAgICAgICBgPHN2ZyB4bWxucz1cImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIgeG1sbnM6eGxpbms9XCJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rXCIgd2lkdGg9XCIke3dpZHRofVwiIGhlaWdodD1cIiR7aGVpZ2h0fVwiPmAsXG4gICAgICAgICc8ZGVmcz4nLFxuICAgICAgICAnPGZpbHRlciBpZD1cImRhcmtyZWFkZXItaW1hZ2UtZmlsdGVyXCI+JyxcbiAgICAgICAgYDxmZUNvbG9yTWF0cml4IHR5cGU9XCJtYXRyaXhcIiB2YWx1ZXM9XCIke21hdHJpeH1cIiAvPmAsXG4gICAgICAgICc8L2ZpbHRlcj4nLFxuICAgICAgICAnPC9kZWZzPicsXG4gICAgICAgIGA8aW1hZ2Ugd2lkdGg9XCIke3dpZHRofVwiIGhlaWdodD1cIiR7aGVpZ2h0fVwiIGZpbHRlcj1cInVybCgjZGFya3JlYWRlci1pbWFnZS1maWx0ZXIpXCIgeGxpbms6aHJlZj1cIiR7ZGF0YVVSTH1cIiAvPmAsXG4gICAgICAgICc8L3N2Zz4nLFxuICAgIF0uam9pbignJyk7XG4gICAgY29uc3QgYnl0ZXMgPSBuZXcgVWludDhBcnJheShzdmcubGVuZ3RoKTtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHN2Zy5sZW5ndGg7IGkrKykge1xuICAgICAgICBieXRlc1tpXSA9IHN2Zy5jaGFyQ29kZUF0KGkpO1xuICAgIH1cbiAgICBjb25zdCBibG9iID0gbmV3IEJsb2IoW2J5dGVzXSwge3R5cGU6ICdpbWFnZS9zdmcreG1sJ30pO1xuICAgIGNvbnN0IG9iamVjdFVSTCA9IFVSTC5jcmVhdGVPYmplY3RVUkwoYmxvYik7XG4gICAgb2JqZWN0VVJMcy5hZGQob2JqZWN0VVJMKTtcbiAgICByZXR1cm4gb2JqZWN0VVJMO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY2xlYW5JbWFnZVByb2Nlc3NpbmdDYWNoZSgpIHtcbiAgICByZW1vdmVDYW52YXMoKTtcbiAgICBvYmplY3RVUkxzLmZvckVhY2goKHUpID0+IFVSTC5yZXZva2VPYmplY3RVUkwodSkpO1xuICAgIG9iamVjdFVSTHMuY2xlYXIoKTtcbn1cbiIsImltcG9ydCB7cGFyc2UsIFJHQkEsIHJnYlRvSFNMLCBoc2xUb1N0cmluZ30gZnJvbSAnLi4vLi4vdXRpbHMvY29sb3InO1xuaW1wb3J0IHtjbGFtcH0gZnJvbSAnLi4vLi4vdXRpbHMvbWF0aCc7XG5pbXBvcnQge2dldE1hdGNoZXN9IGZyb20gJy4uLy4uL3V0aWxzL3RleHQnO1xuaW1wb3J0IHttb2RpZnlCYWNrZ3JvdW5kQ29sb3IsIG1vZGlmeUJvcmRlckNvbG9yLCBtb2RpZnlGb3JlZ3JvdW5kQ29sb3IsIG1vZGlmeUdyYWRpZW50Q29sb3IsIG1vZGlmeVNoYWRvd0NvbG9yLCBjbGVhckNvbG9yTW9kaWZpY2F0aW9uQ2FjaGV9IGZyb20gJy4uLy4uL2dlbmVyYXRvcnMvbW9kaWZ5LWNvbG9ycyc7XG5pbXBvcnQge2Nzc1VSTFJlZ2V4LCBnZXRDU1NVUkxWYWx1ZSwgZ2V0Q1NTQmFzZUJhdGh9IGZyb20gJy4vY3NzLXJ1bGVzJztcbmltcG9ydCB7Z2V0SW1hZ2VEZXRhaWxzLCBnZXRGaWx0ZXJlZEltYWdlRGF0YVVSTCwgSW1hZ2VEZXRhaWxzLCBjbGVhbkltYWdlUHJvY2Vzc2luZ0NhY2hlfSBmcm9tICcuL2ltYWdlJztcbmltcG9ydCB7Z2V0QWJzb2x1dGVVUkx9IGZyb20gJy4vdXJsJztcbmltcG9ydCB7bG9nV2FybiwgbG9nSW5mb30gZnJvbSAnLi4vdXRpbHMvbG9nJztcbmltcG9ydCB7RmlsdGVyQ29uZmlnLCBUaGVtZX0gZnJvbSAnLi4vLi4vZGVmaW5pdGlvbnMnO1xuXG50eXBlIENTU1ZhbHVlTW9kaWZpZXIgPSAoZmlsdGVyOiBGaWx0ZXJDb25maWcpID0+IHN0cmluZyB8IFByb21pc2U8c3RyaW5nPjtcblxuZXhwb3J0IGludGVyZmFjZSBNb2RpZmlhYmxlQ1NTRGVjbGFyYXRpb24ge1xuICAgIHByb3BlcnR5OiBzdHJpbmc7XG4gICAgdmFsdWU6IHN0cmluZyB8IENTU1ZhbHVlTW9kaWZpZXI7XG4gICAgaW1wb3J0YW50OiBib29sZWFuO1xuICAgIHNvdXJjZVZhbHVlOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTW9kaWZpYWJsZUNTU1J1bGUge1xuICAgIHNlbGVjdG9yOiBzdHJpbmc7XG4gICAgcGFyZW50UnVsZTogYW55O1xuICAgIGRlY2xhcmF0aW9uczogTW9kaWZpYWJsZUNTU0RlY2xhcmF0aW9uW107XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRNb2RpZmlhYmxlQ1NTRGVjbGFyYXRpb24ocHJvcGVydHk6IHN0cmluZywgdmFsdWU6IHN0cmluZywgcnVsZTogQ1NTU3R5bGVSdWxlLCBpZ25vcmVJbWFnZVNlbGVjdG9yczogc3RyaW5nW10sIGlzQ2FuY2VsbGVkOiAoKSA9PiBib29sZWFuKTogTW9kaWZpYWJsZUNTU0RlY2xhcmF0aW9uIHtcbiAgICBjb25zdCBpbXBvcnRhbnQgPSBCb29sZWFuKHJ1bGUgJiYgcnVsZS5zdHlsZSAmJiBydWxlLnN0eWxlLmdldFByb3BlcnR5UHJpb3JpdHkocHJvcGVydHkpKTtcbiAgICBjb25zdCBzb3VyY2VWYWx1ZSA9IHZhbHVlO1xuICAgIGlmIChwcm9wZXJ0eS5zdGFydHNXaXRoKCctLScpKSB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH0gZWxzZSBpZiAoXG4gICAgICAgIChwcm9wZXJ0eS5pbmRleE9mKCdjb2xvcicpID49IDAgJiYgcHJvcGVydHkgIT09ICctd2Via2l0LXByaW50LWNvbG9yLWFkanVzdCcpIHx8XG4gICAgICAgIHByb3BlcnR5ID09PSAnZmlsbCcgfHxcbiAgICAgICAgcHJvcGVydHkgPT09ICdzdHJva2UnXG4gICAgKSB7XG4gICAgICAgIGNvbnN0IG1vZGlmaWVyID0gZ2V0Q29sb3JNb2RpZmllcihwcm9wZXJ0eSwgdmFsdWUpO1xuICAgICAgICBpZiAobW9kaWZpZXIpIHtcbiAgICAgICAgICAgIHJldHVybiB7cHJvcGVydHksIHZhbHVlOiBtb2RpZmllciwgaW1wb3J0YW50LCBzb3VyY2VWYWx1ZX07XG4gICAgICAgIH1cbiAgICB9IGVsc2UgaWYgKHByb3BlcnR5ID09PSAnYmFja2dyb3VuZC1pbWFnZScgfHwgcHJvcGVydHkgPT09ICdsaXN0LXN0eWxlLWltYWdlJykge1xuICAgICAgICBjb25zdCBtb2RpZmllciA9IGdldEJnSW1hZ2VNb2RpZmllcih2YWx1ZSwgcnVsZSwgaWdub3JlSW1hZ2VTZWxlY3RvcnMsIGlzQ2FuY2VsbGVkKTtcbiAgICAgICAgaWYgKG1vZGlmaWVyKSB7XG4gICAgICAgICAgICByZXR1cm4ge3Byb3BlcnR5LCB2YWx1ZTogbW9kaWZpZXIsIGltcG9ydGFudCwgc291cmNlVmFsdWV9O1xuICAgICAgICB9XG4gICAgfSBlbHNlIGlmIChwcm9wZXJ0eS5pbmRleE9mKCdzaGFkb3cnKSA+PSAwKSB7XG4gICAgICAgIGNvbnN0IG1vZGlmaWVyID0gZ2V0U2hhZG93TW9kaWZpZXIocHJvcGVydHksIHZhbHVlKTtcbiAgICAgICAgaWYgKG1vZGlmaWVyKSB7XG4gICAgICAgICAgICByZXR1cm4ge3Byb3BlcnR5LCB2YWx1ZTogbW9kaWZpZXIsIGltcG9ydGFudCwgc291cmNlVmFsdWV9O1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0TW9kaWZpZWRVc2VyQWdlbnRTdHlsZSh0aGVtZTogVGhlbWUsIGlzSUZyYW1lOiBib29sZWFuLCBzdHlsZVN5c3RlbUNvbnRyb2xzOiBib29sZWFuKSB7XG4gICAgY29uc3QgbGluZXM6IHN0cmluZ1tdID0gW107XG4gICAgaWYgKCFpc0lGcmFtZSkge1xuICAgICAgICBsaW5lcy5wdXNoKCdodG1sIHsnKTtcbiAgICAgICAgbGluZXMucHVzaChgICAgIGJhY2tncm91bmQtY29sb3I6ICR7bW9kaWZ5QmFja2dyb3VuZENvbG9yKHtyOiAyNTUsIGc6IDI1NSwgYjogMjU1fSwgdGhlbWUpfSAhaW1wb3J0YW50O2ApO1xuICAgICAgICBsaW5lcy5wdXNoKCd9Jyk7XG4gICAgfVxuICAgIGxpbmVzLnB1c2goYCR7aXNJRnJhbWUgPyAnJyA6ICdodG1sLCBib2R5LCAnfSR7c3R5bGVTeXN0ZW1Db250cm9scyA/ICdpbnB1dCwgdGV4dGFyZWEsIHNlbGVjdCwgYnV0dG9uJyA6ICcnfSB7YCk7XG4gICAgbGluZXMucHVzaChgICAgIGJhY2tncm91bmQtY29sb3I6ICR7bW9kaWZ5QmFja2dyb3VuZENvbG9yKHtyOiAyNTUsIGc6IDI1NSwgYjogMjU1fSwgdGhlbWUpfTtgKTtcbiAgICBsaW5lcy5wdXNoKCd9Jyk7XG4gICAgbGluZXMucHVzaChgaHRtbCwgYm9keSwgJHtzdHlsZVN5c3RlbUNvbnRyb2xzID8gJ2lucHV0LCB0ZXh0YXJlYSwgc2VsZWN0LCBidXR0b24nIDogJyd9IHtgKTtcbiAgICBsaW5lcy5wdXNoKGAgICAgYm9yZGVyLWNvbG9yOiAke21vZGlmeUJvcmRlckNvbG9yKHtyOiA3NiwgZzogNzYsIGI6IDc2fSwgdGhlbWUpfTtgKTtcbiAgICBsaW5lcy5wdXNoKGAgICAgY29sb3I6ICR7bW9kaWZ5Rm9yZWdyb3VuZENvbG9yKHtyOiAwLCBnOiAwLCBiOiAwfSwgdGhlbWUpfTtgKTtcbiAgICBsaW5lcy5wdXNoKCd9Jyk7XG4gICAgbGluZXMucHVzaCgnYSB7Jyk7XG4gICAgbGluZXMucHVzaChgICAgIGNvbG9yOiAke21vZGlmeUZvcmVncm91bmRDb2xvcih7cjogMCwgZzogNjQsIGI6IDI1NX0sIHRoZW1lKX07YCk7XG4gICAgbGluZXMucHVzaCgnfScpO1xuICAgIGxpbmVzLnB1c2goJ3RhYmxlIHsnKTtcbiAgICBsaW5lcy5wdXNoKGAgICAgYm9yZGVyLWNvbG9yOiAke21vZGlmeUJvcmRlckNvbG9yKHtyOiAxMjgsIGc6IDEyOCwgYjogMTI4fSwgdGhlbWUpfTtgKTtcbiAgICBsaW5lcy5wdXNoKCd9Jyk7XG4gICAgbGluZXMucHVzaCgnOjpwbGFjZWhvbGRlciB7Jyk7XG4gICAgbGluZXMucHVzaChgICAgIGNvbG9yOiAke21vZGlmeUZvcmVncm91bmRDb2xvcih7cjogMTY5LCBnOiAxNjksIGI6IDE2OX0sIHRoZW1lKX07YCk7XG4gICAgbGluZXMucHVzaCgnfScpO1xuICAgIGxpbmVzLnB1c2goJ2lucHV0Oi13ZWJraXQtYXV0b2ZpbGwsJyk7XG4gICAgbGluZXMucHVzaCgndGV4dGFyZWE6LXdlYmtpdC1hdXRvZmlsbCwnKTtcbiAgICBsaW5lcy5wdXNoKCdzZWxlY3Q6LXdlYmtpdC1hdXRvZmlsbCB7Jyk7XG4gICAgbGluZXMucHVzaChgICAgIGJhY2tncm91bmQtY29sb3I6ICR7bW9kaWZ5QmFja2dyb3VuZENvbG9yKHtyOiAyNTAsIGc6IDI1NSwgYjogMTg5fSwgdGhlbWUpfSAhaW1wb3J0YW50O2ApO1xuICAgIGxpbmVzLnB1c2goYCAgICBjb2xvcjogJHttb2RpZnlGb3JlZ3JvdW5kQ29sb3Ioe3I6IDAsIGc6IDAsIGI6IDB9LCB0aGVtZSl9ICFpbXBvcnRhbnQ7YCk7XG4gICAgbGluZXMucHVzaCgnfScpO1xuICAgIGlmICh0aGVtZS5zY3JvbGxiYXJDb2xvcikge1xuICAgICAgICBsaW5lcy5wdXNoKGdldE1vZGlmaWVkU2Nyb2xsYmFyU3R5bGUodGhlbWUpKTtcbiAgICB9XG4gICAgaWYgKHRoZW1lLnNlbGVjdGlvbkNvbG9yKSB7XG4gICAgICAgIGxpbmVzLnB1c2goZ2V0TW9kaWZpZWRTZWxlY3Rpb25TdHlsZSh0aGVtZSkpO1xuICAgIH1cbiAgICByZXR1cm4gbGluZXMuam9pbignXFxuJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRTZWxlY3Rpb25Db2xvcih0aGVtZTogVGhlbWUpIHtcbiAgICBsZXQgYmFja2dyb3VuZENvbG9yU2VsZWN0aW9uOiBzdHJpbmc7XG4gICAgbGV0IGZvcmVncm91bmRDb2xvclNlbGVjdGlvbjogc3RyaW5nO1xuICAgIGlmICh0aGVtZS5zZWxlY3Rpb25Db2xvciA9PT0gJ2F1dG8nKSB7XG4gICAgICAgIGJhY2tncm91bmRDb2xvclNlbGVjdGlvbiA9IG1vZGlmeUJhY2tncm91bmRDb2xvcih7cjogMCwgZzogOTYsIGI6IDIxMn0sIHsuLi50aGVtZSwgZ3JheXNjYWxlOiAwfSk7XG4gICAgICAgIGZvcmVncm91bmRDb2xvclNlbGVjdGlvbiA9IG1vZGlmeUZvcmVncm91bmRDb2xvcih7cjogMjU1LCBnOiAyNTUsIGI6IDI1NX0sIHsuLi50aGVtZSwgZ3JheXNjYWxlOiAwfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3QgcmdiID0gcGFyc2UodGhlbWUuc2VsZWN0aW9uQ29sb3IpO1xuICAgICAgICBjb25zdCBoc2wgPSByZ2JUb0hTTChyZ2IpO1xuICAgICAgICBiYWNrZ3JvdW5kQ29sb3JTZWxlY3Rpb24gPSB0aGVtZS5zZWxlY3Rpb25Db2xvcjtcbiAgICAgICAgaWYgKGhzbC5sIDwgMC41KSB7XG4gICAgICAgICAgICBmb3JlZ3JvdW5kQ29sb3JTZWxlY3Rpb24gPSAnI0ZGRic7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBmb3JlZ3JvdW5kQ29sb3JTZWxlY3Rpb24gPSAnIzAwMCc7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHtiYWNrZ3JvdW5kQ29sb3JTZWxlY3Rpb24sIGZvcmVncm91bmRDb2xvclNlbGVjdGlvbn07XG59XG5cbmZ1bmN0aW9uIGdldE1vZGlmaWVkU2VsZWN0aW9uU3R5bGUodGhlbWU6IFRoZW1lKSB7XG4gICAgY29uc3QgbGluZXM6IHN0cmluZ1tdID0gW107XG4gICAgY29uc3QgbW9kaWZpZWRTZWxlY3Rpb25Db2xvciA9IGdldFNlbGVjdGlvbkNvbG9yKHRoZW1lKTtcbiAgICBjb25zdCBiYWNrZ3JvdW5kQ29sb3JTZWxlY3Rpb24gPSBtb2RpZmllZFNlbGVjdGlvbkNvbG9yLmJhY2tncm91bmRDb2xvclNlbGVjdGlvbjtcbiAgICBjb25zdCBmb3JlZ3JvdW5kQ29sb3JTZWxlY3Rpb24gPSBtb2RpZmllZFNlbGVjdGlvbkNvbG9yLmZvcmVncm91bmRDb2xvclNlbGVjdGlvbjtcbiAgICBbJzo6c2VsZWN0aW9uJywgJzo6LW1vei1zZWxlY3Rpb24nXS5mb3JFYWNoKChzZWxlY3Rpb24pID0+IHtcbiAgICAgICAgbGluZXMucHVzaChgJHtzZWxlY3Rpb259IHtgKTtcbiAgICAgICAgbGluZXMucHVzaChgICAgIGJhY2tncm91bmQtY29sb3I6ICR7YmFja2dyb3VuZENvbG9yU2VsZWN0aW9ufSAhaW1wb3J0YW50O2ApO1xuICAgICAgICBsaW5lcy5wdXNoKGAgICAgY29sb3I6ICR7Zm9yZWdyb3VuZENvbG9yU2VsZWN0aW9ufSAhaW1wb3J0YW50O2ApO1xuICAgICAgICBsaW5lcy5wdXNoKCd9Jyk7XG4gICAgfSk7XG4gICAgcmV0dXJuIGxpbmVzLmpvaW4oJ1xcbicpO1xufVxuXG5mdW5jdGlvbiBnZXRNb2RpZmllZFNjcm9sbGJhclN0eWxlKHRoZW1lOiBUaGVtZSkge1xuICAgIGNvbnN0IGxpbmVzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGxldCBjb2xvclRyYWNrOiBzdHJpbmc7XG4gICAgbGV0IGNvbG9ySWNvbnM6IHN0cmluZztcbiAgICBsZXQgY29sb3JUaHVtYjogc3RyaW5nO1xuICAgIGxldCBjb2xvclRodW1iSG92ZXI6IHN0cmluZztcbiAgICBsZXQgY29sb3JUaHVtYkFjdGl2ZTogc3RyaW5nO1xuICAgIGxldCBjb2xvckNvcm5lcjogc3RyaW5nO1xuICAgIGlmICh0aGVtZS5zY3JvbGxiYXJDb2xvciA9PT0gJ2F1dG8nKSB7XG4gICAgICAgIGNvbG9yVHJhY2sgPSBtb2RpZnlCYWNrZ3JvdW5kQ29sb3Ioe3I6IDI0MSwgZzogMjQxLCBiOiAyNDF9LCB0aGVtZSk7XG4gICAgICAgIGNvbG9ySWNvbnMgPSBtb2RpZnlGb3JlZ3JvdW5kQ29sb3Ioe3I6IDk2LCBnOiA5NiwgYjogOTZ9LCB0aGVtZSk7XG4gICAgICAgIGNvbG9yVGh1bWIgPSBtb2RpZnlCYWNrZ3JvdW5kQ29sb3Ioe3I6IDE3NiwgZzogMTc2LCBiOiAxNzZ9LCB0aGVtZSk7XG4gICAgICAgIGNvbG9yVGh1bWJIb3ZlciA9IG1vZGlmeUJhY2tncm91bmRDb2xvcih7cjogMTQ0LCBnOiAxNDQsIGI6IDE0NH0sIHRoZW1lKTtcbiAgICAgICAgY29sb3JUaHVtYkFjdGl2ZSA9IG1vZGlmeUJhY2tncm91bmRDb2xvcih7cjogOTYsIGc6IDk2LCBiOiA5Nn0sIHRoZW1lKTtcbiAgICAgICAgY29sb3JDb3JuZXIgPSBtb2RpZnlCYWNrZ3JvdW5kQ29sb3Ioe3I6IDI1NSwgZzogMjU1LCBiOiAyNTV9LCB0aGVtZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3QgcmdiID0gcGFyc2UodGhlbWUuc2Nyb2xsYmFyQ29sb3IpO1xuICAgICAgICBjb25zdCBoc2wgPSByZ2JUb0hTTChyZ2IpO1xuICAgICAgICBjb25zdCBpc0xpZ2h0ID0gaHNsLmwgPiAwLjU7XG4gICAgICAgIGNvbnN0IGxpZ2h0ZW4gPSAobGlnaHRlcjogbnVtYmVyKSA9PiAoey4uLmhzbCwgbDogY2xhbXAoaHNsLmwgKyBsaWdodGVyLCAwLCAxKX0pO1xuICAgICAgICBjb25zdCBkYXJrZW4gPSAoZGFya2VyOiBudW1iZXIpID0+ICh7Li4uaHNsLCBsOiBjbGFtcChoc2wubCAtIGRhcmtlciwgMCwgMSl9KTtcbiAgICAgICAgY29sb3JUcmFjayA9IGhzbFRvU3RyaW5nKGRhcmtlbigwLjQpKTtcbiAgICAgICAgY29sb3JJY29ucyA9IGhzbFRvU3RyaW5nKGlzTGlnaHQgPyBkYXJrZW4oMC40KSA6IGxpZ2h0ZW4oMC40KSk7XG4gICAgICAgIGNvbG9yVGh1bWIgPSBoc2xUb1N0cmluZyhoc2wpO1xuICAgICAgICBjb2xvclRodW1iSG92ZXIgPSBoc2xUb1N0cmluZyhsaWdodGVuKDAuMSkpO1xuICAgICAgICBjb2xvclRodW1iQWN0aXZlID0gaHNsVG9TdHJpbmcobGlnaHRlbigwLjIpKTtcbiAgICB9XG4gICAgbGluZXMucHVzaCgnOjotd2Via2l0LXNjcm9sbGJhciB7Jyk7XG4gICAgbGluZXMucHVzaChgICAgIGJhY2tncm91bmQtY29sb3I6ICR7Y29sb3JUcmFja307YCk7XG4gICAgbGluZXMucHVzaChgICAgIGNvbG9yOiAke2NvbG9ySWNvbnN9O2ApO1xuICAgIGxpbmVzLnB1c2goJ30nKTtcbiAgICBsaW5lcy5wdXNoKCc6Oi13ZWJraXQtc2Nyb2xsYmFyLXRodW1iIHsnKTtcbiAgICBsaW5lcy5wdXNoKGAgICAgYmFja2dyb3VuZC1jb2xvcjogJHtjb2xvclRodW1ifTtgKTtcbiAgICBsaW5lcy5wdXNoKCd9Jyk7XG4gICAgbGluZXMucHVzaCgnOjotd2Via2l0LXNjcm9sbGJhci10aHVtYjpob3ZlciB7Jyk7XG4gICAgbGluZXMucHVzaChgICAgIGJhY2tncm91bmQtY29sb3I6ICR7Y29sb3JUaHVtYkhvdmVyfTtgKTtcbiAgICBsaW5lcy5wdXNoKCd9Jyk7XG4gICAgbGluZXMucHVzaCgnOjotd2Via2l0LXNjcm9sbGJhci10aHVtYjphY3RpdmUgeycpO1xuICAgIGxpbmVzLnB1c2goYCAgICBiYWNrZ3JvdW5kLWNvbG9yOiAke2NvbG9yVGh1bWJBY3RpdmV9O2ApO1xuICAgIGxpbmVzLnB1c2goJ30nKTtcbiAgICBsaW5lcy5wdXNoKCc6Oi13ZWJraXQtc2Nyb2xsYmFyLWNvcm5lciB7Jyk7XG4gICAgbGluZXMucHVzaChgICAgIGJhY2tncm91bmQtY29sb3I6ICR7Y29sb3JDb3JuZXJ9O2ApO1xuICAgIGxpbmVzLnB1c2goJ30nKTtcbiAgICBsaW5lcy5wdXNoKCcqIHsnKTtcbiAgICBsaW5lcy5wdXNoKGAgICAgc2Nyb2xsYmFyLWNvbG9yOiAke2NvbG9yVHJhY2t9ICR7Y29sb3JUaHVtYn07YCk7XG4gICAgbGluZXMucHVzaCgnfScpO1xuICAgIHJldHVybiBsaW5lcy5qb2luKCdcXG4nKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldE1vZGlmaWVkRmFsbGJhY2tTdHlsZShmaWx0ZXI6IEZpbHRlckNvbmZpZywge3N0cmljdH0pIHtcbiAgICBjb25zdCBsaW5lczogc3RyaW5nW10gPSBbXTtcbiAgICBsaW5lcy5wdXNoKGBodG1sLCBib2R5LCAke3N0cmljdCA/ICdib2R5IDpub3QoaWZyYW1lKScgOiAnYm9keSA+IDpub3QoaWZyYW1lKSd9IHtgKTtcbiAgICBsaW5lcy5wdXNoKGAgICAgYmFja2dyb3VuZC1jb2xvcjogJHttb2RpZnlCYWNrZ3JvdW5kQ29sb3Ioe3I6IDI1NSwgZzogMjU1LCBiOiAyNTV9LCBmaWx0ZXIpfSAhaW1wb3J0YW50O2ApO1xuICAgIGxpbmVzLnB1c2goYCAgICBib3JkZXItY29sb3I6ICR7bW9kaWZ5Qm9yZGVyQ29sb3Ioe3I6IDY0LCBnOiA2NCwgYjogNjR9LCBmaWx0ZXIpfSAhaW1wb3J0YW50O2ApO1xuICAgIGxpbmVzLnB1c2goYCAgICBjb2xvcjogJHttb2RpZnlGb3JlZ3JvdW5kQ29sb3Ioe3I6IDAsIGc6IDAsIGI6IDB9LCBmaWx0ZXIpfSAhaW1wb3J0YW50O2ApO1xuICAgIGxpbmVzLnB1c2goJ30nKTtcbiAgICByZXR1cm4gbGluZXMuam9pbignXFxuJyk7XG59XG5cbmNvbnN0IHVucGFyc2FibGVDb2xvcnMgPSBuZXcgU2V0KFtcbiAgICAnaW5oZXJpdCcsXG4gICAgJ3RyYW5zcGFyZW50JyxcbiAgICAnaW5pdGlhbCcsXG4gICAgJ2N1cnJlbnRjb2xvcicsXG4gICAgJ25vbmUnLFxuICAgICd1bnNldCcsXG5dKTtcblxuY29uc3QgY29sb3JQYXJzZUNhY2hlID0gbmV3IE1hcDxzdHJpbmcsIFJHQkE+KCk7XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZUNvbG9yV2l0aENhY2hlKCRjb2xvcjogc3RyaW5nKSB7XG4gICAgJGNvbG9yID0gJGNvbG9yLnRyaW0oKTtcbiAgICBpZiAoY29sb3JQYXJzZUNhY2hlLmhhcygkY29sb3IpKSB7XG4gICAgICAgIHJldHVybiBjb2xvclBhcnNlQ2FjaGUuZ2V0KCRjb2xvcik7XG4gICAgfVxuICAgIGNvbnN0IGNvbG9yID0gcGFyc2UoJGNvbG9yKTtcbiAgICBjb2xvclBhcnNlQ2FjaGUuc2V0KCRjb2xvciwgY29sb3IpO1xuICAgIHJldHVybiBjb2xvcjtcbn1cblxuZnVuY3Rpb24gdHJ5UGFyc2VDb2xvcigkY29sb3I6IHN0cmluZykge1xuICAgIHRyeSB7XG4gICAgICAgIHJldHVybiBwYXJzZUNvbG9yV2l0aENhY2hlKCRjb2xvcik7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gZ2V0Q29sb3JNb2RpZmllcihwcm9wOiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcgfCBDU1NWYWx1ZU1vZGlmaWVyIHtcbiAgICBpZiAodW5wYXJzYWJsZUNvbG9ycy5oYXModmFsdWUudG9Mb3dlckNhc2UoKSkpIHtcbiAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgIH1cbiAgICB0cnkge1xuICAgICAgICBjb25zdCByZ2IgPSBwYXJzZUNvbG9yV2l0aENhY2hlKHZhbHVlKTtcbiAgICAgICAgaWYgKHByb3AuaW5kZXhPZignYmFja2dyb3VuZCcpID49IDApIHtcbiAgICAgICAgICAgIHJldHVybiAoZmlsdGVyKSA9PiBtb2RpZnlCYWNrZ3JvdW5kQ29sb3IocmdiLCBmaWx0ZXIpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChwcm9wLmluZGV4T2YoJ2JvcmRlcicpID49IDAgfHwgcHJvcC5pbmRleE9mKCdvdXRsaW5lJykgPj0gMCkge1xuICAgICAgICAgICAgcmV0dXJuIChmaWx0ZXIpID0+IG1vZGlmeUJvcmRlckNvbG9yKHJnYiwgZmlsdGVyKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gKGZpbHRlcikgPT4gbW9kaWZ5Rm9yZWdyb3VuZENvbG9yKHJnYiwgZmlsdGVyKTtcblxuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICBsb2dXYXJuKCdDb2xvciBwYXJzZSBlcnJvcicsIGVycik7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbn1cblxuY29uc3QgZ3JhZGllbnRSZWdleCA9IC9bXFwtYS16XStncmFkaWVudFxcKChbXlxcKFxcKV0qKFxcKChbXlxcKFxcKV0qKFxcKC4qP1xcKSkpKlteXFwoXFwpXSpcXCkpKXswLDE1fVteXFwoXFwpXSpcXCkvZztcbmNvbnN0IGltYWdlRGV0YWlsc0NhY2hlID0gbmV3IE1hcDxzdHJpbmcsIEltYWdlRGV0YWlscz4oKTtcbmNvbnN0IGF3YWl0aW5nRm9ySW1hZ2VMb2FkaW5nID0gbmV3IE1hcDxzdHJpbmcsICgoaW1hZ2VEZXRhaWxzOiBJbWFnZURldGFpbHMpID0+IHZvaWQpW10+KCk7XG5cbmZ1bmN0aW9uIHNob3VsZElnbm9yZUltYWdlKGVsZW1lbnQ6IENTU1N0eWxlUnVsZSwgc2VsZWN0b3JzOiBzdHJpbmdbXSkge1xuICAgIGlmICghZWxlbWVudCkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc2VsZWN0b3JzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGNvbnN0IGluZ25vcmVkU2VsZWN0b3IgPSBzZWxlY3RvcnNbaV07XG4gICAgICAgIGlmIChlbGVtZW50LnNlbGVjdG9yVGV4dC5tYXRjaChpbmdub3JlZFNlbGVjdG9yKSkge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xufVxuXG5mdW5jdGlvbiBnZXRCZ0ltYWdlTW9kaWZpZXIodmFsdWU6IHN0cmluZywgcnVsZTogQ1NTU3R5bGVSdWxlLCBpZ25vcmVJbWFnZVNlbGVjdG9yczogc3RyaW5nW10sIGlzQ2FuY2VsbGVkOiAoKSA9PiBib29sZWFuKTogc3RyaW5nIHwgQ1NTVmFsdWVNb2RpZmllciB7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgZ3JhZGllbnRzID0gZ2V0TWF0Y2hlcyhncmFkaWVudFJlZ2V4LCB2YWx1ZSk7XG4gICAgICAgIGNvbnN0IHVybHMgPSBnZXRNYXRjaGVzKGNzc1VSTFJlZ2V4LCB2YWx1ZSk7XG5cbiAgICAgICAgaWYgKHVybHMubGVuZ3RoID09PSAwICYmIGdyYWRpZW50cy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGdldEluZGljZXMgPSAobWF0Y2hlczogc3RyaW5nW10pID0+IHtcbiAgICAgICAgICAgIGxldCBpbmRleCA9IDA7XG4gICAgICAgICAgICByZXR1cm4gbWF0Y2hlcy5tYXAoKG1hdGNoKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgdmFsdWVJbmRleCA9IHZhbHVlLmluZGV4T2YobWF0Y2gsIGluZGV4KTtcbiAgICAgICAgICAgICAgICBpbmRleCA9IHZhbHVlSW5kZXggKyBtYXRjaC5sZW5ndGg7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHttYXRjaCwgaW5kZXg6IHZhbHVlSW5kZXh9O1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH07XG4gICAgICAgIGNvbnN0IG1hdGNoZXMgPSBnZXRJbmRpY2VzKHVybHMpLm1hcCgoaSkgPT4gKHt0eXBlOiAndXJsJywgLi4uaX0pKVxuICAgICAgICAgICAgLmNvbmNhdChnZXRJbmRpY2VzKGdyYWRpZW50cykubWFwKChpKSA9PiAoe3R5cGU6ICdncmFkaWVudCcsIC4uLml9KSkpXG4gICAgICAgICAgICAuc29ydCgoYSwgYikgPT4gYS5pbmRleCAtIGIuaW5kZXgpO1xuXG4gICAgICAgIGNvbnN0IGdldEdyYWRpZW50TW9kaWZpZXIgPSAoZ3JhZGllbnQ6IHN0cmluZykgPT4ge1xuICAgICAgICAgICAgY29uc3QgbWF0Y2ggPSBncmFkaWVudC5tYXRjaCgvXiguKi1ncmFkaWVudClcXCgoLiopXFwpJC8pO1xuICAgICAgICAgICAgY29uc3QgdHlwZSA9IG1hdGNoWzFdO1xuICAgICAgICAgICAgY29uc3QgY29udGVudCA9IG1hdGNoWzJdO1xuXG4gICAgICAgICAgICBjb25zdCBwYXJ0c1JlZ2V4ID0gLyhbXlxcKFxcKSxdKyhcXChbXlxcKFxcKV0qKFxcKFteXFwoXFwpXSpcXCkqW15cXChcXCldKik/XFwpKT9bXlxcKFxcKSxdKiksPy9nO1xuICAgICAgICAgICAgY29uc3QgY29sb3JTdG9wUmVnZXggPSAvXihmcm9tfGNvbG9yLXN0b3B8dG8pXFwoKFteXFwoXFwpXSo/LFxccyopPyguKj8pXFwpJC87XG5cbiAgICAgICAgICAgIGNvbnN0IHBhcnRzID0gZ2V0TWF0Y2hlcyhwYXJ0c1JlZ2V4LCBjb250ZW50LCAxKS5tYXAoKHBhcnQpID0+IHtcbiAgICAgICAgICAgICAgICBwYXJ0ID0gcGFydC50cmltKCk7XG5cbiAgICAgICAgICAgICAgICBsZXQgcmdiID0gdHJ5UGFyc2VDb2xvcihwYXJ0KTtcbiAgICAgICAgICAgICAgICBpZiAocmdiKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiAoZmlsdGVyOiBGaWx0ZXJDb25maWcpID0+IG1vZGlmeUdyYWRpZW50Q29sb3IocmdiLCBmaWx0ZXIpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGNvbnN0IHNwYWNlID0gcGFydC5sYXN0SW5kZXhPZignICcpO1xuICAgICAgICAgICAgICAgIHJnYiA9IHRyeVBhcnNlQ29sb3IocGFydC5zdWJzdHJpbmcoMCwgc3BhY2UpKTtcbiAgICAgICAgICAgICAgICBpZiAocmdiKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiAoZmlsdGVyOiBGaWx0ZXJDb25maWcpID0+IGAke21vZGlmeUdyYWRpZW50Q29sb3IocmdiLCBmaWx0ZXIpfSAke3BhcnQuc3Vic3RyaW5nKHNwYWNlICsgMSl9YDtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBjb25zdCBjb2xvclN0b3BNYXRjaCA9IHBhcnQubWF0Y2goY29sb3JTdG9wUmVnZXgpO1xuICAgICAgICAgICAgICAgIGlmIChjb2xvclN0b3BNYXRjaCkge1xuICAgICAgICAgICAgICAgICAgICByZ2IgPSB0cnlQYXJzZUNvbG9yKGNvbG9yU3RvcE1hdGNoWzNdKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJnYikge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIChmaWx0ZXI6IEZpbHRlckNvbmZpZykgPT4gYCR7Y29sb3JTdG9wTWF0Y2hbMV19KCR7Y29sb3JTdG9wTWF0Y2hbMl0gPyBgJHtjb2xvclN0b3BNYXRjaFsyXX0sIGAgOiAnJ30ke21vZGlmeUdyYWRpZW50Q29sb3IocmdiLCBmaWx0ZXIpfSlgO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcmV0dXJuICgpID0+IHBhcnQ7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgcmV0dXJuIChmaWx0ZXI6IEZpbHRlckNvbmZpZykgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiBgJHt0eXBlfSgke3BhcnRzLm1hcCgobW9kaWZ5KSA9PiBtb2RpZnkoZmlsdGVyKSkuam9pbignLCAnKX0pYDtcbiAgICAgICAgICAgIH07XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3QgZ2V0VVJMTW9kaWZpZXIgPSAodXJsVmFsdWU6IHN0cmluZykgPT4ge1xuICAgICAgICAgICAgbGV0IHVybCA9IGdldENTU1VSTFZhbHVlKHVybFZhbHVlKTtcbiAgICAgICAgICAgIGlmIChydWxlLnBhcmVudFN0eWxlU2hlZXQuaHJlZikge1xuICAgICAgICAgICAgICAgIGNvbnN0IGJhc2VQYXRoID0gZ2V0Q1NTQmFzZUJhdGgocnVsZS5wYXJlbnRTdHlsZVNoZWV0LmhyZWYpO1xuICAgICAgICAgICAgICAgIHVybCA9IGdldEFic29sdXRlVVJMKGJhc2VQYXRoLCB1cmwpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChydWxlLnBhcmVudFN0eWxlU2hlZXQub3duZXJOb2RlICYmIHJ1bGUucGFyZW50U3R5bGVTaGVldC5vd25lck5vZGUuYmFzZVVSSSkge1xuICAgICAgICAgICAgICAgIHVybCA9IGdldEFic29sdXRlVVJMKHJ1bGUucGFyZW50U3R5bGVTaGVldC5vd25lck5vZGUuYmFzZVVSSSwgdXJsKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdXJsID0gZ2V0QWJzb2x1dGVVUkwobG9jYXRpb24ub3JpZ2luLCB1cmwpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBhYnNvbHV0ZVZhbHVlID0gYHVybChcIiR7dXJsfVwiKWA7XG5cbiAgICAgICAgICAgIHJldHVybiBhc3luYyAoZmlsdGVyOiBGaWx0ZXJDb25maWcpID0+IHtcbiAgICAgICAgICAgICAgICBsZXQgaW1hZ2VEZXRhaWxzOiBJbWFnZURldGFpbHM7XG4gICAgICAgICAgICAgICAgaWYgKGltYWdlRGV0YWlsc0NhY2hlLmhhcyh1cmwpKSB7XG4gICAgICAgICAgICAgICAgICAgIGltYWdlRGV0YWlscyA9IGltYWdlRGV0YWlsc0NhY2hlLmdldCh1cmwpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoc2hvdWxkSWdub3JlSW1hZ2UocnVsZSwgaWdub3JlSW1hZ2VTZWxlY3RvcnMpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoYXdhaXRpbmdGb3JJbWFnZUxvYWRpbmcuaGFzKHVybCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBhd2FpdGVycyA9IGF3YWl0aW5nRm9ySW1hZ2VMb2FkaW5nLmdldCh1cmwpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGltYWdlRGV0YWlscyA9IGF3YWl0IG5ldyBQcm9taXNlPEltYWdlRGV0YWlscz4oKHJlc29sdmUpID0+IGF3YWl0ZXJzLnB1c2gocmVzb2x2ZSkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghaW1hZ2VEZXRhaWxzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXRpbmdGb3JJbWFnZUxvYWRpbmcuc2V0KHVybCwgW10pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGltYWdlRGV0YWlscyA9IGF3YWl0IGdldEltYWdlRGV0YWlscyh1cmwpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGltYWdlRGV0YWlsc0NhY2hlLnNldCh1cmwsIGltYWdlRGV0YWlscyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXRpbmdGb3JJbWFnZUxvYWRpbmcuZ2V0KHVybCkuZm9yRWFjaCgocmVzb2x2ZSkgPT4gcmVzb2x2ZShpbWFnZURldGFpbHMpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBhd2FpdGluZ0ZvckltYWdlTG9hZGluZy5kZWxldGUodXJsKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpc0NhbmNlbGxlZCgpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgICAgICAgICAgICAgbG9nV2FybihlcnIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGF3YWl0aW5nRm9ySW1hZ2VMb2FkaW5nLmhhcyh1cmwpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXRpbmdGb3JJbWFnZUxvYWRpbmcuZ2V0KHVybCkuZm9yRWFjaCgocmVzb2x2ZSkgPT4gcmVzb2x2ZShudWxsKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXRpbmdGb3JJbWFnZUxvYWRpbmcuZGVsZXRlKHVybCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gYWJzb2x1dGVWYWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCBiZ0ltYWdlVmFsdWUgPSBnZXRCZ0ltYWdlVmFsdWUoaW1hZ2VEZXRhaWxzLCBmaWx0ZXIpIHx8IGFic29sdXRlVmFsdWU7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGJnSW1hZ2VWYWx1ZTtcbiAgICAgICAgICAgIH07XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3QgZ2V0QmdJbWFnZVZhbHVlID0gKGltYWdlRGV0YWlsczogSW1hZ2VEZXRhaWxzLCBmaWx0ZXI6IEZpbHRlckNvbmZpZykgPT4ge1xuICAgICAgICAgICAgY29uc3Qge2lzRGFyaywgaXNMaWdodCwgaXNUcmFuc3BhcmVudCwgaXNMYXJnZSwgd2lkdGh9ID0gaW1hZ2VEZXRhaWxzO1xuICAgICAgICAgICAgbGV0IHJlc3VsdDogc3RyaW5nO1xuICAgICAgICAgICAgaWYgKGlzRGFyayAmJiBpc1RyYW5zcGFyZW50ICYmIGZpbHRlci5tb2RlID09PSAxICYmICFpc0xhcmdlICYmIHdpZHRoID4gMikge1xuICAgICAgICAgICAgICAgIGxvZ0luZm8oYEludmVydGluZyBkYXJrIGltYWdlICR7aW1hZ2VEZXRhaWxzLnNyY31gKTtcbiAgICAgICAgICAgICAgICBjb25zdCBpbnZlcnRlZCA9IGdldEZpbHRlcmVkSW1hZ2VEYXRhVVJMKGltYWdlRGV0YWlscywgey4uLmZpbHRlciwgc2VwaWE6IGNsYW1wKGZpbHRlci5zZXBpYSArIDEwLCAwLCAxMDApfSk7XG4gICAgICAgICAgICAgICAgcmVzdWx0ID0gYHVybChcIiR7aW52ZXJ0ZWR9XCIpYDtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoaXNMaWdodCAmJiAhaXNUcmFuc3BhcmVudCAmJiBmaWx0ZXIubW9kZSA9PT0gMSkge1xuICAgICAgICAgICAgICAgIGlmIChpc0xhcmdlKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdCA9ICdub25lJztcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBsb2dJbmZvKGBEaW1taW5nIGxpZ2h0IGltYWdlICR7aW1hZ2VEZXRhaWxzLnNyY31gKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZGltbWVkID0gZ2V0RmlsdGVyZWRJbWFnZURhdGFVUkwoaW1hZ2VEZXRhaWxzLCBmaWx0ZXIpO1xuICAgICAgICAgICAgICAgICAgICByZXN1bHQgPSBgdXJsKFwiJHtkaW1tZWR9XCIpYDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGZpbHRlci5tb2RlID09PSAwICYmIGlzTGlnaHQgJiYgIWlzTGFyZ2UpIHtcbiAgICAgICAgICAgICAgICBsb2dJbmZvKGBBcHBseWluZyBmaWx0ZXIgdG8gaW1hZ2UgJHtpbWFnZURldGFpbHMuc3JjfWApO1xuICAgICAgICAgICAgICAgIGNvbnN0IGZpbHRlcmVkID0gZ2V0RmlsdGVyZWRJbWFnZURhdGFVUkwoaW1hZ2VEZXRhaWxzLCB7Li4uZmlsdGVyLCBicmlnaHRuZXNzOiBjbGFtcChmaWx0ZXIuYnJpZ2h0bmVzcyAtIDEwLCA1LCAyMDApLCBzZXBpYTogY2xhbXAoZmlsdGVyLnNlcGlhICsgMTAsIDAsIDEwMCl9KTtcbiAgICAgICAgICAgICAgICByZXN1bHQgPSBgdXJsKFwiJHtmaWx0ZXJlZH1cIilgO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXN1bHQgPSBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCBtb2RpZmllcnM6IENTU1ZhbHVlTW9kaWZpZXJbXSA9IFtdO1xuXG4gICAgICAgIGxldCBpbmRleCA9IDA7XG4gICAgICAgIG1hdGNoZXMuZm9yRWFjaCgoe21hdGNoLCB0eXBlLCBpbmRleDogbWF0Y2hTdGFydH0sIGkpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHByZWZpeFN0YXJ0ID0gaW5kZXg7XG4gICAgICAgICAgICBjb25zdCBtYXRjaEVuZCA9IG1hdGNoU3RhcnQgKyBtYXRjaC5sZW5ndGg7XG4gICAgICAgICAgICBpbmRleCA9IG1hdGNoRW5kO1xuICAgICAgICAgICAgbW9kaWZpZXJzLnB1c2goKCkgPT4gdmFsdWUuc3Vic3RyaW5nKHByZWZpeFN0YXJ0LCBtYXRjaFN0YXJ0KSk7XG4gICAgICAgICAgICBtb2RpZmllcnMucHVzaCh0eXBlID09PSAndXJsJyA/IGdldFVSTE1vZGlmaWVyKG1hdGNoKSA6IGdldEdyYWRpZW50TW9kaWZpZXIobWF0Y2gpKTtcbiAgICAgICAgICAgIGlmIChpID09PSBtYXRjaGVzLmxlbmd0aCAtIDEpIHtcbiAgICAgICAgICAgICAgICBtb2RpZmllcnMucHVzaCgoKSA9PiB2YWx1ZS5zdWJzdHJpbmcobWF0Y2hFbmQpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIChmaWx0ZXI6IEZpbHRlckNvbmZpZykgPT4ge1xuICAgICAgICAgICAgY29uc3QgcmVzdWx0cyA9IG1vZGlmaWVycy5tYXAoKG1vZGlmeSkgPT4gbW9kaWZ5KGZpbHRlcikpO1xuICAgICAgICAgICAgaWYgKHJlc3VsdHMuc29tZSgocikgPT4gciBpbnN0YW5jZW9mIFByb21pc2UpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UuYWxsKHJlc3VsdHMpXG4gICAgICAgICAgICAgICAgICAgIC50aGVuKChhc3luY1Jlc3VsdHMpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBhc3luY1Jlc3VsdHMuam9pbignJyk7XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdHMuam9pbignJyk7XG4gICAgICAgIH07XG5cbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgbG9nV2FybihgVW5hYmxlIHRvIHBhcnNlIGdyYWRpZW50ICR7dmFsdWV9YCwgZXJyKTtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBnZXRTaGFkb3dNb2RpZmllcihwcm9wOiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcpOiBDU1NWYWx1ZU1vZGlmaWVyIHtcbiAgICB0cnkge1xuICAgICAgICBsZXQgaW5kZXggPSAwO1xuICAgICAgICBjb25zdCBjb2xvck1hdGNoZXMgPSBnZXRNYXRjaGVzKC8oXnxcXHMpKFthLXpdK1xcKC4rP1xcKXwjWzAtOWEtZl0rfFthLXpdKykoLio/KGluc2V0fG91dHNldCk/KCR8LCkpL2lnLCB2YWx1ZSwgMik7XG4gICAgICAgIGNvbnN0IG1vZGlmaWVycyA9IGNvbG9yTWF0Y2hlcy5tYXAoKG1hdGNoLCBpKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBwcmVmaXhJbmRleCA9IGluZGV4O1xuICAgICAgICAgICAgY29uc3QgbWF0Y2hJbmRleCA9IHZhbHVlLmluZGV4T2YobWF0Y2gsIGluZGV4KTtcbiAgICAgICAgICAgIGNvbnN0IG1hdGNoRW5kID0gbWF0Y2hJbmRleCArIG1hdGNoLmxlbmd0aDtcbiAgICAgICAgICAgIGluZGV4ID0gbWF0Y2hFbmQ7XG4gICAgICAgICAgICBjb25zdCByZ2IgPSB0cnlQYXJzZUNvbG9yKG1hdGNoKTtcbiAgICAgICAgICAgIGlmICghcmdiKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuICgpID0+IHZhbHVlLnN1YnN0cmluZyhwcmVmaXhJbmRleCwgbWF0Y2hFbmQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIChmaWx0ZXI6IEZpbHRlckNvbmZpZykgPT4gYCR7dmFsdWUuc3Vic3RyaW5nKHByZWZpeEluZGV4LCBtYXRjaEluZGV4KX0ke21vZGlmeVNoYWRvd0NvbG9yKHJnYiwgZmlsdGVyKX0ke2kgPT09IGNvbG9yTWF0Y2hlcy5sZW5ndGggLSAxID8gdmFsdWUuc3Vic3RyaW5nKG1hdGNoRW5kKSA6ICcnfWA7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiAoZmlsdGVyOiBGaWx0ZXJDb25maWcpID0+IG1vZGlmaWVycy5tYXAoKG1vZGlmeSkgPT4gbW9kaWZ5KGZpbHRlcikpLmpvaW4oJycpO1xuXG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIGxvZ1dhcm4oYFVuYWJsZSB0byBwYXJzZSBzaGFkb3cgJHt2YWx1ZX1gLCBlcnIpO1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjbGVhbk1vZGlmaWNhdGlvbkNhY2hlKCkge1xuICAgIGNvbG9yUGFyc2VDYWNoZS5jbGVhcigpO1xuICAgIGNsZWFyQ29sb3JNb2RpZmljYXRpb25DYWNoZSgpO1xuICAgIGltYWdlRGV0YWlsc0NhY2hlLmNsZWFyKCk7XG4gICAgY2xlYW5JbWFnZVByb2Nlc3NpbmdDYWNoZSgpO1xuICAgIGF3YWl0aW5nRm9ySW1hZ2VMb2FkaW5nLmNsZWFyKCk7XG59XG4iLCJpbXBvcnQge2ZvckVhY2gsIHB1c2h9IGZyb20gJy4uLy4uL3V0aWxzL2FycmF5JztcbmltcG9ydCB7aXRlcmF0ZVNoYWRvd0hvc3RzLCBjcmVhdGVPcHRpbWl6ZWRUcmVlT2JzZXJ2ZXJ9IGZyb20gJy4uL3V0aWxzL2RvbSc7XG5pbXBvcnQge2l0ZXJhdGVDU1NEZWNsYXJhdGlvbnN9IGZyb20gJy4vY3NzLXJ1bGVzJztcbmltcG9ydCB7Z2V0TW9kaWZpYWJsZUNTU0RlY2xhcmF0aW9ufSBmcm9tICcuL21vZGlmeS1jc3MnO1xuaW1wb3J0IHtGaWx0ZXJDb25maWd9IGZyb20gJy4uLy4uL2RlZmluaXRpb25zJztcbmltcG9ydCB7SVNfU0hBRE9XX0RPTV9TVVBQT1JURUR9IGZyb20gJy4uLy4uL3V0aWxzL3BsYXRmb3JtJztcblxuaW50ZXJmYWNlIE92ZXJyaWRlcyB7XG4gICAgW2Nzc1Byb3A6IHN0cmluZ106IHtcbiAgICAgICAgY3VzdG9tUHJvcDogc3RyaW5nO1xuICAgICAgICBjc3NQcm9wOiBzdHJpbmc7XG4gICAgICAgIGRhdGFBdHRyOiBzdHJpbmc7XG4gICAgICAgIHN0b3JlOiBXZWFrU2V0PE5vZGU+O1xuICAgIH07XG59XG5cbmNvbnN0IG92ZXJyaWRlczogT3ZlcnJpZGVzID0ge1xuICAgICdiYWNrZ3JvdW5kLWNvbG9yJzoge1xuICAgICAgICBjdXN0b21Qcm9wOiAnLS1kYXJrcmVhZGVyLWlubGluZS1iZ2NvbG9yJyxcbiAgICAgICAgY3NzUHJvcDogJ2JhY2tncm91bmQtY29sb3InLFxuICAgICAgICBkYXRhQXR0cjogJ2RhdGEtZGFya3JlYWRlci1pbmxpbmUtYmdjb2xvcicsXG4gICAgICAgIHN0b3JlOiBuZXcgV2Vha1NldCgpLFxuICAgIH0sXG4gICAgJ2JhY2tncm91bmQtaW1hZ2UnOiB7XG4gICAgICAgIGN1c3RvbVByb3A6ICctLWRhcmtyZWFkZXItaW5saW5lLWJnaW1hZ2UnLFxuICAgICAgICBjc3NQcm9wOiAnYmFja2dyb3VuZC1pbWFnZScsXG4gICAgICAgIGRhdGFBdHRyOiAnZGF0YS1kYXJrcmVhZGVyLWlubGluZS1iZ2ltYWdlJyxcbiAgICAgICAgc3RvcmU6IG5ldyBXZWFrU2V0KCksXG4gICAgfSxcbiAgICAnYm9yZGVyLWNvbG9yJzoge1xuICAgICAgICBjdXN0b21Qcm9wOiAnLS1kYXJrcmVhZGVyLWlubGluZS1ib3JkZXInLFxuICAgICAgICBjc3NQcm9wOiAnYm9yZGVyLWNvbG9yJyxcbiAgICAgICAgZGF0YUF0dHI6ICdkYXRhLWRhcmtyZWFkZXItaW5saW5lLWJvcmRlcicsXG4gICAgICAgIHN0b3JlOiBuZXcgV2Vha1NldCgpLFxuICAgIH0sXG4gICAgJ2JvcmRlci1ib3R0b20tY29sb3InOiB7XG4gICAgICAgIGN1c3RvbVByb3A6ICctLWRhcmtyZWFkZXItaW5saW5lLWJvcmRlci1ib3R0b20nLFxuICAgICAgICBjc3NQcm9wOiAnYm9yZGVyLWJvdHRvbS1jb2xvcicsXG4gICAgICAgIGRhdGFBdHRyOiAnZGF0YS1kYXJrcmVhZGVyLWlubGluZS1ib3JkZXItYm90dG9tJyxcbiAgICAgICAgc3RvcmU6IG5ldyBXZWFrU2V0KCksXG4gICAgfSxcbiAgICAnYm9yZGVyLWxlZnQtY29sb3InOiB7XG4gICAgICAgIGN1c3RvbVByb3A6ICctLWRhcmtyZWFkZXItaW5saW5lLWJvcmRlci1sZWZ0JyxcbiAgICAgICAgY3NzUHJvcDogJ2JvcmRlci1sZWZ0LWNvbG9yJyxcbiAgICAgICAgZGF0YUF0dHI6ICdkYXRhLWRhcmtyZWFkZXItaW5saW5lLWJvcmRlci1sZWZ0JyxcbiAgICAgICAgc3RvcmU6IG5ldyBXZWFrU2V0KCksXG4gICAgfSxcbiAgICAnYm9yZGVyLXJpZ2h0LWNvbG9yJzoge1xuICAgICAgICBjdXN0b21Qcm9wOiAnLS1kYXJrcmVhZGVyLWlubGluZS1ib3JkZXItcmlnaHQnLFxuICAgICAgICBjc3NQcm9wOiAnYm9yZGVyLXJpZ2h0LWNvbG9yJyxcbiAgICAgICAgZGF0YUF0dHI6ICdkYXRhLWRhcmtyZWFkZXItaW5saW5lLWJvcmRlci1yaWdodCcsXG4gICAgICAgIHN0b3JlOiBuZXcgV2Vha1NldCgpLFxuICAgIH0sXG4gICAgJ2JvcmRlci10b3AtY29sb3InOiB7XG4gICAgICAgIGN1c3RvbVByb3A6ICctLWRhcmtyZWFkZXItaW5saW5lLWJvcmRlci10b3AnLFxuICAgICAgICBjc3NQcm9wOiAnYm9yZGVyLXRvcC1jb2xvcicsXG4gICAgICAgIGRhdGFBdHRyOiAnZGF0YS1kYXJrcmVhZGVyLWlubGluZS1ib3JkZXItdG9wJyxcbiAgICAgICAgc3RvcmU6IG5ldyBXZWFrU2V0KCksXG4gICAgfSxcbiAgICAnYm94LXNoYWRvdyc6IHtcbiAgICAgICAgY3VzdG9tUHJvcDogJy0tZGFya3JlYWRlci1pbmxpbmUtYm94c2hhZG93JyxcbiAgICAgICAgY3NzUHJvcDogJ2JveC1zaGFkb3cnLFxuICAgICAgICBkYXRhQXR0cjogJ2RhdGEtZGFya3JlYWRlci1pbmxpbmUtYm94c2hhZG93JyxcbiAgICAgICAgc3RvcmU6IG5ldyBXZWFrU2V0KCksXG4gICAgfSxcbiAgICAnY29sb3InOiB7XG4gICAgICAgIGN1c3RvbVByb3A6ICctLWRhcmtyZWFkZXItaW5saW5lLWNvbG9yJyxcbiAgICAgICAgY3NzUHJvcDogJ2NvbG9yJyxcbiAgICAgICAgZGF0YUF0dHI6ICdkYXRhLWRhcmtyZWFkZXItaW5saW5lLWNvbG9yJyxcbiAgICAgICAgc3RvcmU6IG5ldyBXZWFrU2V0KCksXG4gICAgfSxcbiAgICAnZmlsbCc6IHtcbiAgICAgICAgY3VzdG9tUHJvcDogJy0tZGFya3JlYWRlci1pbmxpbmUtZmlsbCcsXG4gICAgICAgIGNzc1Byb3A6ICdmaWxsJyxcbiAgICAgICAgZGF0YUF0dHI6ICdkYXRhLWRhcmtyZWFkZXItaW5saW5lLWZpbGwnLFxuICAgICAgICBzdG9yZTogbmV3IFdlYWtTZXQoKSxcbiAgICB9LFxuICAgICdzdHJva2UnOiB7XG4gICAgICAgIGN1c3RvbVByb3A6ICctLWRhcmtyZWFkZXItaW5saW5lLXN0cm9rZScsXG4gICAgICAgIGNzc1Byb3A6ICdzdHJva2UnLFxuICAgICAgICBkYXRhQXR0cjogJ2RhdGEtZGFya3JlYWRlci1pbmxpbmUtc3Ryb2tlJyxcbiAgICAgICAgc3RvcmU6IG5ldyBXZWFrU2V0KCksXG4gICAgfSxcbiAgICAnb3V0bGluZS1jb2xvcic6IHtcbiAgICAgICAgY3VzdG9tUHJvcDogJy0tZGFya3JlYWRlci1pbmxpbmUtb3V0bGluZScsXG4gICAgICAgIGNzc1Byb3A6ICdvdXRsaW5lLWNvbG9yJyxcbiAgICAgICAgZGF0YUF0dHI6ICdkYXRhLWRhcmtyZWFkZXItaW5saW5lLW91dGxpbmUnLFxuICAgICAgICBzdG9yZTogbmV3IFdlYWtTZXQoKSxcbiAgICB9LFxufTtcblxuY29uc3Qgb3ZlcnJpZGVzTGlzdCA9IE9iamVjdC52YWx1ZXMob3ZlcnJpZGVzKTtcblxuY29uc3QgSU5MSU5FX1NUWUxFX0FUVFJTID0gWydzdHlsZScsICdmaWxsJywgJ3N0cm9rZScsICdiZ2NvbG9yJywgJ2NvbG9yJ107XG5leHBvcnQgY29uc3QgSU5MSU5FX1NUWUxFX1NFTEVDVE9SID0gSU5MSU5FX1NUWUxFX0FUVFJTLm1hcCgoYXR0cikgPT4gYFske2F0dHJ9XWApLmpvaW4oJywgJyk7XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRJbmxpbmVPdmVycmlkZVN0eWxlKCkge1xuICAgIHJldHVybiBvdmVycmlkZXNMaXN0Lm1hcCgoe2RhdGFBdHRyLCBjdXN0b21Qcm9wLCBjc3NQcm9wfSkgPT4ge1xuICAgICAgICByZXR1cm4gW1xuICAgICAgICAgICAgYFske2RhdGFBdHRyfV0ge2AsXG4gICAgICAgICAgICBgICAke2Nzc1Byb3B9OiB2YXIoJHtjdXN0b21Qcm9wfSkgIWltcG9ydGFudDtgLFxuICAgICAgICAgICAgJ30nLFxuICAgICAgICBdLmpvaW4oJ1xcbicpO1xuICAgIH0pLmpvaW4oJ1xcbicpO1xufVxuXG5mdW5jdGlvbiBnZXRJbmxpbmVTdHlsZUVsZW1lbnRzKHJvb3Q6IE5vZGUpIHtcbiAgICBjb25zdCByZXN1bHRzOiBFbGVtZW50W10gPSBbXTtcbiAgICBpZiAocm9vdCBpbnN0YW5jZW9mIEVsZW1lbnQgJiYgcm9vdC5tYXRjaGVzKElOTElORV9TVFlMRV9TRUxFQ1RPUikpIHtcbiAgICAgICAgcmVzdWx0cy5wdXNoKHJvb3QpO1xuICAgIH1cbiAgICBpZiAocm9vdCBpbnN0YW5jZW9mIEVsZW1lbnQgfHwgKElTX1NIQURPV19ET01fU1VQUE9SVEVEICYmIHJvb3QgaW5zdGFuY2VvZiBTaGFkb3dSb290KSB8fCByb290IGluc3RhbmNlb2YgRG9jdW1lbnQpIHtcbiAgICAgICAgcHVzaChyZXN1bHRzLCByb290LnF1ZXJ5U2VsZWN0b3JBbGwoSU5MSU5FX1NUWUxFX1NFTEVDVE9SKSk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHRzO1xufVxuXG5jb25zdCB0cmVlT2JzZXJ2ZXJzID0gbmV3IE1hcDxOb2RlLCB7ZGlzY29ubmVjdCgpOiB2b2lkfT4oKTtcbmNvbnN0IGF0dHJPYnNlcnZlcnMgPSBuZXcgTWFwPE5vZGUsIE11dGF0aW9uT2JzZXJ2ZXI+KCk7XG5cbmV4cG9ydCBmdW5jdGlvbiB3YXRjaEZvcklubGluZVN0eWxlcyhcbiAgICBlbGVtZW50U3R5bGVEaWRDaGFuZ2U6IChlbGVtZW50OiBIVE1MRWxlbWVudCkgPT4gdm9pZCxcbiAgICBzaGFkb3dSb290RGlzY292ZXJlZDogKHJvb3Q6IFNoYWRvd1Jvb3QpID0+IHZvaWQsXG4pIHtcbiAgICBkZWVwV2F0Y2hGb3JJbmxpbmVTdHlsZXMoZG9jdW1lbnQsIGVsZW1lbnRTdHlsZURpZENoYW5nZSwgc2hhZG93Um9vdERpc2NvdmVyZWQpO1xuICAgIGl0ZXJhdGVTaGFkb3dIb3N0cyhkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQsIChob3N0KSA9PiB7XG4gICAgICAgIGRlZXBXYXRjaEZvcklubGluZVN0eWxlcyhob3N0LnNoYWRvd1Jvb3QsIGVsZW1lbnRTdHlsZURpZENoYW5nZSwgc2hhZG93Um9vdERpc2NvdmVyZWQpO1xuICAgIH0pO1xufVxuXG5mdW5jdGlvbiBkZWVwV2F0Y2hGb3JJbmxpbmVTdHlsZXMoXG4gICAgcm9vdDogRG9jdW1lbnQgfCBTaGFkb3dSb290LFxuICAgIGVsZW1lbnRTdHlsZURpZENoYW5nZTogKGVsZW1lbnQ6IEhUTUxFbGVtZW50KSA9PiB2b2lkLFxuICAgIHNoYWRvd1Jvb3REaXNjb3ZlcmVkOiAocm9vdDogU2hhZG93Um9vdCkgPT4gdm9pZCxcbikge1xuICAgIGlmICh0cmVlT2JzZXJ2ZXJzLmhhcyhyb290KSkge1xuICAgICAgICB0cmVlT2JzZXJ2ZXJzLmdldChyb290KS5kaXNjb25uZWN0KCk7XG4gICAgICAgIGF0dHJPYnNlcnZlcnMuZ2V0KHJvb3QpLmRpc2Nvbm5lY3QoKTtcbiAgICB9XG5cbiAgICBjb25zdCBkaXNjb3ZlcmVkTm9kZXMgPSBuZXcgV2Vha1NldDxOb2RlPigpO1xuXG4gICAgZnVuY3Rpb24gZGlzY292ZXJOb2Rlcyhub2RlOiBOb2RlKSB7XG4gICAgICAgIGdldElubGluZVN0eWxlRWxlbWVudHMobm9kZSkuZm9yRWFjaCgoZWw6IEhUTUxFbGVtZW50KSA9PiB7XG4gICAgICAgICAgICBpZiAoZGlzY292ZXJlZE5vZGVzLmhhcyhlbCkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBkaXNjb3ZlcmVkTm9kZXMuYWRkKGVsKTtcbiAgICAgICAgICAgIGVsZW1lbnRTdHlsZURpZENoYW5nZShlbCk7XG4gICAgICAgIH0pO1xuICAgICAgICBpdGVyYXRlU2hhZG93SG9zdHMobm9kZSwgKG4pID0+IHtcbiAgICAgICAgICAgIGlmIChkaXNjb3ZlcmVkTm9kZXMuaGFzKG5vZGUpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZGlzY292ZXJlZE5vZGVzLmFkZChub2RlKTtcbiAgICAgICAgICAgIHNoYWRvd1Jvb3REaXNjb3ZlcmVkKG4uc2hhZG93Um9vdCk7XG4gICAgICAgICAgICBkZWVwV2F0Y2hGb3JJbmxpbmVTdHlsZXMobi5zaGFkb3dSb290LCBlbGVtZW50U3R5bGVEaWRDaGFuZ2UsIHNoYWRvd1Jvb3REaXNjb3ZlcmVkKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgY29uc3QgdHJlZU9ic2VydmVyID0gY3JlYXRlT3B0aW1pemVkVHJlZU9ic2VydmVyKHJvb3QsIHtcbiAgICAgICAgb25NaW5vck11dGF0aW9uczogKHthZGRpdGlvbnN9KSA9PiB7XG4gICAgICAgICAgICBhZGRpdGlvbnMuZm9yRWFjaCgoYWRkZWQpID0+IGRpc2NvdmVyTm9kZXMoYWRkZWQpKTtcbiAgICAgICAgfSxcbiAgICAgICAgb25IdWdlTXV0YXRpb25zOiAoKSA9PiB7XG4gICAgICAgICAgICBkaXNjb3Zlck5vZGVzKHJvb3QpO1xuICAgICAgICB9LFxuICAgIH0pO1xuICAgIHRyZWVPYnNlcnZlcnMuc2V0KHJvb3QsIHRyZWVPYnNlcnZlcik7XG5cbiAgICBjb25zdCBhdHRyT2JzZXJ2ZXIgPSBuZXcgTXV0YXRpb25PYnNlcnZlcigobXV0YXRpb25zKSA9PiB7XG4gICAgICAgIG11dGF0aW9ucy5mb3JFYWNoKChtKSA9PiB7XG4gICAgICAgICAgICBpZiAoSU5MSU5FX1NUWUxFX0FUVFJTLmluY2x1ZGVzKG0uYXR0cmlidXRlTmFtZSkpIHtcbiAgICAgICAgICAgICAgICBlbGVtZW50U3R5bGVEaWRDaGFuZ2UobS50YXJnZXQgYXMgSFRNTEVsZW1lbnQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgb3ZlcnJpZGVzTGlzdFxuICAgICAgICAgICAgICAgIC5maWx0ZXIoKHtzdG9yZSwgZGF0YUF0dHJ9KSA9PiBzdG9yZS5oYXMobS50YXJnZXQpICYmICEobS50YXJnZXQgYXMgSFRNTEVsZW1lbnQpLmhhc0F0dHJpYnV0ZShkYXRhQXR0cikpXG4gICAgICAgICAgICAgICAgLmZvckVhY2goKHtkYXRhQXR0cn0pID0+IChtLnRhcmdldCBhcyBIVE1MRWxlbWVudCkuc2V0QXR0cmlidXRlKGRhdGFBdHRyLCAnJykpO1xuICAgICAgICB9KTtcbiAgICB9KTtcbiAgICBhdHRyT2JzZXJ2ZXIub2JzZXJ2ZShyb290LCB7XG4gICAgICAgIGF0dHJpYnV0ZXM6IHRydWUsXG4gICAgICAgIGF0dHJpYnV0ZUZpbHRlcjogSU5MSU5FX1NUWUxFX0FUVFJTLmNvbmNhdChvdmVycmlkZXNMaXN0Lm1hcCgoe2RhdGFBdHRyfSkgPT4gZGF0YUF0dHIpKSxcbiAgICAgICAgc3VidHJlZTogdHJ1ZSxcbiAgICB9KTtcbiAgICBhdHRyT2JzZXJ2ZXJzLnNldChyb290LCBhdHRyT2JzZXJ2ZXIpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc3RvcFdhdGNoaW5nRm9ySW5saW5lU3R5bGVzKCkge1xuICAgIHRyZWVPYnNlcnZlcnMuZm9yRWFjaCgobykgPT4gby5kaXNjb25uZWN0KCkpO1xuICAgIGF0dHJPYnNlcnZlcnMuZm9yRWFjaCgobykgPT4gby5kaXNjb25uZWN0KCkpO1xuICAgIHRyZWVPYnNlcnZlcnMuY2xlYXIoKTtcbiAgICBhdHRyT2JzZXJ2ZXJzLmNsZWFyKCk7XG59XG5cbmNvbnN0IGlubGluZVN0eWxlQ2FjaGUgPSBuZXcgV2Vha01hcDxIVE1MRWxlbWVudCwgc3RyaW5nPigpO1xuY29uc3QgZmlsdGVyUHJvcHMgPSBbJ2JyaWdodG5lc3MnLCAnY29udHJhc3QnLCAnZ3JheXNjYWxlJywgJ3NlcGlhJywgJ21vZGUnXTtcblxuZnVuY3Rpb24gZ2V0SW5saW5lU3R5bGVDYWNoZUtleShlbDogSFRNTEVsZW1lbnQsIHRoZW1lOiBGaWx0ZXJDb25maWcpIHtcbiAgICByZXR1cm4gSU5MSU5FX1NUWUxFX0FUVFJTXG4gICAgICAgIC5tYXAoKGF0dHIpID0+IGAke2F0dHJ9PVwiJHtlbC5nZXRBdHRyaWJ1dGUoYXR0cil9XCJgKVxuICAgICAgICAuY29uY2F0KGZpbHRlclByb3BzLm1hcCgocHJvcCkgPT4gYCR7cHJvcH09XCIke3RoZW1lW3Byb3BdfVwiYCkpXG4gICAgICAgIC5qb2luKCcgJyk7XG59XG5cbmZ1bmN0aW9uIHNob3VsZElnbm9yZUlubGluZVN0eWxlKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBzZWxlY3RvcnM6IHN0cmluZ1tdKSB7XG4gICAgZm9yIChsZXQgaSA9IDAsIGxlbiA9IHNlbGVjdG9ycy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuICAgICAgICBjb25zdCBpbmdub3JlZFNlbGVjdG9yID0gc2VsZWN0b3JzW2ldO1xuICAgICAgICBpZiAoZWxlbWVudC5tYXRjaGVzKGluZ25vcmVkU2VsZWN0b3IpKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBvdmVycmlkZUlubGluZVN0eWxlKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCB0aGVtZTogRmlsdGVyQ29uZmlnLCBpZ25vcmVJbmxpbmVTZWxlY3RvcnM6IHN0cmluZ1tdLCBpZ25vcmVJbWFnZVNlbGVjdG9yczogc3RyaW5nW10pIHtcbiAgICBjb25zdCBjYWNoZUtleSA9IGdldElubGluZVN0eWxlQ2FjaGVLZXkoZWxlbWVudCwgdGhlbWUpO1xuICAgIGlmIChjYWNoZUtleSA9PT0gaW5saW5lU3R5bGVDYWNoZS5nZXQoZWxlbWVudCkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHVuc2V0UHJvcHMgPSBuZXcgU2V0KE9iamVjdC5rZXlzKG92ZXJyaWRlcykpO1xuXG4gICAgZnVuY3Rpb24gc2V0Q3VzdG9tUHJvcCh0YXJnZXRDU1NQcm9wOiBzdHJpbmcsIG1vZGlmaWVyQ1NTUHJvcDogc3RyaW5nLCBjc3NWYWw6IHN0cmluZykge1xuICAgICAgICBjb25zdCB7Y3VzdG9tUHJvcCwgZGF0YUF0dHJ9ID0gb3ZlcnJpZGVzW3RhcmdldENTU1Byb3BdO1xuXG4gICAgICAgIGNvbnN0IG1vZCA9IGdldE1vZGlmaWFibGVDU1NEZWNsYXJhdGlvbihtb2RpZmllckNTU1Byb3AsIGNzc1ZhbCwgbnVsbCwgaWdub3JlSW1hZ2VTZWxlY3RvcnMsIG51bGwpO1xuICAgICAgICBpZiAoIW1vZCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGxldCB2YWx1ZSA9IG1vZC52YWx1ZTtcbiAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgdmFsdWUgPSB2YWx1ZSh0aGVtZSkgYXMgc3RyaW5nO1xuICAgICAgICB9XG4gICAgICAgIGVsZW1lbnQuc3R5bGUuc2V0UHJvcGVydHkoY3VzdG9tUHJvcCwgdmFsdWUgYXMgc3RyaW5nKTtcbiAgICAgICAgaWYgKCFlbGVtZW50Lmhhc0F0dHJpYnV0ZShkYXRhQXR0cikpIHtcbiAgICAgICAgICAgIGVsZW1lbnQuc2V0QXR0cmlidXRlKGRhdGFBdHRyLCAnJyk7XG4gICAgICAgIH1cbiAgICAgICAgdW5zZXRQcm9wcy5kZWxldGUodGFyZ2V0Q1NTUHJvcCk7XG4gICAgfVxuXG4gICAgaWYgKGlnbm9yZUlubGluZVNlbGVjdG9ycy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGlmIChzaG91bGRJZ25vcmVJbmxpbmVTdHlsZShlbGVtZW50LCBpZ25vcmVJbmxpbmVTZWxlY3RvcnMpKSB7XG4gICAgICAgICAgICB1bnNldFByb3BzLmZvckVhY2goKGNzc1Byb3ApID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCB7c3RvcmUsIGRhdGFBdHRyfSA9IG92ZXJyaWRlc1tjc3NQcm9wXTtcbiAgICAgICAgICAgICAgICBzdG9yZS5kZWxldGUoZWxlbWVudCk7XG4gICAgICAgICAgICAgICAgZWxlbWVudC5yZW1vdmVBdHRyaWJ1dGUoZGF0YUF0dHIpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoZWxlbWVudC5oYXNBdHRyaWJ1dGUoJ2JnY29sb3InKSkge1xuICAgICAgICBsZXQgdmFsdWUgPSBlbGVtZW50LmdldEF0dHJpYnV0ZSgnYmdjb2xvcicpO1xuICAgICAgICBpZiAodmFsdWUubWF0Y2goL15bMC05YS1mXXszfSQvaSkgfHwgdmFsdWUubWF0Y2goL15bMC05YS1mXXs2fSQvaSkpIHtcbiAgICAgICAgICAgIHZhbHVlID0gYCMke3ZhbHVlfWA7XG4gICAgICAgIH1cbiAgICAgICAgc2V0Q3VzdG9tUHJvcCgnYmFja2dyb3VuZC1jb2xvcicsICdiYWNrZ3JvdW5kLWNvbG9yJywgdmFsdWUpO1xuICAgIH1cbiAgICBpZiAoZWxlbWVudC5oYXNBdHRyaWJ1dGUoJ2NvbG9yJykpIHtcbiAgICAgICAgbGV0IHZhbHVlID0gZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2NvbG9yJyk7XG4gICAgICAgIGlmICh2YWx1ZS5tYXRjaCgvXlswLTlhLWZdezN9JC9pKSB8fCB2YWx1ZS5tYXRjaCgvXlswLTlhLWZdezZ9JC9pKSkge1xuICAgICAgICAgICAgdmFsdWUgPSBgIyR7dmFsdWV9YDtcbiAgICAgICAgfVxuICAgICAgICBzZXRDdXN0b21Qcm9wKCdjb2xvcicsICdjb2xvcicsIHZhbHVlKTtcbiAgICB9XG4gICAgaWYgKGVsZW1lbnQuaGFzQXR0cmlidXRlKCdmaWxsJykgJiYgZWxlbWVudCBpbnN0YW5jZW9mIFNWR0VsZW1lbnQpIHtcbiAgICAgICAgY29uc3QgU01BTExfU1ZHX0xJTUlUID0gMzI7XG4gICAgICAgIGNvbnN0IHZhbHVlID0gZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2ZpbGwnKTtcbiAgICAgICAgbGV0IGlzQmcgPSBmYWxzZTtcbiAgICAgICAgaWYgKCEoZWxlbWVudCBpbnN0YW5jZW9mIFNWR1RleHRFbGVtZW50KSkge1xuICAgICAgICAgICAgY29uc3Qge3dpZHRoLCBoZWlnaHR9ID0gZWxlbWVudC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICAgICAgICAgIGlzQmcgPSAod2lkdGggPiBTTUFMTF9TVkdfTElNSVQgfHwgaGVpZ2h0ID4gU01BTExfU1ZHX0xJTUlUKTtcbiAgICAgICAgfVxuICAgICAgICBzZXRDdXN0b21Qcm9wKCdmaWxsJywgaXNCZyA/ICdiYWNrZ3JvdW5kLWNvbG9yJyA6ICdjb2xvcicsIHZhbHVlKTtcbiAgICB9XG4gICAgaWYgKGVsZW1lbnQuaGFzQXR0cmlidXRlKCdzdHJva2UnKSkge1xuICAgICAgICBjb25zdCB2YWx1ZSA9IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdzdHJva2UnKTtcbiAgICAgICAgc2V0Q3VzdG9tUHJvcCgnc3Ryb2tlJywgZWxlbWVudCBpbnN0YW5jZW9mIFNWR0xpbmVFbGVtZW50IHx8IGVsZW1lbnQgaW5zdGFuY2VvZiBTVkdUZXh0RWxlbWVudCA/ICdib3JkZXItY29sb3InIDogJ2NvbG9yJywgdmFsdWUpO1xuICAgIH1cbiAgICBlbGVtZW50LnN0eWxlICYmIGl0ZXJhdGVDU1NEZWNsYXJhdGlvbnMoZWxlbWVudC5zdHlsZSwgKHByb3BlcnR5LCB2YWx1ZSkgPT4ge1xuICAgICAgICAvLyBUZW1wb3JhdHkgaWdub3JlIGJhY2tncm91bmQgaW1hZ2VzXG4gICAgICAgIC8vIGR1ZSB0byBwb3NzaWJsZSBwZXJmb3JtYW5jZSBpc3N1ZXNcbiAgICAgICAgLy8gYW5kIGNvbXBsZXhpdHkgb2YgaGFuZGxpbmcgYXN5bmMgcmVxdWVzdHNcbiAgICAgICAgaWYgKHByb3BlcnR5ID09PSAnYmFja2dyb3VuZC1pbWFnZScgJiYgdmFsdWUuaW5kZXhPZigndXJsJykgPj0gMCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGlmIChvdmVycmlkZXMuaGFzT3duUHJvcGVydHkocHJvcGVydHkpKSB7XG4gICAgICAgICAgICBzZXRDdXN0b21Qcm9wKHByb3BlcnR5LCBwcm9wZXJ0eSwgdmFsdWUpO1xuICAgICAgICB9XG4gICAgfSk7XG4gICAgaWYgKGVsZW1lbnQuc3R5bGUgJiYgZWxlbWVudCBpbnN0YW5jZW9mIFNWR1RleHRFbGVtZW50ICYmIGVsZW1lbnQuc3R5bGUuZmlsbCkge1xuICAgICAgICBzZXRDdXN0b21Qcm9wKCdmaWxsJywgJ2NvbG9yJywgZWxlbWVudC5zdHlsZS5nZXRQcm9wZXJ0eVZhbHVlKCdmaWxsJykpO1xuICAgIH1cblxuICAgIGZvckVhY2godW5zZXRQcm9wcywgKGNzc1Byb3ApID0+IHtcbiAgICAgICAgY29uc3Qge3N0b3JlLCBkYXRhQXR0cn0gPSBvdmVycmlkZXNbY3NzUHJvcF07XG4gICAgICAgIHN0b3JlLmRlbGV0ZShlbGVtZW50KTtcbiAgICAgICAgZWxlbWVudC5yZW1vdmVBdHRyaWJ1dGUoZGF0YUF0dHIpO1xuICAgIH0pO1xuICAgIGlubGluZVN0eWxlQ2FjaGUuc2V0KGVsZW1lbnQsIGdldElubGluZVN0eWxlQ2FjaGVLZXkoZWxlbWVudCwgdGhlbWUpKTtcbn1cbiIsImltcG9ydCB7cGFyc2V9IGZyb20gJy4uLy4uL3V0aWxzL2NvbG9yJztcbmltcG9ydCB7bW9kaWZ5QmFja2dyb3VuZENvbG9yfSBmcm9tICcuLi8uLi9nZW5lcmF0b3JzL21vZGlmeS1jb2xvcnMnO1xuaW1wb3J0IHtsb2dXYXJufSBmcm9tICcuLi91dGlscy9sb2cnO1xuaW1wb3J0IHtGaWx0ZXJDb25maWd9IGZyb20gJy4uLy4uL2RlZmluaXRpb25zJztcblxuY29uc3QgbWV0YVRoZW1lQ29sb3JOYW1lID0gJ3RoZW1lLWNvbG9yJztcbmNvbnN0IG1ldGFUaGVtZUNvbG9yU2VsZWN0b3IgPSBgbWV0YVtuYW1lPVwiJHttZXRhVGhlbWVDb2xvck5hbWV9XCJdYDtcbmxldCBzcmNNZXRhVGhlbWVDb2xvcjogc3RyaW5nID0gbnVsbDtcbmxldCBvYnNlcnZlcjogTXV0YXRpb25PYnNlcnZlciA9IG51bGw7XG5cbmZ1bmN0aW9uIGNoYW5nZU1ldGFUaGVtZUNvbG9yKG1ldGE6IEhUTUxNZXRhRWxlbWVudCwgdGhlbWU6IEZpbHRlckNvbmZpZykge1xuICAgIHNyY01ldGFUaGVtZUNvbG9yID0gc3JjTWV0YVRoZW1lQ29sb3IgfHwgbWV0YS5jb250ZW50O1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGNvbG9yID0gcGFyc2Uoc3JjTWV0YVRoZW1lQ29sb3IpO1xuICAgICAgICBtZXRhLmNvbnRlbnQgPSBtb2RpZnlCYWNrZ3JvdW5kQ29sb3IoY29sb3IsIHRoZW1lKTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgbG9nV2FybihlcnIpO1xuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNoYW5nZU1ldGFUaGVtZUNvbG9yV2hlbkF2YWlsYWJsZSh0aGVtZTogRmlsdGVyQ29uZmlnKSB7XG4gICAgY29uc3QgbWV0YSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IobWV0YVRoZW1lQ29sb3JTZWxlY3RvcikgYXMgSFRNTE1ldGFFbGVtZW50O1xuICAgIGlmIChtZXRhKSB7XG4gICAgICAgIGNoYW5nZU1ldGFUaGVtZUNvbG9yKG1ldGEsIHRoZW1lKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBpZiAob2JzZXJ2ZXIpIHtcbiAgICAgICAgICAgIG9ic2VydmVyLmRpc2Nvbm5lY3QoKTtcbiAgICAgICAgfVxuICAgICAgICBvYnNlcnZlciA9IG5ldyBNdXRhdGlvbk9ic2VydmVyKChtdXRhdGlvbnMpID0+IHtcbiAgICAgICAgICAgIGxvb3A6IGZvciAobGV0IGkgPSAwOyBpIDwgbXV0YXRpb25zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgY29uc3Qge2FkZGVkTm9kZXN9ID0gbXV0YXRpb25zW2ldO1xuICAgICAgICAgICAgICAgIGZvciAobGV0IGogPSAwOyBqIDwgYWRkZWROb2Rlcy5sZW5ndGg7IGorKykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBub2RlID0gYWRkZWROb2Rlc1tqXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG5vZGUgaW5zdGFuY2VvZiBIVE1MTWV0YUVsZW1lbnQgJiYgbm9kZS5uYW1lID09PSBtZXRhVGhlbWVDb2xvck5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG9ic2VydmVyLmRpc2Nvbm5lY3QoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIG9ic2VydmVyID0gbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNoYW5nZU1ldGFUaGVtZUNvbG9yKG5vZGUsIHRoZW1lKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrIGxvb3A7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBvYnNlcnZlci5vYnNlcnZlKGRvY3VtZW50LmhlYWQsIHtjaGlsZExpc3Q6IHRydWV9KTtcbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZXN0b3JlTWV0YVRoZW1lQ29sb3IoKSB7XG4gICAgaWYgKG9ic2VydmVyKSB7XG4gICAgICAgIG9ic2VydmVyLmRpc2Nvbm5lY3QoKTtcbiAgICAgICAgb2JzZXJ2ZXIgPSBudWxsO1xuICAgIH1cbiAgICBjb25zdCBtZXRhID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihtZXRhVGhlbWVDb2xvclNlbGVjdG9yKSBhcyBIVE1MTWV0YUVsZW1lbnQ7XG4gICAgaWYgKG1ldGEgJiYgc3JjTWV0YVRoZW1lQ29sb3IpIHtcbiAgICAgICAgbWV0YS5jb250ZW50ID0gc3JjTWV0YVRoZW1lQ29sb3I7XG4gICAgfVxufVxuIiwiaW1wb3J0IHtUaGVtZX0gZnJvbSAnLi4vLi4vZGVmaW5pdGlvbnMnO1xuaW1wb3J0IHtpc0NTU1N0eWxlU2hlZXRDb25zdHJ1Y3RvclN1cHBvcnRlZH0gZnJvbSAnLi4vLi4vdXRpbHMvcGxhdGZvcm0nO1xuaW1wb3J0IHtjcmVhdGVBc3luY1Rhc2tzUXVldWV9IGZyb20gJy4uL3V0aWxzL3Rocm90dGxlJztcbmltcG9ydCB7aXRlcmF0ZUNTU1J1bGVzLCBpdGVyYXRlQ1NTRGVjbGFyYXRpb25zLCByZXBsYWNlQ1NTVmFyaWFibGVzfSBmcm9tICcuL2Nzcy1ydWxlcyc7XG5pbXBvcnQge2dldE1vZGlmaWFibGVDU1NEZWNsYXJhdGlvbiwgTW9kaWZpYWJsZUNTU0RlY2xhcmF0aW9uLCBNb2RpZmlhYmxlQ1NTUnVsZX0gZnJvbSAnLi9tb2RpZnktY3NzJztcblxuY29uc3QgdGhlbWVDYWNoZUtleXM6IChrZXlvZiBUaGVtZSlbXSA9IFtcbiAgICAnbW9kZScsXG4gICAgJ2JyaWdodG5lc3MnLFxuICAgICdjb250cmFzdCcsXG4gICAgJ2dyYXlzY2FsZScsXG4gICAgJ3NlcGlhJyxcbiAgICAnZGFya1NjaGVtZUJhY2tncm91bmRDb2xvcicsXG4gICAgJ2RhcmtTY2hlbWVUZXh0Q29sb3InLFxuICAgICdsaWdodFNjaGVtZUJhY2tncm91bmRDb2xvcicsXG4gICAgJ2xpZ2h0U2NoZW1lVGV4dENvbG9yJyxcbl07XG5cbmZ1bmN0aW9uIGdldFRoZW1lS2V5KHRoZW1lOiBUaGVtZSkge1xuICAgIHJldHVybiB0aGVtZUNhY2hlS2V5cy5tYXAoKHApID0+IGAke3B9OiR7dGhlbWVbcF19YCkuam9pbignOycpO1xufVxuXG5mdW5jdGlvbiBnZXRUZW1wQ1NTU3R5bGVTaGVldCgpOiB7c2hlZXQ6IENTU1N0eWxlU2hlZXQ7IHJlbW92ZTogKCkgPT4gdm9pZH0ge1xuICAgIGlmIChpc0NTU1N0eWxlU2hlZXRDb25zdHJ1Y3RvclN1cHBvcnRlZCgpKSB7XG4gICAgICAgIHJldHVybiB7c2hlZXQ6IG5ldyBDU1NTdHlsZVNoZWV0KCksIHJlbW92ZTogKCkgPT4gbnVsbH07XG4gICAgfVxuICAgIGNvbnN0IHN0eWxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3R5bGUnKTtcbiAgICBzdHlsZS5jbGFzc0xpc3QuYWRkKCdkYXJrcmVhZGVyJyk7XG4gICAgc3R5bGUuY2xhc3NMaXN0LmFkZCgnZGFya3JlYWRlci0tdGVtcCcpO1xuICAgIHN0eWxlLm1lZGlhID0gJ3NjcmVlbic7XG4gICAgKGRvY3VtZW50LmhlYWQgfHwgZG9jdW1lbnQpLmFwcGVuZChzdHlsZSk7XG4gICAgcmV0dXJuIHtzaGVldDogc3R5bGUuc2hlZXQsIHJlbW92ZTogKCkgPT4gc3R5bGUucmVtb3ZlKCl9O1xufVxuXG5jb25zdCBhc3luY1F1ZXVlID0gY3JlYXRlQXN5bmNUYXNrc1F1ZXVlKCk7XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVTdHlsZVNoZWV0TW9kaWZpZXIoKSB7XG4gICAgbGV0IHJlbmRlcklkID0gMDtcbiAgICBjb25zdCBydWxlc1RleHRDYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG4gICAgY29uc3QgcnVsZXNNb2RDYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBNb2RpZmlhYmxlQ1NTUnVsZT4oKTtcbiAgICBsZXQgcHJldkZpbHRlcktleTogc3RyaW5nID0gbnVsbDtcblxuICAgIGludGVyZmFjZSBNb2RpZnlTaGVldE9wdGlvbnMge1xuICAgICAgICBzb3VyY2VDU1NSdWxlczogQ1NTUnVsZUxpc3Q7XG4gICAgICAgIHRoZW1lOiBUaGVtZTtcbiAgICAgICAgdmFyaWFibGVzOiBNYXA8c3RyaW5nLCBzdHJpbmc+O1xuICAgICAgICBpZ25vcmVJbWFnZUFuYWx5c2lzOiBzdHJpbmdbXVxuICAgICAgICBmb3JjZTogYm9vbGVhbjtcbiAgICAgICAgcHJlcGFyZVNoZWV0OiAoKSA9PiBDU1NTdHlsZVNoZWV0O1xuICAgICAgICBpc0FzeW5jQ2FuY2VsbGVkOiAoKSA9PiBib29sZWFuO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIG1vZGlmeVNoZWV0KG9wdGlvbnM6IE1vZGlmeVNoZWV0T3B0aW9ucyk6IHZvaWQge1xuICAgICAgICBjb25zdCBydWxlcyA9IG9wdGlvbnMuc291cmNlQ1NTUnVsZXM7XG4gICAgICAgIGNvbnN0IHt0aGVtZSwgdmFyaWFibGVzLCBpZ25vcmVJbWFnZUFuYWx5c2lzLCBmb3JjZSwgcHJlcGFyZVNoZWV0LCBpc0FzeW5jQ2FuY2VsbGVkfSA9IG9wdGlvbnM7XG5cbiAgICAgICAgbGV0IHJ1bGVzQ2hhbmdlZCA9IChydWxlc01vZENhY2hlLnNpemUgPT09IDApO1xuICAgICAgICBjb25zdCBub3RGb3VuZENhY2hlS2V5cyA9IG5ldyBTZXQocnVsZXNNb2RDYWNoZS5rZXlzKCkpO1xuICAgICAgICBjb25zdCB0aGVtZUtleSA9IGdldFRoZW1lS2V5KHRoZW1lKTtcbiAgICAgICAgY29uc3QgdGhlbWVDaGFuZ2VkID0gKHRoZW1lS2V5ICE9PSBwcmV2RmlsdGVyS2V5KTtcblxuICAgICAgICBjb25zdCBtb2RSdWxlczogTW9kaWZpYWJsZUNTU1J1bGVbXSA9IFtdO1xuICAgICAgICBpdGVyYXRlQ1NTUnVsZXMocnVsZXMsIChydWxlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBjc3NUZXh0ID0gcnVsZS5jc3NUZXh0O1xuICAgICAgICAgICAgbGV0IHRleHREaWZmZXJzRnJvbVByZXYgPSBmYWxzZTtcblxuICAgICAgICAgICAgbm90Rm91bmRDYWNoZUtleXMuZGVsZXRlKGNzc1RleHQpO1xuICAgICAgICAgICAgaWYgKCFydWxlc1RleHRDYWNoZS5oYXMoY3NzVGV4dCkpIHtcbiAgICAgICAgICAgICAgICBydWxlc1RleHRDYWNoZS5zZXQoY3NzVGV4dCwgY3NzVGV4dCk7XG4gICAgICAgICAgICAgICAgdGV4dERpZmZlcnNGcm9tUHJldiA9IHRydWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIFB1dCBDU1MgdGV4dCB3aXRoIGluc2VydGVkIENTUyB2YXJpYWJsZXMgaW50byBzZXBhcmF0ZSA8c3R5bGU+IGVsZW1lbnRcbiAgICAgICAgICAgIC8vIHRvIHByb3Blcmx5IGhhbmRsZSBjb21wb3NpdGUgcHJvcGVydGllcyAoZS5nLiBiYWNrZ3JvdW5kIC0+IGJhY2tncm91bmQtY29sb3IpXG4gICAgICAgICAgICBsZXQgdmFyczoge3NoZWV0OiBDU1NTdHlsZVNoZWV0OyByZW1vdmU6ICgpID0+IHZvaWR9O1xuICAgICAgICAgICAgbGV0IHZhcnNSdWxlOiBDU1NTdHlsZVJ1bGUgPSBudWxsO1xuICAgICAgICAgICAgaWYgKHZhcmlhYmxlcy5zaXplID4gMCB8fCBjc3NUZXh0LmluY2x1ZGVzKCd2YXIoJykpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBjc3NUZXh0V2l0aFZhcmlhYmxlcyA9IHJlcGxhY2VDU1NWYXJpYWJsZXMoY3NzVGV4dCwgdmFyaWFibGVzKTtcbiAgICAgICAgICAgICAgICBpZiAocnVsZXNUZXh0Q2FjaGUuZ2V0KGNzc1RleHQpICE9PSBjc3NUZXh0V2l0aFZhcmlhYmxlcykge1xuICAgICAgICAgICAgICAgICAgICBydWxlc1RleHRDYWNoZS5zZXQoY3NzVGV4dCwgY3NzVGV4dFdpdGhWYXJpYWJsZXMpO1xuICAgICAgICAgICAgICAgICAgICB0ZXh0RGlmZmVyc0Zyb21QcmV2ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgdmFycyA9IGdldFRlbXBDU1NTdHlsZVNoZWV0KCk7XG4gICAgICAgICAgICAgICAgICAgIHZhcnMuc2hlZXQuaW5zZXJ0UnVsZShjc3NUZXh0V2l0aFZhcmlhYmxlcyk7XG4gICAgICAgICAgICAgICAgICAgIHZhcnNSdWxlID0gdmFycy5zaGVldC5jc3NSdWxlc1swXSBhcyBDU1NTdHlsZVJ1bGU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAodGV4dERpZmZlcnNGcm9tUHJldikge1xuICAgICAgICAgICAgICAgIHJ1bGVzQ2hhbmdlZCA9IHRydWU7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIG1vZFJ1bGVzLnB1c2gocnVsZXNNb2RDYWNoZS5nZXQoY3NzVGV4dCkpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgbW9kRGVjczogTW9kaWZpYWJsZUNTU0RlY2xhcmF0aW9uW10gPSBbXTtcbiAgICAgICAgICAgIGNvbnN0IHRhcmdldFJ1bGUgPSB2YXJzUnVsZSB8fCBydWxlO1xuICAgICAgICAgICAgdGFyZ2V0UnVsZSAmJiB0YXJnZXRSdWxlLnN0eWxlICYmIGl0ZXJhdGVDU1NEZWNsYXJhdGlvbnModGFyZ2V0UnVsZS5zdHlsZSwgKHByb3BlcnR5LCB2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IG1vZCA9IGdldE1vZGlmaWFibGVDU1NEZWNsYXJhdGlvbihwcm9wZXJ0eSwgdmFsdWUsIHJ1bGUsIGlnbm9yZUltYWdlQW5hbHlzaXMsIGlzQXN5bmNDYW5jZWxsZWQpO1xuICAgICAgICAgICAgICAgIGlmIChtb2QpIHtcbiAgICAgICAgICAgICAgICAgICAgbW9kRGVjcy5wdXNoKG1vZCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGxldCBtb2RSdWxlOiBNb2RpZmlhYmxlQ1NTUnVsZSA9IG51bGw7XG4gICAgICAgICAgICBpZiAobW9kRGVjcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcGFyZW50UnVsZSA9IHJ1bGUucGFyZW50UnVsZTtcbiAgICAgICAgICAgICAgICBtb2RSdWxlID0ge3NlbGVjdG9yOiBydWxlLnNlbGVjdG9yVGV4dCwgZGVjbGFyYXRpb25zOiBtb2REZWNzLCBwYXJlbnRSdWxlfTtcbiAgICAgICAgICAgICAgICBtb2RSdWxlcy5wdXNoKG1vZFJ1bGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcnVsZXNNb2RDYWNoZS5zZXQoY3NzVGV4dCwgbW9kUnVsZSk7XG5cbiAgICAgICAgICAgIHZhcnMgJiYgdmFycy5yZW1vdmUoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgbm90Rm91bmRDYWNoZUtleXMuZm9yRWFjaCgoa2V5KSA9PiB7XG4gICAgICAgICAgICBydWxlc1RleHRDYWNoZS5kZWxldGUoa2V5KTtcbiAgICAgICAgICAgIHJ1bGVzTW9kQ2FjaGUuZGVsZXRlKGtleSk7XG4gICAgICAgIH0pO1xuICAgICAgICBwcmV2RmlsdGVyS2V5ID0gdGhlbWVLZXk7XG5cbiAgICAgICAgaWYgKCFmb3JjZSAmJiAhcnVsZXNDaGFuZ2VkICYmICF0aGVtZUNoYW5nZWQpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHJlbmRlcklkKys7XG5cbiAgICAgICAgaW50ZXJmYWNlIFJlYWR5R3JvdXAge1xuICAgICAgICAgICAgaXNHcm91cDogdHJ1ZTtcbiAgICAgICAgICAgIHJ1bGU6IGFueTtcbiAgICAgICAgICAgIHJ1bGVzOiAoUmVhZHlHcm91cCB8IFJlYWR5U3R5bGVSdWxlKVtdO1xuICAgICAgICB9XG5cbiAgICAgICAgaW50ZXJmYWNlIFJlYWR5U3R5bGVSdWxlIHtcbiAgICAgICAgICAgIGlzR3JvdXA6IGZhbHNlO1xuICAgICAgICAgICAgc2VsZWN0b3I6IHN0cmluZztcbiAgICAgICAgICAgIGRlY2xhcmF0aW9uczogUmVhZHlEZWNsYXJhdGlvbltdO1xuICAgICAgICB9XG5cbiAgICAgICAgaW50ZXJmYWNlIFJlYWR5RGVjbGFyYXRpb24ge1xuICAgICAgICAgICAgcHJvcGVydHk6IHN0cmluZztcbiAgICAgICAgICAgIHZhbHVlOiBzdHJpbmc7XG4gICAgICAgICAgICBpbXBvcnRhbnQ6IGJvb2xlYW47XG4gICAgICAgICAgICBzb3VyY2VWYWx1ZTogc3RyaW5nO1xuICAgICAgICAgICAgYXN5bmNLZXk/OiBudW1iZXI7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBzZXRSdWxlKHRhcmdldDogQ1NTU3R5bGVTaGVldCB8IENTU0dyb3VwaW5nUnVsZSwgaW5kZXg6IG51bWJlciwgcnVsZTogUmVhZHlTdHlsZVJ1bGUpIHtcbiAgICAgICAgICAgIGNvbnN0IHtzZWxlY3RvciwgZGVjbGFyYXRpb25zfSA9IHJ1bGU7XG4gICAgICAgICAgICB0YXJnZXQuaW5zZXJ0UnVsZShgJHtzZWxlY3Rvcn0ge31gLCBpbmRleCk7XG4gICAgICAgICAgICBjb25zdCBzdHlsZSA9ICh0YXJnZXQuY3NzUnVsZXMuaXRlbShpbmRleCkgYXMgQ1NTU3R5bGVSdWxlKS5zdHlsZTtcbiAgICAgICAgICAgIGRlY2xhcmF0aW9ucy5mb3JFYWNoKCh7cHJvcGVydHksIHZhbHVlLCBpbXBvcnRhbnQsIHNvdXJjZVZhbHVlfSkgPT4ge1xuICAgICAgICAgICAgICAgIHN0eWxlLnNldFByb3BlcnR5KHByb3BlcnR5LCB2YWx1ZSA9PSBudWxsID8gc291cmNlVmFsdWUgOiB2YWx1ZSwgaW1wb3J0YW50ID8gJ2ltcG9ydGFudCcgOiAnJyk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGludGVyZmFjZSBBc3luY1J1bGUge1xuICAgICAgICAgICAgcnVsZTogUmVhZHlTdHlsZVJ1bGU7XG4gICAgICAgICAgICB0YXJnZXQ6IChDU1NTdHlsZVNoZWV0IHwgQ1NTR3JvdXBpbmdSdWxlKTtcbiAgICAgICAgICAgIGluZGV4OiBudW1iZXI7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBhc3luY0RlY2xhcmF0aW9ucyA9IG5ldyBNYXA8bnVtYmVyLCBBc3luY1J1bGU+KCk7XG4gICAgICAgIGxldCBhc3luY0RlY2xhcmF0aW9uQ291bnRlciA9IDA7XG5cbiAgICAgICAgY29uc3Qgcm9vdFJlYWR5R3JvdXA6IFJlYWR5R3JvdXAgPSB7cnVsZTogbnVsbCwgcnVsZXM6IFtdLCBpc0dyb3VwOiB0cnVlfTtcbiAgICAgICAgY29uc3QgZ3JvdXBSZWZzID0gbmV3IFdlYWtNYXA8Q1NTUnVsZSwgUmVhZHlHcm91cD4oKTtcblxuICAgICAgICBmdW5jdGlvbiBnZXRHcm91cChydWxlOiBDU1NSdWxlKTogUmVhZHlHcm91cCB7XG4gICAgICAgICAgICBpZiAocnVsZSA9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJvb3RSZWFkeUdyb3VwO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoZ3JvdXBSZWZzLmhhcyhydWxlKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBncm91cFJlZnMuZ2V0KHJ1bGUpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBncm91cDogUmVhZHlHcm91cCA9IHtydWxlLCBydWxlczogW10sIGlzR3JvdXA6IHRydWV9O1xuICAgICAgICAgICAgZ3JvdXBSZWZzLnNldChydWxlLCBncm91cCk7XG5cbiAgICAgICAgICAgIGNvbnN0IHBhcmVudEdyb3VwID0gZ2V0R3JvdXAocnVsZS5wYXJlbnRSdWxlKTtcbiAgICAgICAgICAgIHBhcmVudEdyb3VwLnJ1bGVzLnB1c2goZ3JvdXApO1xuXG4gICAgICAgICAgICByZXR1cm4gZ3JvdXA7XG4gICAgICAgIH1cblxuICAgICAgICBtb2RSdWxlcy5maWx0ZXIoKHIpID0+IHIpLmZvckVhY2goKHtzZWxlY3RvciwgZGVjbGFyYXRpb25zLCBwYXJlbnRSdWxlfSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgZ3JvdXAgPSBnZXRHcm91cChwYXJlbnRSdWxlKTtcbiAgICAgICAgICAgIGNvbnN0IHJlYWR5U3R5bGVSdWxlOiBSZWFkeVN0eWxlUnVsZSA9IHtzZWxlY3RvciwgZGVjbGFyYXRpb25zOiBbXSwgaXNHcm91cDogZmFsc2V9O1xuICAgICAgICAgICAgY29uc3QgcmVhZHlEZWNsYXJhdGlvbnMgPSByZWFkeVN0eWxlUnVsZS5kZWNsYXJhdGlvbnM7XG4gICAgICAgICAgICBncm91cC5ydWxlcy5wdXNoKHJlYWR5U3R5bGVSdWxlKTtcblxuICAgICAgICAgICAgZGVjbGFyYXRpb25zLmZvckVhY2goKHtwcm9wZXJ0eSwgdmFsdWUsIGltcG9ydGFudCwgc291cmNlVmFsdWV9KSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBtb2RpZmllZCA9IHZhbHVlKHRoZW1lKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG1vZGlmaWVkIGluc3RhbmNlb2YgUHJvbWlzZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgYXN5bmNLZXkgPSBhc3luY0RlY2xhcmF0aW9uQ291bnRlcisrO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgYXN5bmNEZWNsYXJhdGlvbjogUmVhZHlEZWNsYXJhdGlvbiA9IHtwcm9wZXJ0eSwgdmFsdWU6IG51bGwsIGltcG9ydGFudCwgYXN5bmNLZXksIHNvdXJjZVZhbHVlfTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlYWR5RGVjbGFyYXRpb25zLnB1c2goYXN5bmNEZWNsYXJhdGlvbik7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBwcm9taXNlID0gbW9kaWZpZWQ7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjdXJyZW50UmVuZGVySWQgPSByZW5kZXJJZDtcbiAgICAgICAgICAgICAgICAgICAgICAgIHByb21pc2UudGhlbigoYXN5bmNWYWx1ZSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghYXN5bmNWYWx1ZSB8fCBpc0FzeW5jQ2FuY2VsbGVkKCkgfHwgY3VycmVudFJlbmRlcklkICE9PSByZW5kZXJJZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFzeW5jRGVjbGFyYXRpb24udmFsdWUgPSBhc3luY1ZhbHVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFzeW5jUXVldWUuYWRkKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGlzQXN5bmNDYW5jZWxsZWQoKSB8fCBjdXJyZW50UmVuZGVySWQgIT09IHJlbmRlcklkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVidWlsZEFzeW5jUnVsZShhc3luY0tleSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlYWR5RGVjbGFyYXRpb25zLnB1c2goe3Byb3BlcnR5LCB2YWx1ZTogbW9kaWZpZWQsIGltcG9ydGFudCwgc291cmNlVmFsdWV9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJlYWR5RGVjbGFyYXRpb25zLnB1c2goe3Byb3BlcnR5LCB2YWx1ZSwgaW1wb3J0YW50LCBzb3VyY2VWYWx1ZX0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCBzaGVldCA9IHByZXBhcmVTaGVldCgpO1xuXG4gICAgICAgIGZ1bmN0aW9uIGJ1aWxkU3R5bGVTaGVldCgpIHtcbiAgICAgICAgICAgIGZ1bmN0aW9uIGNyZWF0ZVRhcmdldChncm91cDogUmVhZHlHcm91cCwgcGFyZW50OiBDU1NTdHlsZVNoZWV0IHwgQ1NTR3JvdXBpbmdSdWxlKTogQ1NTU3R5bGVTaGVldCB8IENTU0dyb3VwaW5nUnVsZSB7XG4gICAgICAgICAgICAgICAgY29uc3Qge3J1bGV9ID0gZ3JvdXA7XG4gICAgICAgICAgICAgICAgaWYgKHJ1bGUgaW5zdGFuY2VvZiBDU1NNZWRpYVJ1bGUpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qge21lZGlhfSA9IHJ1bGU7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGluZGV4ID0gcGFyZW50LmNzc1J1bGVzLmxlbmd0aDtcbiAgICAgICAgICAgICAgICAgICAgcGFyZW50Lmluc2VydFJ1bGUoYEBtZWRpYSAke21lZGlhfSB7fWAsIGluZGV4KTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHBhcmVudC5jc3NSdWxlc1tpbmRleF0gYXMgQ1NTTWVkaWFSdWxlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gcGFyZW50O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmdW5jdGlvbiBpdGVyYXRlUmVhZHlSdWxlcyhcbiAgICAgICAgICAgICAgICBncm91cDogUmVhZHlHcm91cCxcbiAgICAgICAgICAgICAgICB0YXJnZXQ6IENTU1N0eWxlU2hlZXQgfCBDU1NHcm91cGluZ1J1bGUsXG4gICAgICAgICAgICAgICAgc3R5bGVJdGVyYXRvcjogKHM6IFJlYWR5U3R5bGVSdWxlLCB0OiBDU1NTdHlsZVNoZWV0IHwgQ1NTR3JvdXBpbmdSdWxlKSA9PiB2b2lkLFxuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgZ3JvdXAucnVsZXMuZm9yRWFjaCgocikgPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAoci5pc0dyb3VwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB0ID0gY3JlYXRlVGFyZ2V0KHIsIHRhcmdldCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVyYXRlUmVhZHlSdWxlcyhyLCB0LCBzdHlsZUl0ZXJhdG9yKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0eWxlSXRlcmF0b3IociBhcyBSZWFkeVN0eWxlUnVsZSwgdGFyZ2V0KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpdGVyYXRlUmVhZHlSdWxlcyhyb290UmVhZHlHcm91cCwgc2hlZXQsIChydWxlLCB0YXJnZXQpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBpbmRleCA9IHRhcmdldC5jc3NSdWxlcy5sZW5ndGg7XG4gICAgICAgICAgICAgICAgcnVsZS5kZWNsYXJhdGlvbnNcbiAgICAgICAgICAgICAgICAgICAgLmZpbHRlcigoe3ZhbHVlfSkgPT4gdmFsdWUgPT0gbnVsbClcbiAgICAgICAgICAgICAgICAgICAgLmZvckVhY2goKHthc3luY0tleX0pID0+IGFzeW5jRGVjbGFyYXRpb25zLnNldChhc3luY0tleSwge3J1bGUsIHRhcmdldCwgaW5kZXh9KSk7XG4gICAgICAgICAgICAgICAgc2V0UnVsZSh0YXJnZXQsIGluZGV4LCBydWxlKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gcmVidWlsZEFzeW5jUnVsZShrZXk6IG51bWJlcikge1xuICAgICAgICAgICAgY29uc3Qge3J1bGUsIHRhcmdldCwgaW5kZXh9ID0gYXN5bmNEZWNsYXJhdGlvbnMuZ2V0KGtleSk7XG4gICAgICAgICAgICB0YXJnZXQuZGVsZXRlUnVsZShpbmRleCk7XG4gICAgICAgICAgICBzZXRSdWxlKHRhcmdldCwgaW5kZXgsIHJ1bGUpO1xuICAgICAgICAgICAgYXN5bmNEZWNsYXJhdGlvbnMuZGVsZXRlKGtleSk7XG4gICAgICAgIH1cblxuICAgICAgICBidWlsZFN0eWxlU2hlZXQoKTtcbiAgICB9XG5cbiAgICByZXR1cm4ge21vZGlmeVNoZWV0fTtcbn1cbiIsImltcG9ydCB7Z2V0Q1NTVmFyaWFibGVzLCByZXBsYWNlQ1NTUmVsYXRpdmVVUkxzV2l0aEFic29sdXRlLCByZW1vdmVDU1NDb21tZW50cywgcmVwbGFjZUNTU0ZvbnRGYWNlLCBnZXRDU1NVUkxWYWx1ZSwgY3NzSW1wb3J0UmVnZXgsIGdldENTU0Jhc2VCYXRofSBmcm9tICcuL2Nzcy1ydWxlcyc7XG5pbXBvcnQge2JnRmV0Y2h9IGZyb20gJy4vbmV0d29yayc7XG5pbXBvcnQge3dhdGNoRm9yTm9kZVBvc2l0aW9uLCByZW1vdmVOb2RlLCBpdGVyYXRlU2hhZG93SG9zdHN9IGZyb20gJy4uL3V0aWxzL2RvbSc7XG5pbXBvcnQge2xvZ1dhcm59IGZyb20gJy4uL3V0aWxzL2xvZyc7XG5pbXBvcnQge2ZvckVhY2h9IGZyb20gJy4uLy4uL3V0aWxzL2FycmF5JztcbmltcG9ydCB7Z2V0TWF0Y2hlc30gZnJvbSAnLi4vLi4vdXRpbHMvdGV4dCc7XG5pbXBvcnQge1RoZW1lfSBmcm9tICcuLi8uLi9kZWZpbml0aW9ucyc7XG5pbXBvcnQge2NyZWF0ZVN0eWxlU2hlZXRNb2RpZmllcn0gZnJvbSAnLi9zdHlsZXNoZWV0LW1vZGlmaWVyJztcbmltcG9ydCB7Z2V0QWJzb2x1dGVVUkx9IGZyb20gJy4vdXJsJztcbmltcG9ydCB7SVNfU0hBRE9XX0RPTV9TVVBQT1JURUR9IGZyb20gJy4uLy4uL3V0aWxzL3BsYXRmb3JtJztcblxuZGVjbGFyZSBnbG9iYWwge1xuICAgIGludGVyZmFjZSBIVE1MU3R5bGVFbGVtZW50IHtcbiAgICAgICAgc2hlZXQ6IENTU1N0eWxlU2hlZXQ7XG4gICAgfVxuICAgIGludGVyZmFjZSBIVE1MTGlua0VsZW1lbnQge1xuICAgICAgICBzaGVldDogQ1NTU3R5bGVTaGVldDtcbiAgICB9XG4gICAgaW50ZXJmYWNlIFNWR1N0eWxlRWxlbWVudCB7XG4gICAgICAgIHNoZWV0OiBDU1NTdHlsZVNoZWV0O1xuICAgIH1cbiAgICBpbnRlcmZhY2UgRG9jdW1lbnQge1xuICAgICAgICBhZG9wdGVkU3R5bGVTaGVldHM6IEFycmF5PENTU1N0eWxlU2hlZXQ+O1xuICAgIH1cbiAgICBpbnRlcmZhY2UgU2hhZG93Um9vdCB7XG4gICAgICAgIGFkb3B0ZWRTdHlsZVNoZWV0czogQXJyYXk8Q1NTU3R5bGVTaGVldD47XG4gICAgfVxufVxuXG5leHBvcnQgdHlwZSBTdHlsZUVsZW1lbnQgPSBIVE1MTGlua0VsZW1lbnQgfCBIVE1MU3R5bGVFbGVtZW50O1xuXG5leHBvcnQgaW50ZXJmYWNlIFN0eWxlTWFuYWdlciB7XG4gICAgZGV0YWlscygpOiB7dmFyaWFibGVzOiBNYXA8c3RyaW5nLCBzdHJpbmc+fTtcbiAgICByZW5kZXIodGhlbWU6IFRoZW1lLCB2YXJpYWJsZXM6IE1hcDxzdHJpbmcsIHN0cmluZz4sIGlnbm9yZUltYWdlQW5hbHlzaXM6IHN0cmluZ1tdKTogdm9pZDtcbiAgICBwYXVzZSgpOiB2b2lkO1xuICAgIGRlc3Ryb3koKTogdm9pZDtcbiAgICB3YXRjaCgpOiB2b2lkO1xuICAgIHJlc3RvcmUoKTogdm9pZDtcbn1cblxuZXhwb3J0IGNvbnN0IFNUWUxFX1NFTEVDVE9SID0gJ3N0eWxlLCBsaW5rW3JlbCo9XCJzdHlsZXNoZWV0XCIgaV06bm90KFtkaXNhYmxlZF0pJztcblxuZXhwb3J0IGZ1bmN0aW9uIHNob3VsZE1hbmFnZVN0eWxlKGVsZW1lbnQ6IE5vZGUpIHtcbiAgICByZXR1cm4gKFxuICAgICAgICAoXG4gICAgICAgICAgICAoZWxlbWVudCBpbnN0YW5jZW9mIEhUTUxTdHlsZUVsZW1lbnQpIHx8XG4gICAgICAgICAgICAoZWxlbWVudCBpbnN0YW5jZW9mIFNWR1N0eWxlRWxlbWVudCkgfHxcbiAgICAgICAgICAgIChcbiAgICAgICAgICAgICAgICBlbGVtZW50IGluc3RhbmNlb2YgSFRNTExpbmtFbGVtZW50ICYmXG4gICAgICAgICAgICAgICAgZWxlbWVudC5yZWwgJiZcbiAgICAgICAgICAgICAgICBlbGVtZW50LnJlbC50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdzdHlsZXNoZWV0JykgJiZcbiAgICAgICAgICAgICAgICAhZWxlbWVudC5kaXNhYmxlZFxuICAgICAgICAgICAgKVxuICAgICAgICApICYmXG4gICAgICAgICFlbGVtZW50LmNsYXNzTGlzdC5jb250YWlucygnZGFya3JlYWRlcicpICYmXG4gICAgICAgIGVsZW1lbnQubWVkaWEgIT09ICdwcmludCcgJiZcbiAgICAgICAgIWVsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCdzdHlsdXMnKVxuICAgICk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRNYW5hZ2VhYmxlU3R5bGVzKG5vZGU6IE5vZGUsIHJlc3VsdHMgPSBbXSBhcyBTdHlsZUVsZW1lbnRbXSwgZGVlcCA9IHRydWUpIHtcbiAgICBpZiAoc2hvdWxkTWFuYWdlU3R5bGUobm9kZSkpIHtcbiAgICAgICAgcmVzdWx0cy5wdXNoKG5vZGUgYXMgU3R5bGVFbGVtZW50KTtcbiAgICB9IGVsc2UgaWYgKG5vZGUgaW5zdGFuY2VvZiBFbGVtZW50IHx8IChJU19TSEFET1dfRE9NX1NVUFBPUlRFRCAmJiBub2RlIGluc3RhbmNlb2YgU2hhZG93Um9vdCkgfHwgbm9kZSA9PT0gZG9jdW1lbnQpIHtcbiAgICAgICAgZm9yRWFjaChcbiAgICAgICAgICAgIChub2RlIGFzIEVsZW1lbnQpLnF1ZXJ5U2VsZWN0b3JBbGwoU1RZTEVfU0VMRUNUT1IpLFxuICAgICAgICAgICAgKHN0eWxlOiBTdHlsZUVsZW1lbnQpID0+IGdldE1hbmFnZWFibGVTdHlsZXMoc3R5bGUsIHJlc3VsdHMsIGZhbHNlKSxcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKGRlZXApIHtcbiAgICAgICAgICAgIGl0ZXJhdGVTaGFkb3dIb3N0cyhub2RlLCAoaG9zdCkgPT4gZ2V0TWFuYWdlYWJsZVN0eWxlcyhob3N0LnNoYWRvd1Jvb3QsIHJlc3VsdHMsIGZhbHNlKSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdHM7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtYW5hZ2VTdHlsZShlbGVtZW50OiBTdHlsZUVsZW1lbnQsIHt1cGRhdGUsIGxvYWRpbmdTdGFydCwgbG9hZGluZ0VuZH0pOiBTdHlsZU1hbmFnZXIge1xuICAgIGNvbnN0IHByZXZTdHlsZXM6IEhUTUxTdHlsZUVsZW1lbnRbXSA9IFtdO1xuICAgIGxldCBuZXh0OiBFbGVtZW50ID0gZWxlbWVudDtcbiAgICB3aGlsZSAoKG5leHQgPSBuZXh0Lm5leHRFbGVtZW50U2libGluZykgJiYgbmV4dC5tYXRjaGVzKCcuZGFya3JlYWRlcicpKSB7XG4gICAgICAgIHByZXZTdHlsZXMucHVzaChuZXh0IGFzIEhUTUxTdHlsZUVsZW1lbnQpO1xuICAgIH1cbiAgICBsZXQgY29yc0NvcHk6IEhUTUxTdHlsZUVsZW1lbnQgPSBwcmV2U3R5bGVzLmZpbmQoKGVsKSA9PiBlbC5tYXRjaGVzKCcuZGFya3JlYWRlci0tY29ycycpKSB8fCBudWxsO1xuICAgIGxldCBzeW5jU3R5bGU6IEhUTUxTdHlsZUVsZW1lbnQgfCBTVkdTdHlsZUVsZW1lbnQgPSBwcmV2U3R5bGVzLmZpbmQoKGVsKSA9PiBlbC5tYXRjaGVzKCcuZGFya3JlYWRlci0tc3luYycpKSB8fCBudWxsO1xuXG4gICAgbGV0IGNvcnNDb3B5UG9zaXRpb25XYXRjaGVyOiBSZXR1cm5UeXBlPHR5cGVvZiB3YXRjaEZvck5vZGVQb3NpdGlvbj4gPSBudWxsO1xuICAgIGxldCBzeW5jU3R5bGVQb3NpdGlvbldhdGNoZXI6IFJldHVyblR5cGU8dHlwZW9mIHdhdGNoRm9yTm9kZVBvc2l0aW9uPiA9IG51bGw7XG5cbiAgICBsZXQgY2FuY2VsQXN5bmNPcGVyYXRpb25zID0gZmFsc2U7XG5cbiAgICBjb25zdCBzaGVldE1vZGlmaWVyID0gY3JlYXRlU3R5bGVTaGVldE1vZGlmaWVyKCk7XG5cbiAgICBjb25zdCBvYnNlcnZlciA9IG5ldyBNdXRhdGlvbk9ic2VydmVyKCgpID0+IHtcbiAgICAgICAgdXBkYXRlKCk7XG4gICAgfSk7XG4gICAgY29uc3Qgb2JzZXJ2ZXJPcHRpb25zOiBNdXRhdGlvbk9ic2VydmVySW5pdCA9IHthdHRyaWJ1dGVzOiB0cnVlLCBjaGlsZExpc3Q6IHRydWUsIGNoYXJhY3RlckRhdGE6IHRydWV9O1xuXG4gICAgZnVuY3Rpb24gY29udGFpbnNDU1NJbXBvcnQoKSB7XG4gICAgICAgIHJldHVybiBlbGVtZW50IGluc3RhbmNlb2YgSFRNTFN0eWxlRWxlbWVudCAmJiBlbGVtZW50LnRleHRDb250ZW50LnRyaW0oKS5tYXRjaChjc3NJbXBvcnRSZWdleCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ2V0UnVsZXNTeW5jKCk6IENTU1J1bGVMaXN0IHtcbiAgICAgICAgaWYgKGNvcnNDb3B5KSB7XG4gICAgICAgICAgICByZXR1cm4gY29yc0NvcHkuc2hlZXQuY3NzUnVsZXM7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGNvbnRhaW5zQ1NTSW1wb3J0KCkpIHtcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBzYWZlR2V0U2hlZXRSdWxlcygpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGluc2VydFN0eWxlKCkge1xuICAgICAgICBpZiAoY29yc0NvcHkpIHtcbiAgICAgICAgICAgIGlmIChlbGVtZW50Lm5leHRTaWJsaW5nICE9PSBjb3JzQ29weSkge1xuICAgICAgICAgICAgICAgIGVsZW1lbnQucGFyZW50Tm9kZS5pbnNlcnRCZWZvcmUoY29yc0NvcHksIGVsZW1lbnQubmV4dFNpYmxpbmcpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGNvcnNDb3B5Lm5leHRTaWJsaW5nICE9PSBzeW5jU3R5bGUpIHtcbiAgICAgICAgICAgICAgICBlbGVtZW50LnBhcmVudE5vZGUuaW5zZXJ0QmVmb3JlKHN5bmNTdHlsZSwgY29yc0NvcHkubmV4dFNpYmxpbmcpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKGVsZW1lbnQubmV4dFNpYmxpbmcgIT09IHN5bmNTdHlsZSkge1xuICAgICAgICAgICAgZWxlbWVudC5wYXJlbnROb2RlLmluc2VydEJlZm9yZShzeW5jU3R5bGUsIGVsZW1lbnQubmV4dFNpYmxpbmcpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gY3JlYXRlU3luY1N0eWxlKCkge1xuICAgICAgICBzeW5jU3R5bGUgPSBlbGVtZW50IGluc3RhbmNlb2YgU1ZHU3R5bGVFbGVtZW50ID9cbiAgICAgICAgICAgIGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUygnaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnLCAnc3R5bGUnKSA6XG4gICAgICAgICAgICBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzdHlsZScpO1xuICAgICAgICBzeW5jU3R5bGUuY2xhc3NMaXN0LmFkZCgnZGFya3JlYWRlcicpO1xuICAgICAgICBzeW5jU3R5bGUuY2xhc3NMaXN0LmFkZCgnZGFya3JlYWRlci0tc3luYycpO1xuICAgICAgICBzeW5jU3R5bGUubWVkaWEgPSAnc2NyZWVuJztcbiAgICB9XG5cbiAgICBsZXQgaXNMb2FkaW5nUnVsZXMgPSBmYWxzZTtcbiAgICBsZXQgd2FzTG9hZGluZ0Vycm9yID0gZmFsc2U7XG5cbiAgICBhc3luYyBmdW5jdGlvbiBnZXRSdWxlc0FzeW5jKCk6IFByb21pc2U8Q1NTUnVsZUxpc3Q+IHtcbiAgICAgICAgbGV0IGNzc1RleHQ6IHN0cmluZztcbiAgICAgICAgbGV0IGNzc0Jhc2VQYXRoOiBzdHJpbmc7XG5cbiAgICAgICAgaWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBIVE1MTGlua0VsZW1lbnQpIHtcbiAgICAgICAgICAgIGxldCBbY3NzUnVsZXMsIGFjY2Vzc0Vycm9yXSA9IGdldFJ1bGVzT3JFcnJvcigpO1xuICAgICAgICAgICAgaWYgKGFjY2Vzc0Vycm9yKSB7XG4gICAgICAgICAgICAgICAgbG9nV2FybihhY2Nlc3NFcnJvcik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICgoY3NzUnVsZXMgJiYgIWFjY2Vzc0Vycm9yKSB8fCBpc1N0aWxsTG9hZGluZ0Vycm9yKGFjY2Vzc0Vycm9yKSkge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IGxpbmtMb2FkaW5nKGVsZW1lbnQpO1xuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgICAgICAgICAvLyBOT1RFOiBTb21lIEBpbXBvcnQgcmVzb3VyY2VzIGNhbiBmYWlsLFxuICAgICAgICAgICAgICAgICAgICAvLyBidXQgdGhlIHN0eWxlIHNoZWV0IGNhbiBzdGlsbCBiZSB2YWxpZC5cbiAgICAgICAgICAgICAgICAgICAgLy8gVGhlcmUncyBubyB3YXkgdG8gZ2V0IHRoZSBhY3R1YWwgZXJyb3IuXG4gICAgICAgICAgICAgICAgICAgIGxvZ1dhcm4oZXJyKTtcbiAgICAgICAgICAgICAgICAgICAgd2FzTG9hZGluZ0Vycm9yID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKGNhbmNlbEFzeW5jT3BlcmF0aW9ucykge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBbY3NzUnVsZXMsIGFjY2Vzc0Vycm9yXSA9IGdldFJ1bGVzT3JFcnJvcigpO1xuICAgICAgICAgICAgICAgIGlmIChhY2Nlc3NFcnJvcikge1xuICAgICAgICAgICAgICAgICAgICAvLyBDT1JTIGVycm9yLCBjc3NSdWxlcyBhcmUgbm90IGFjY2Vzc2libGVcbiAgICAgICAgICAgICAgICAgICAgLy8gZm9yIGNyb3NzLW9yaWdpbiByZXNvdXJjZXNcbiAgICAgICAgICAgICAgICAgICAgbG9nV2FybihhY2Nlc3NFcnJvcik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoY3NzUnVsZXMgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBjc3NSdWxlcztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY3NzVGV4dCA9IGF3YWl0IGxvYWRUZXh0KGVsZW1lbnQuaHJlZik7XG4gICAgICAgICAgICBjc3NCYXNlUGF0aCA9IGdldENTU0Jhc2VCYXRoKGVsZW1lbnQuaHJlZik7XG4gICAgICAgICAgICBpZiAoY2FuY2VsQXN5bmNPcGVyYXRpb25zKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoY29udGFpbnNDU1NJbXBvcnQoKSkge1xuICAgICAgICAgICAgY3NzVGV4dCA9IGVsZW1lbnQudGV4dENvbnRlbnQudHJpbSgpO1xuICAgICAgICAgICAgY3NzQmFzZVBhdGggPSBnZXRDU1NCYXNlQmF0aChsb2NhdGlvbi5ocmVmKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGNzc1RleHQpIHtcbiAgICAgICAgICAgIC8vIFNvbWV0aW1lcyBjcm9zcy1vcmlnaW4gc3R5bGVzaGVldHMgYXJlIHByb3RlY3RlZCBmcm9tIGRpcmVjdCBhY2Nlc3NcbiAgICAgICAgICAgIC8vIHNvIG5lZWQgdG8gbG9hZCBDU1MgdGV4dCBhbmQgaW5zZXJ0IGl0IGludG8gc3R5bGUgZWxlbWVudFxuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCBmdWxsQ1NTVGV4dCA9IGF3YWl0IHJlcGxhY2VDU1NJbXBvcnRzKGNzc1RleHQsIGNzc0Jhc2VQYXRoKTtcbiAgICAgICAgICAgICAgICBjb3JzQ29weSA9IGNyZWF0ZUNPUlNDb3B5KGVsZW1lbnQsIGZ1bGxDU1NUZXh0KTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgICAgIGxvZ1dhcm4oZXJyKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChjb3JzQ29weSkge1xuICAgICAgICAgICAgICAgIGNvcnNDb3B5UG9zaXRpb25XYXRjaGVyID0gd2F0Y2hGb3JOb2RlUG9zaXRpb24oY29yc0NvcHksICdwcmV2LXNpYmxpbmcnKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gY29yc0NvcHkuc2hlZXQuY3NzUnVsZXM7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBkZXRhaWxzKCkge1xuICAgICAgICBjb25zdCBydWxlcyA9IGdldFJ1bGVzU3luYygpO1xuICAgICAgICBpZiAoIXJ1bGVzKSB7XG4gICAgICAgICAgICBpZiAoaXNMb2FkaW5nUnVsZXMgfHwgd2FzTG9hZGluZ0Vycm9yKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpc0xvYWRpbmdSdWxlcyA9IHRydWU7XG4gICAgICAgICAgICBsb2FkaW5nU3RhcnQoKTtcbiAgICAgICAgICAgIGdldFJ1bGVzQXN5bmMoKS50aGVuKChyZXN1bHRzKSA9PiB7XG4gICAgICAgICAgICAgICAgaXNMb2FkaW5nUnVsZXMgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBsb2FkaW5nRW5kKCk7XG4gICAgICAgICAgICAgICAgaWYgKHJlc3VsdHMpIHtcbiAgICAgICAgICAgICAgICAgICAgdXBkYXRlKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSkuY2F0Y2goKGVycikgPT4ge1xuICAgICAgICAgICAgICAgIGxvZ1dhcm4oZXJyKTtcbiAgICAgICAgICAgICAgICBpc0xvYWRpbmdSdWxlcyA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIGxvYWRpbmdFbmQoKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgdmFyaWFibGVzID0gZ2V0Q1NTVmFyaWFibGVzKHJ1bGVzKTtcbiAgICAgICAgcmV0dXJuIHt2YXJpYWJsZXN9O1xuICAgIH1cblxuICAgIGxldCBmb3JjZVJlbmRlclN0eWxlID0gZmFsc2U7XG5cbiAgICBmdW5jdGlvbiByZW5kZXIodGhlbWU6IFRoZW1lLCB2YXJpYWJsZXM6IE1hcDxzdHJpbmcsIHN0cmluZz4sIGlnbm9yZUltYWdlQW5hbHlzaXM6IHN0cmluZ1tdKSB7XG4gICAgICAgIGNvbnN0IHJ1bGVzID0gZ2V0UnVsZXNTeW5jKCk7XG4gICAgICAgIGlmICghcnVsZXMpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGNhbmNlbEFzeW5jT3BlcmF0aW9ucyA9IGZhbHNlO1xuXG4gICAgICAgIGZ1bmN0aW9uIHByZXBhcmVPdmVycmlkZXNTaGVldCgpIHtcbiAgICAgICAgICAgIGlmICghc3luY1N0eWxlKSB7XG4gICAgICAgICAgICAgICAgY3JlYXRlU3luY1N0eWxlKCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHN5bmNTdHlsZVBvc2l0aW9uV2F0Y2hlciAmJiBzeW5jU3R5bGVQb3NpdGlvbldhdGNoZXIuc3RvcCgpO1xuICAgICAgICAgICAgaW5zZXJ0U3R5bGUoKTtcblxuICAgICAgICAgICAgLy8gRmlyZWZveCBpc3N1ZTogU29tZSB3ZWJzaXRlcyBnZXQgQ1NQIHdhcm5pbmcsXG4gICAgICAgICAgICAvLyB3aGVuIGB0ZXh0Q29udGVudGAgaXMgbm90IHNldCAoZS5nLiBweXBpLm9yZykuXG4gICAgICAgICAgICAvLyBCdXQgZm9yIG90aGVyIHdlYnNpdGVzIChlLmcuIGZhY2Vib29rLmNvbSlcbiAgICAgICAgICAgIC8vIHNvbWUgaW1hZ2VzIGRpc2FwcGVhciB3aGVuIGB0ZXh0Q29udGVudGBcbiAgICAgICAgICAgIC8vIGlzIGluaXRpYWxseSBzZXQgdG8gYW4gZW1wdHkgc3RyaW5nLlxuICAgICAgICAgICAgaWYgKHN5bmNTdHlsZS5zaGVldCA9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgc3luY1N0eWxlLnRleHRDb250ZW50ID0gJyc7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IHNoZWV0ID0gc3luY1N0eWxlLnNoZWV0O1xuICAgICAgICAgICAgZm9yIChsZXQgaSA9IHNoZWV0LmNzc1J1bGVzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICAgICAgICAgICAgc2hlZXQuZGVsZXRlUnVsZShpKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHN5bmNTdHlsZVBvc2l0aW9uV2F0Y2hlcikge1xuICAgICAgICAgICAgICAgIHN5bmNTdHlsZVBvc2l0aW9uV2F0Y2hlci5ydW4oKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgc3luY1N0eWxlUG9zaXRpb25XYXRjaGVyID0gd2F0Y2hGb3JOb2RlUG9zaXRpb24oc3luY1N0eWxlLCAncHJldi1zaWJsaW5nJywgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBmb3JjZVJlbmRlclN0eWxlID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgYnVpbGRPdmVycmlkZXMoKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHN5bmNTdHlsZS5zaGVldDtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGJ1aWxkT3ZlcnJpZGVzKCkge1xuICAgICAgICAgICAgY29uc3QgZm9yY2UgPSBmb3JjZVJlbmRlclN0eWxlO1xuICAgICAgICAgICAgZm9yY2VSZW5kZXJTdHlsZSA9IGZhbHNlO1xuICAgICAgICAgICAgc2hlZXRNb2RpZmllci5tb2RpZnlTaGVldCh7XG4gICAgICAgICAgICAgICAgcHJlcGFyZVNoZWV0OiBwcmVwYXJlT3ZlcnJpZGVzU2hlZXQsXG4gICAgICAgICAgICAgICAgc291cmNlQ1NTUnVsZXM6IHJ1bGVzLFxuICAgICAgICAgICAgICAgIHRoZW1lLFxuICAgICAgICAgICAgICAgIHZhcmlhYmxlcyxcbiAgICAgICAgICAgICAgICBpZ25vcmVJbWFnZUFuYWx5c2lzLFxuICAgICAgICAgICAgICAgIGZvcmNlLFxuICAgICAgICAgICAgICAgIGlzQXN5bmNDYW5jZWxsZWQ6ICgpID0+IGNhbmNlbEFzeW5jT3BlcmF0aW9ucyxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgYnVpbGRPdmVycmlkZXMoKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRSdWxlc09yRXJyb3IoKTogW0NTU1J1bGVMaXN0LCBFcnJvcl0ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgaWYgKGVsZW1lbnQuc2hlZXQgPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBbbnVsbCwgbnVsbF07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gW2VsZW1lbnQuc2hlZXQuY3NzUnVsZXMsIG51bGxdO1xuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIHJldHVybiBbbnVsbCwgZXJyXTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIE5PVEU6IEluIEZpcmVmb3gsIHdoZW4gbGluayBpcyBsb2FkaW5nLFxuICAgIC8vIGBzaGVldGAgcHJvcGVydHkgaXMgbm90IG51bGwsXG4gICAgLy8gYnV0IGBjc3NSdWxlc2AgYWNjZXNzIGVycm9yIGlzIHRocm93blxuICAgIGZ1bmN0aW9uIGlzU3RpbGxMb2FkaW5nRXJyb3IoZXJyb3I6IEVycm9yKSB7XG4gICAgICAgIHJldHVybiBlcnJvciAmJiBlcnJvci5tZXNzYWdlICYmIGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoJ2xvYWRpbmcnKTtcbiAgICB9XG5cbiAgICAvLyBTZWVtcyBsaWtlIEZpcmVmb3ggYnVnOiBzaWxlbnQgZXhjZXB0aW9uIGlzIHByb2R1Y2VkXG4gICAgLy8gd2l0aG91dCBhbnkgbm90aWNlLCB3aGVuIGFjY2Vzc2luZyA8c3R5bGU+IENTUyBydWxlc1xuICAgIGZ1bmN0aW9uIHNhZmVHZXRTaGVldFJ1bGVzKCkge1xuICAgICAgICBjb25zdCBbY3NzUnVsZXMsIGVycl0gPSBnZXRSdWxlc09yRXJyb3IoKTtcbiAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgbG9nV2FybihlcnIpO1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGNzc1J1bGVzO1xuICAgIH1cblxuICAgIGxldCBydWxlc0NoYW5nZUtleTogbnVtYmVyID0gbnVsbDtcbiAgICBsZXQgcnVsZXNDaGVja0ZyYW1lSWQ6IG51bWJlciA9IG51bGw7XG5cbiAgICBmdW5jdGlvbiB1cGRhdGVSdWxlc0NoYW5nZUtleSgpIHtcbiAgICAgICAgY29uc3QgcnVsZXMgPSBzYWZlR2V0U2hlZXRSdWxlcygpO1xuICAgICAgICBpZiAocnVsZXMpIHtcbiAgICAgICAgICAgIHJ1bGVzQ2hhbmdlS2V5ID0gcnVsZXMubGVuZ3RoO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZGlkUnVsZXNLZXlDaGFuZ2UoKSB7XG4gICAgICAgIGNvbnN0IHJ1bGVzID0gc2FmZUdldFNoZWV0UnVsZXMoKTtcbiAgICAgICAgcmV0dXJuIHJ1bGVzICYmIHJ1bGVzLmxlbmd0aCAhPT0gcnVsZXNDaGFuZ2VLZXk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc3Vic2NyaWJlVG9TaGVldENoYW5nZXMoKSB7XG4gICAgICAgIHVwZGF0ZVJ1bGVzQ2hhbmdlS2V5KCk7XG4gICAgICAgIHVuc3Vic2NyaWJlRnJvbVNoZWV0Q2hhbmdlcygpO1xuICAgICAgICBjb25zdCBjaGVja0ZvclVwZGF0ZSA9ICgpID0+IHtcbiAgICAgICAgICAgIGlmIChkaWRSdWxlc0tleUNoYW5nZSgpKSB7XG4gICAgICAgICAgICAgICAgdXBkYXRlUnVsZXNDaGFuZ2VLZXkoKTtcbiAgICAgICAgICAgICAgICB1cGRhdGUoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJ1bGVzQ2hlY2tGcmFtZUlkID0gcmVxdWVzdEFuaW1hdGlvbkZyYW1lKGNoZWNrRm9yVXBkYXRlKTtcbiAgICAgICAgfTtcbiAgICAgICAgY2hlY2tGb3JVcGRhdGUoKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiB1bnN1YnNjcmliZUZyb21TaGVldENoYW5nZXMoKSB7XG4gICAgICAgIGNhbmNlbEFuaW1hdGlvbkZyYW1lKHJ1bGVzQ2hlY2tGcmFtZUlkKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBwYXVzZSgpIHtcbiAgICAgICAgb2JzZXJ2ZXIuZGlzY29ubmVjdCgpO1xuICAgICAgICBjYW5jZWxBc3luY09wZXJhdGlvbnMgPSB0cnVlO1xuICAgICAgICBjb3JzQ29weVBvc2l0aW9uV2F0Y2hlciAmJiBjb3JzQ29weVBvc2l0aW9uV2F0Y2hlci5zdG9wKCk7XG4gICAgICAgIHN5bmNTdHlsZVBvc2l0aW9uV2F0Y2hlciAmJiBzeW5jU3R5bGVQb3NpdGlvbldhdGNoZXIuc3RvcCgpO1xuICAgICAgICB1bnN1YnNjcmliZUZyb21TaGVldENoYW5nZXMoKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBkZXN0cm95KCkge1xuICAgICAgICBwYXVzZSgpO1xuICAgICAgICByZW1vdmVOb2RlKGNvcnNDb3B5KTtcbiAgICAgICAgcmVtb3ZlTm9kZShzeW5jU3R5bGUpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHdhdGNoKCkge1xuICAgICAgICBvYnNlcnZlci5vYnNlcnZlKGVsZW1lbnQsIG9ic2VydmVyT3B0aW9ucyk7XG4gICAgICAgIGlmIChlbGVtZW50IGluc3RhbmNlb2YgSFRNTFN0eWxlRWxlbWVudCkge1xuICAgICAgICAgICAgc3Vic2NyaWJlVG9TaGVldENoYW5nZXMoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IG1heE1vdmVDb3VudCA9IDEwO1xuICAgIGxldCBtb3ZlQ291bnQgPSAwO1xuXG4gICAgZnVuY3Rpb24gcmVzdG9yZSgpIHtcbiAgICAgICAgaWYgKCFzeW5jU3R5bGUpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIG1vdmVDb3VudCsrO1xuICAgICAgICBpZiAobW92ZUNvdW50ID4gbWF4TW92ZUNvdW50KSB7XG4gICAgICAgICAgICBsb2dXYXJuKCdTdHlsZSBzaGVldCB3YXMgbW92ZWQgbXVsdGlwbGUgdGltZXMnLCBlbGVtZW50KTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGxvZ1dhcm4oJ1Jlc3RvcmUgc3R5bGUnLCBzeW5jU3R5bGUsIGVsZW1lbnQpO1xuICAgICAgICBjb25zdCBzaG91bGRGb3JjZVJlbmRlciA9IHN5bmNTdHlsZS5zaGVldCA9PSBudWxsIHx8IHN5bmNTdHlsZS5zaGVldC5jc3NSdWxlcy5sZW5ndGggPiAwO1xuICAgICAgICBpbnNlcnRTdHlsZSgpO1xuICAgICAgICBjb3JzQ29weVBvc2l0aW9uV2F0Y2hlciAmJiBjb3JzQ29weVBvc2l0aW9uV2F0Y2hlci5za2lwKCk7XG4gICAgICAgIHN5bmNTdHlsZVBvc2l0aW9uV2F0Y2hlciAmJiBzeW5jU3R5bGVQb3NpdGlvbldhdGNoZXIuc2tpcCgpO1xuICAgICAgICBpZiAoc2hvdWxkRm9yY2VSZW5kZXIpIHtcbiAgICAgICAgICAgIGZvcmNlUmVuZGVyU3R5bGUgPSB0cnVlO1xuICAgICAgICAgICAgdXBkYXRlUnVsZXNDaGFuZ2VLZXkoKTtcbiAgICAgICAgICAgIHVwZGF0ZSgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgZGV0YWlscyxcbiAgICAgICAgcmVuZGVyLFxuICAgICAgICBwYXVzZSxcbiAgICAgICAgZGVzdHJveSxcbiAgICAgICAgd2F0Y2gsXG4gICAgICAgIHJlc3RvcmUsXG4gICAgfTtcbn1cblxuZnVuY3Rpb24gbGlua0xvYWRpbmcobGluazogSFRNTExpbmtFbGVtZW50KSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgY29uc3QgY2xlYW5VcCA9ICgpID0+IHtcbiAgICAgICAgICAgIGxpbmsucmVtb3ZlRXZlbnRMaXN0ZW5lcignbG9hZCcsIG9uTG9hZCk7XG4gICAgICAgICAgICBsaW5rLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2Vycm9yJywgb25FcnJvcik7XG4gICAgICAgIH07XG4gICAgICAgIGNvbnN0IG9uTG9hZCA9ICgpID0+IHtcbiAgICAgICAgICAgIGNsZWFuVXAoKTtcbiAgICAgICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgfTtcbiAgICAgICAgY29uc3Qgb25FcnJvciA9ICgpID0+IHtcbiAgICAgICAgICAgIGNsZWFuVXAoKTtcbiAgICAgICAgICAgIHJlamVjdChgTGluayBsb2FkaW5nIGZhaWxlZCAke2xpbmsuaHJlZn1gKTtcbiAgICAgICAgfTtcbiAgICAgICAgbGluay5hZGRFdmVudExpc3RlbmVyKCdsb2FkJywgb25Mb2FkKTtcbiAgICAgICAgbGluay5hZGRFdmVudExpc3RlbmVyKCdlcnJvcicsIG9uRXJyb3IpO1xuICAgIH0pO1xufVxuXG5mdW5jdGlvbiBnZXRDU1NJbXBvcnRVUkwoaW1wb3J0RGVjbGFyYXRpb246IHN0cmluZykge1xuICAgIHJldHVybiBnZXRDU1NVUkxWYWx1ZShpbXBvcnREZWNsYXJhdGlvbi5zdWJzdHJpbmcoOCkucmVwbGFjZSgvOyQvLCAnJykpO1xufVxuXG5hc3luYyBmdW5jdGlvbiBsb2FkVGV4dCh1cmw6IHN0cmluZykge1xuICAgIGlmICh1cmwuc3RhcnRzV2l0aCgnZGF0YTonKSkge1xuICAgICAgICByZXR1cm4gYXdhaXQgKGF3YWl0IGZldGNoKHVybCkpLnRleHQoKTtcbiAgICB9XG4gICAgcmV0dXJuIGF3YWl0IGJnRmV0Y2goe3VybCwgcmVzcG9uc2VUeXBlOiAndGV4dCcsIG1pbWVUeXBlOiAndGV4dC9jc3MnfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHJlcGxhY2VDU1NJbXBvcnRzKGNzc1RleHQ6IHN0cmluZywgYmFzZVBhdGg6IHN0cmluZykge1xuICAgIGNzc1RleHQgPSByZW1vdmVDU1NDb21tZW50cyhjc3NUZXh0KTtcbiAgICBjc3NUZXh0ID0gcmVwbGFjZUNTU0ZvbnRGYWNlKGNzc1RleHQpO1xuICAgIGNzc1RleHQgPSByZXBsYWNlQ1NTUmVsYXRpdmVVUkxzV2l0aEFic29sdXRlKGNzc1RleHQsIGJhc2VQYXRoKTtcblxuICAgIGNvbnN0IGltcG9ydE1hdGNoZXMgPSBnZXRNYXRjaGVzKGNzc0ltcG9ydFJlZ2V4LCBjc3NUZXh0KTtcbiAgICBmb3IgKGNvbnN0IG1hdGNoIG9mIGltcG9ydE1hdGNoZXMpIHtcbiAgICAgICAgY29uc3QgaW1wb3J0VVJMID0gZ2V0Q1NTSW1wb3J0VVJMKG1hdGNoKTtcbiAgICAgICAgY29uc3QgYWJzb2x1dGVVUkwgPSBnZXRBYnNvbHV0ZVVSTChiYXNlUGF0aCwgaW1wb3J0VVJMKTtcbiAgICAgICAgbGV0IGltcG9ydGVkQ1NTOiBzdHJpbmc7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBpbXBvcnRlZENTUyA9IGF3YWl0IGxvYWRUZXh0KGFic29sdXRlVVJMKTtcbiAgICAgICAgICAgIGltcG9ydGVkQ1NTID0gYXdhaXQgcmVwbGFjZUNTU0ltcG9ydHMoaW1wb3J0ZWRDU1MsIGdldENTU0Jhc2VCYXRoKGFic29sdXRlVVJMKSk7XG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgbG9nV2FybihlcnIpO1xuICAgICAgICAgICAgaW1wb3J0ZWRDU1MgPSAnJztcbiAgICAgICAgfVxuICAgICAgICBjc3NUZXh0ID0gY3NzVGV4dC5zcGxpdChtYXRjaCkuam9pbihpbXBvcnRlZENTUyk7XG4gICAgfVxuXG4gICAgY3NzVGV4dCA9IGNzc1RleHQudHJpbSgpO1xuXG4gICAgcmV0dXJuIGNzc1RleHQ7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUNPUlNDb3B5KHNyY0VsZW1lbnQ6IFN0eWxlRWxlbWVudCwgY3NzVGV4dDogc3RyaW5nKSB7XG4gICAgaWYgKCFjc3NUZXh0KSB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGNvbnN0IGNvcnMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzdHlsZScpO1xuICAgIGNvcnMuY2xhc3NMaXN0LmFkZCgnZGFya3JlYWRlcicpO1xuICAgIGNvcnMuY2xhc3NMaXN0LmFkZCgnZGFya3JlYWRlci0tY29ycycpO1xuICAgIGNvcnMubWVkaWEgPSAnc2NyZWVuJztcbiAgICBjb3JzLnRleHRDb250ZW50ID0gY3NzVGV4dDtcbiAgICBzcmNFbGVtZW50LnBhcmVudE5vZGUuaW5zZXJ0QmVmb3JlKGNvcnMsIHNyY0VsZW1lbnQubmV4dFNpYmxpbmcpO1xuICAgIGNvcnMuc2hlZXQuZGlzYWJsZWQgPSB0cnVlO1xuXG4gICAgcmV0dXJuIGNvcnM7XG59XG4iLCJpbXBvcnQge2ZvckVhY2gsIHB1c2h9IGZyb20gJy4uLy4uL3V0aWxzL2FycmF5JztcbmltcG9ydCB7aXNEZWZpbmVkU2VsZWN0b3JTdXBwb3J0ZWR9IGZyb20gJy4uLy4uL3V0aWxzL3BsYXRmb3JtJztcbmltcG9ydCB7aXRlcmF0ZVNoYWRvd0hvc3RzLCBjcmVhdGVPcHRpbWl6ZWRUcmVlT2JzZXJ2ZXIsIEVsZW1lbnRzVHJlZU9wZXJhdGlvbnN9IGZyb20gJy4uL3V0aWxzL2RvbSc7XG5pbXBvcnQge3Nob3VsZE1hbmFnZVN0eWxlLCBnZXRNYW5hZ2VhYmxlU3R5bGVzLCBTdHlsZUVsZW1lbnR9IGZyb20gJy4vc3R5bGUtbWFuYWdlcic7XG5cbmNvbnN0IG9ic2VydmVycyA9IFtdIGFzIHtkaXNjb25uZWN0KCk6IHZvaWR9W107XG5sZXQgb2JzZXJ2ZWRSb290czogV2Vha1NldDxOb2RlPjtcblxuaW50ZXJmYWNlIENoYW5nZWRTdHlsZXMge1xuICAgIGNyZWF0ZWQ6IFN0eWxlRWxlbWVudFtdO1xuICAgIHVwZGF0ZWQ6IFN0eWxlRWxlbWVudFtdO1xuICAgIHJlbW92ZWQ6IFN0eWxlRWxlbWVudFtdO1xuICAgIG1vdmVkOiBTdHlsZUVsZW1lbnRbXTtcbn1cblxuY29uc3QgdW5kZWZpbmVkR3JvdXBzID0gbmV3IE1hcDxzdHJpbmcsIFNldDxFbGVtZW50Pj4oKTtcbmxldCBlbGVtZW50c0RlZmluaXRpb25DYWxsYmFjazogKGVsZW1lbnRzOiBFbGVtZW50W10pID0+IHZvaWQ7XG5cbmZ1bmN0aW9uIGNvbGxlY3RVbmRlZmluZWRFbGVtZW50cyhyb290OiBQYXJlbnROb2RlKSB7XG4gICAgaWYgKCFpc0RlZmluZWRTZWxlY3RvclN1cHBvcnRlZCgpKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgZm9yRWFjaChyb290LnF1ZXJ5U2VsZWN0b3JBbGwoJzpub3QoOmRlZmluZWQpJyksXG4gICAgICAgIChlbCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgdGFnID0gZWwudGFnTmFtZS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgaWYgKCF1bmRlZmluZWRHcm91cHMuaGFzKHRhZykpIHtcbiAgICAgICAgICAgICAgICB1bmRlZmluZWRHcm91cHMuc2V0KHRhZywgbmV3IFNldCgpKTtcbiAgICAgICAgICAgICAgICBjdXN0b21FbGVtZW50c1doZW5EZWZpbmVkKHRhZykudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChlbGVtZW50c0RlZmluaXRpb25DYWxsYmFjaykge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZWxlbWVudHMgPSB1bmRlZmluZWRHcm91cHMuZ2V0KHRhZyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB1bmRlZmluZWRHcm91cHMuZGVsZXRlKHRhZyk7XG4gICAgICAgICAgICAgICAgICAgICAgICBlbGVtZW50c0RlZmluaXRpb25DYWxsYmFjayhBcnJheS5mcm9tKGVsZW1lbnRzKSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHVuZGVmaW5lZEdyb3Vwcy5nZXQodGFnKS5hZGQoZWwpO1xuICAgICAgICB9KTtcbn1cblxuZnVuY3Rpb24gY3VzdG9tRWxlbWVudHNXaGVuRGVmaW5lZCh0YWc6IHN0cmluZykge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAvLyBgY3VzdG9tRWxlbWVudHMud2hlbkRlZmluZWRgIGlzIG5vdCBhdmFpbGFibGUgaW4gZXh0ZW5zaW9uc1xuICAgICAgICAvLyBodHRwczovL2J1Z3MuY2hyb21pdW0ub3JnL3AvY2hyb21pdW0vaXNzdWVzL2RldGFpbD9pZD0zOTA4MDdcbiAgICAgICAgaWYgKHdpbmRvdy5jdXN0b21FbGVtZW50cyAmJiB0eXBlb2Ygd2luZG93LmN1c3RvbUVsZW1lbnRzLndoZW5EZWZpbmVkID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICBjdXN0b21FbGVtZW50cy53aGVuRGVmaW5lZCh0YWcpLnRoZW4ocmVzb2x2ZSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zdCBjaGVja0lmRGVmaW5lZCA9ICgpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBlbGVtZW50cyA9IHVuZGVmaW5lZEdyb3Vwcy5nZXQodGFnKTtcbiAgICAgICAgICAgICAgICBpZiAoZWxlbWVudHMgJiYgZWxlbWVudHMuc2l6ZSA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGVsZW1lbnRzLnZhbHVlcygpLm5leHQoKS52YWx1ZS5tYXRjaGVzKCc6ZGVmaW5lZCcpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKCk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoY2hlY2tJZkRlZmluZWQpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZShjaGVja0lmRGVmaW5lZCk7XG4gICAgICAgIH1cbiAgICB9KTtcbn1cblxuZnVuY3Rpb24gd2F0Y2hXaGVuQ3VzdG9tRWxlbWVudHNEZWZpbmVkKGNhbGxiYWNrOiAoZWxlbWVudHM6IEVsZW1lbnRbXSkgPT4gdm9pZCkge1xuICAgIGVsZW1lbnRzRGVmaW5pdGlvbkNhbGxiYWNrID0gY2FsbGJhY2s7XG59XG5cbmZ1bmN0aW9uIHVuc3Vic2NyaWJlRnJvbURlZmluZUN1c3RvbUVsZW1lbnRzKCkge1xuICAgIGVsZW1lbnRzRGVmaW5pdGlvbkNhbGxiYWNrID0gbnVsbDtcbiAgICB1bmRlZmluZWRHcm91cHMuY2xlYXIoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHdhdGNoRm9yU3R5bGVDaGFuZ2VzKGN1cnJlbnRTdHlsZXM6IFN0eWxlRWxlbWVudFtdLCB1cGRhdGU6IChzdHlsZXM6IENoYW5nZWRTdHlsZXMpID0+IHZvaWQsIHNoYWRvd1Jvb3REaXNjb3ZlcmVkOiAocm9vdDogU2hhZG93Um9vdCkgPT4gdm9pZCkge1xuICAgIHN0b3BXYXRjaGluZ0ZvclN0eWxlQ2hhbmdlcygpO1xuXG4gICAgY29uc3QgcHJldlN0eWxlcyA9IG5ldyBTZXQ8U3R5bGVFbGVtZW50PihjdXJyZW50U3R5bGVzKTtcbiAgICBjb25zdCBwcmV2U3R5bGVTaWJsaW5ncyA9IG5ldyBXZWFrTWFwPEVsZW1lbnQsIEVsZW1lbnQ+KCk7XG4gICAgY29uc3QgbmV4dFN0eWxlU2libGluZ3MgPSBuZXcgV2Vha01hcDxFbGVtZW50LCBFbGVtZW50PigpO1xuXG4gICAgZnVuY3Rpb24gc2F2ZVN0eWxlUG9zaXRpb24oc3R5bGU6IFN0eWxlRWxlbWVudCkge1xuICAgICAgICBwcmV2U3R5bGVTaWJsaW5ncy5zZXQoc3R5bGUsIHN0eWxlLnByZXZpb3VzRWxlbWVudFNpYmxpbmcpO1xuICAgICAgICBuZXh0U3R5bGVTaWJsaW5ncy5zZXQoc3R5bGUsIHN0eWxlLm5leHRFbGVtZW50U2libGluZyk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZm9yZ2V0U3R5bGVQb3NpdGlvbihzdHlsZTogU3R5bGVFbGVtZW50KSB7XG4gICAgICAgIHByZXZTdHlsZVNpYmxpbmdzLmRlbGV0ZShzdHlsZSk7XG4gICAgICAgIG5leHRTdHlsZVNpYmxpbmdzLmRlbGV0ZShzdHlsZSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZGlkU3R5bGVQb3NpdGlvbkNoYW5nZShzdHlsZTogU3R5bGVFbGVtZW50KSB7XG4gICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICBzdHlsZS5wcmV2aW91c0VsZW1lbnRTaWJsaW5nICE9PSBwcmV2U3R5bGVTaWJsaW5ncy5nZXQoc3R5bGUpIHx8XG4gICAgICAgICAgICBzdHlsZS5uZXh0RWxlbWVudFNpYmxpbmcgIT09IG5leHRTdHlsZVNpYmxpbmdzLmdldChzdHlsZSlcbiAgICAgICAgKTtcbiAgICB9XG5cbiAgICBjdXJyZW50U3R5bGVzLmZvckVhY2goc2F2ZVN0eWxlUG9zaXRpb24pO1xuXG4gICAgZnVuY3Rpb24gaGFuZGxlU3R5bGVPcGVyYXRpb25zKG9wZXJhdGlvbnM6IHtjcmVhdGVkU3R5bGVzOiBTZXQ8U3R5bGVFbGVtZW50PjsgbW92ZWRTdHlsZXM6IFNldDxTdHlsZUVsZW1lbnQ+OyByZW1vdmVkU3R5bGVzOiBTZXQ8U3R5bGVFbGVtZW50Pn0pIHtcbiAgICAgICAgY29uc3Qge2NyZWF0ZWRTdHlsZXMsIHJlbW92ZWRTdHlsZXMsIG1vdmVkU3R5bGVzfSA9IG9wZXJhdGlvbnM7XG5cbiAgICAgICAgY3JlYXRlZFN0eWxlcy5mb3JFYWNoKChzKSA9PiBzYXZlU3R5bGVQb3NpdGlvbihzKSk7XG4gICAgICAgIG1vdmVkU3R5bGVzLmZvckVhY2goKHMpID0+IHNhdmVTdHlsZVBvc2l0aW9uKHMpKTtcbiAgICAgICAgcmVtb3ZlZFN0eWxlcy5mb3JFYWNoKChzKSA9PiBmb3JnZXRTdHlsZVBvc2l0aW9uKHMpKTtcblxuICAgICAgICBjcmVhdGVkU3R5bGVzLmZvckVhY2goKHMpID0+IHByZXZTdHlsZXMuYWRkKHMpKTtcbiAgICAgICAgcmVtb3ZlZFN0eWxlcy5mb3JFYWNoKChzKSA9PiBwcmV2U3R5bGVzLmRlbGV0ZShzKSk7XG5cbiAgICAgICAgaWYgKGNyZWF0ZWRTdHlsZXMuc2l6ZSArIHJlbW92ZWRTdHlsZXMuc2l6ZSArIG1vdmVkU3R5bGVzLnNpemUgPiAwKSB7XG4gICAgICAgICAgICB1cGRhdGUoe1xuICAgICAgICAgICAgICAgIGNyZWF0ZWQ6IEFycmF5LmZyb20oY3JlYXRlZFN0eWxlcyksXG4gICAgICAgICAgICAgICAgcmVtb3ZlZDogQXJyYXkuZnJvbShyZW1vdmVkU3R5bGVzKSxcbiAgICAgICAgICAgICAgICBtb3ZlZDogQXJyYXkuZnJvbShtb3ZlZFN0eWxlcyksXG4gICAgICAgICAgICAgICAgdXBkYXRlZDogW10sXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGhhbmRsZU1pbm9yVHJlZU11dGF0aW9ucyh7YWRkaXRpb25zLCBtb3ZlcywgZGVsZXRpb25zfTogRWxlbWVudHNUcmVlT3BlcmF0aW9ucykge1xuICAgICAgICBjb25zdCBjcmVhdGVkU3R5bGVzID0gbmV3IFNldDxTdHlsZUVsZW1lbnQ+KCk7XG4gICAgICAgIGNvbnN0IHJlbW92ZWRTdHlsZXMgPSBuZXcgU2V0PFN0eWxlRWxlbWVudD4oKTtcbiAgICAgICAgY29uc3QgbW92ZWRTdHlsZXMgPSBuZXcgU2V0PFN0eWxlRWxlbWVudD4oKTtcblxuICAgICAgICBhZGRpdGlvbnMuZm9yRWFjaCgobm9kZSkgPT4gZ2V0TWFuYWdlYWJsZVN0eWxlcyhub2RlKS5mb3JFYWNoKChzdHlsZSkgPT4gY3JlYXRlZFN0eWxlcy5hZGQoc3R5bGUpKSk7XG4gICAgICAgIGRlbGV0aW9ucy5mb3JFYWNoKChub2RlKSA9PiBnZXRNYW5hZ2VhYmxlU3R5bGVzKG5vZGUpLmZvckVhY2goKHN0eWxlKSA9PiByZW1vdmVkU3R5bGVzLmFkZChzdHlsZSkpKTtcbiAgICAgICAgbW92ZXMuZm9yRWFjaCgobm9kZSkgPT4gZ2V0TWFuYWdlYWJsZVN0eWxlcyhub2RlKS5mb3JFYWNoKChzdHlsZSkgPT4gbW92ZWRTdHlsZXMuYWRkKHN0eWxlKSkpO1xuXG4gICAgICAgIGhhbmRsZVN0eWxlT3BlcmF0aW9ucyh7Y3JlYXRlZFN0eWxlcywgcmVtb3ZlZFN0eWxlcywgbW92ZWRTdHlsZXN9KTtcblxuICAgICAgICBhZGRpdGlvbnMuZm9yRWFjaCgobikgPT4ge1xuICAgICAgICAgICAgaXRlcmF0ZVNoYWRvd0hvc3RzKG4sIHN1YnNjcmliZUZvclNoYWRvd1Jvb3RDaGFuZ2VzKTtcbiAgICAgICAgICAgIGNvbGxlY3RVbmRlZmluZWRFbGVtZW50cyhuKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gaGFuZGxlSHVnZVRyZWVNdXRhdGlvbnMocm9vdDogRG9jdW1lbnQgfCBTaGFkb3dSb290KSB7XG4gICAgICAgIGNvbnN0IHN0eWxlcyA9IG5ldyBTZXQoZ2V0TWFuYWdlYWJsZVN0eWxlcyhyb290KSk7XG5cbiAgICAgICAgY29uc3QgY3JlYXRlZFN0eWxlcyA9IG5ldyBTZXQ8U3R5bGVFbGVtZW50PigpO1xuICAgICAgICBjb25zdCByZW1vdmVkU3R5bGVzID0gbmV3IFNldDxTdHlsZUVsZW1lbnQ+KCk7XG4gICAgICAgIGNvbnN0IG1vdmVkU3R5bGVzID0gbmV3IFNldDxTdHlsZUVsZW1lbnQ+KCk7XG4gICAgICAgIHN0eWxlcy5mb3JFYWNoKChzKSA9PiB7XG4gICAgICAgICAgICBpZiAoIXByZXZTdHlsZXMuaGFzKHMpKSB7XG4gICAgICAgICAgICAgICAgY3JlYXRlZFN0eWxlcy5hZGQocyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBwcmV2U3R5bGVzLmZvckVhY2goKHMpID0+IHtcbiAgICAgICAgICAgIGlmICghc3R5bGVzLmhhcyhzKSkge1xuICAgICAgICAgICAgICAgIHJlbW92ZWRTdHlsZXMuYWRkKHMpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgc3R5bGVzLmZvckVhY2goKHMpID0+IHtcbiAgICAgICAgICAgIGlmICghY3JlYXRlZFN0eWxlcy5oYXMocykgJiYgIXJlbW92ZWRTdHlsZXMuaGFzKHMpICYmIGRpZFN0eWxlUG9zaXRpb25DaGFuZ2UocykpIHtcbiAgICAgICAgICAgICAgICBtb3ZlZFN0eWxlcy5hZGQocyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGhhbmRsZVN0eWxlT3BlcmF0aW9ucyh7Y3JlYXRlZFN0eWxlcywgcmVtb3ZlZFN0eWxlcywgbW92ZWRTdHlsZXN9KTtcblxuICAgICAgICBpdGVyYXRlU2hhZG93SG9zdHMocm9vdCwgc3Vic2NyaWJlRm9yU2hhZG93Um9vdENoYW5nZXMpO1xuICAgICAgICBjb2xsZWN0VW5kZWZpbmVkRWxlbWVudHMocm9vdCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gaGFuZGxlQXR0cmlidXRlTXV0YXRpb25zKG11dGF0aW9uczogTXV0YXRpb25SZWNvcmRbXSkge1xuICAgICAgICBjb25zdCB1cGRhdGVkU3R5bGVzID0gbmV3IFNldDxTdHlsZUVsZW1lbnQ+KCk7XG4gICAgICAgIG11dGF0aW9ucy5mb3JFYWNoKChtKSA9PiB7XG4gICAgICAgICAgICBpZiAoc2hvdWxkTWFuYWdlU3R5bGUobS50YXJnZXQpICYmIG0udGFyZ2V0LmlzQ29ubmVjdGVkKSB7XG4gICAgICAgICAgICAgICAgdXBkYXRlZFN0eWxlcy5hZGQobS50YXJnZXQgYXMgU3R5bGVFbGVtZW50KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIGlmICh1cGRhdGVkU3R5bGVzLnNpemUgPiAwKSB7XG4gICAgICAgICAgICB1cGRhdGUoe1xuICAgICAgICAgICAgICAgIHVwZGF0ZWQ6IEFycmF5LmZyb20odXBkYXRlZFN0eWxlcyksXG4gICAgICAgICAgICAgICAgY3JlYXRlZDogW10sXG4gICAgICAgICAgICAgICAgcmVtb3ZlZDogW10sXG4gICAgICAgICAgICAgICAgbW92ZWQ6IFtdLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBvYnNlcnZlKHJvb3Q6IERvY3VtZW50IHwgU2hhZG93Um9vdCkge1xuICAgICAgICBjb25zdCB0cmVlT2JzZXJ2ZXIgPSBjcmVhdGVPcHRpbWl6ZWRUcmVlT2JzZXJ2ZXIocm9vdCwge1xuICAgICAgICAgICAgb25NaW5vck11dGF0aW9uczogaGFuZGxlTWlub3JUcmVlTXV0YXRpb25zLFxuICAgICAgICAgICAgb25IdWdlTXV0YXRpb25zOiBoYW5kbGVIdWdlVHJlZU11dGF0aW9ucyxcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnN0IGF0dHJPYnNlcnZlciA9IG5ldyBNdXRhdGlvbk9ic2VydmVyKGhhbmRsZUF0dHJpYnV0ZU11dGF0aW9ucyk7XG4gICAgICAgIGF0dHJPYnNlcnZlci5vYnNlcnZlKHJvb3QsIHthdHRyaWJ1dGVzOiB0cnVlLCBhdHRyaWJ1dGVGaWx0ZXI6IFsncmVsJywgJ2Rpc2FibGVkJ10sIHN1YnRyZWU6IHRydWV9KTtcbiAgICAgICAgb2JzZXJ2ZXJzLnB1c2godHJlZU9ic2VydmVyLCBhdHRyT2JzZXJ2ZXIpO1xuICAgICAgICBvYnNlcnZlZFJvb3RzLmFkZChyb290KTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzdWJzY3JpYmVGb3JTaGFkb3dSb290Q2hhbmdlcyhub2RlOiBFbGVtZW50KSB7XG4gICAgICAgIGNvbnN0IHtzaGFkb3dSb290fSA9IG5vZGU7XG4gICAgICAgIGlmIChzaGFkb3dSb290ID09IG51bGwgfHwgb2JzZXJ2ZWRSb290cy5oYXMoc2hhZG93Um9vdCkpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBvYnNlcnZlKHNoYWRvd1Jvb3QpO1xuICAgICAgICBzaGFkb3dSb290RGlzY292ZXJlZChzaGFkb3dSb290KTtcbiAgICB9XG5cbiAgICBvYnNlcnZlKGRvY3VtZW50KTtcbiAgICBpdGVyYXRlU2hhZG93SG9zdHMoZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LCBzdWJzY3JpYmVGb3JTaGFkb3dSb290Q2hhbmdlcyk7XG5cbiAgICB3YXRjaFdoZW5DdXN0b21FbGVtZW50c0RlZmluZWQoKGhvc3RzKSA9PiB7XG4gICAgICAgIGNvbnN0IG5ld1N0eWxlczogU3R5bGVFbGVtZW50W10gPSBbXTtcbiAgICAgICAgaG9zdHMuZm9yRWFjaCgoaG9zdCkgPT4gcHVzaChuZXdTdHlsZXMsIGdldE1hbmFnZWFibGVTdHlsZXMoaG9zdC5zaGFkb3dSb290KSkpO1xuICAgICAgICB1cGRhdGUoe2NyZWF0ZWQ6IG5ld1N0eWxlcywgdXBkYXRlZDogW10sIHJlbW92ZWQ6IFtdLCBtb3ZlZDogW119KTtcbiAgICAgICAgaG9zdHMuZm9yRWFjaCgoaG9zdCkgPT4ge1xuICAgICAgICAgICAgY29uc3Qge3NoYWRvd1Jvb3R9ID0gaG9zdDtcbiAgICAgICAgICAgIGlmIChzaGFkb3dSb290ID09IG51bGwpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBzdWJzY3JpYmVGb3JTaGFkb3dSb290Q2hhbmdlcyhob3N0KTtcbiAgICAgICAgICAgIGl0ZXJhdGVTaGFkb3dIb3N0cyhzaGFkb3dSb290LCBzdWJzY3JpYmVGb3JTaGFkb3dSb290Q2hhbmdlcyk7XG4gICAgICAgICAgICBjb2xsZWN0VW5kZWZpbmVkRWxlbWVudHMoc2hhZG93Um9vdCk7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuICAgIGNvbGxlY3RVbmRlZmluZWRFbGVtZW50cyhkb2N1bWVudCk7XG59XG5cbmZ1bmN0aW9uIHJlc2V0T2JzZXJ2ZXJzKCkge1xuICAgIG9ic2VydmVycy5mb3JFYWNoKChvKSA9PiBvLmRpc2Nvbm5lY3QoKSk7XG4gICAgb2JzZXJ2ZXJzLnNwbGljZSgwLCBvYnNlcnZlcnMubGVuZ3RoKTtcbiAgICBvYnNlcnZlZFJvb3RzID0gbmV3IFdlYWtTZXQoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHN0b3BXYXRjaGluZ0ZvclN0eWxlQ2hhbmdlcygpIHtcbiAgICByZXNldE9ic2VydmVycygpO1xuICAgIHVuc3Vic2NyaWJlRnJvbURlZmluZUN1c3RvbUVsZW1lbnRzKCk7XG59XG4iLCJmdW5jdGlvbiBoZXhpZnkobnVtYmVyOiBudW1iZXIpIHtcbiAgICByZXR1cm4gKChudW1iZXIgPCAxNiA/ICcwJyA6ICcnKSArIG51bWJlci50b1N0cmluZygxNikpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2VuZXJhdGVVSUQoKSB7XG4gICAgcmV0dXJuIEFycmF5LmZyb20oY3J5cHRvLmdldFJhbmRvbVZhbHVlcyhuZXcgVWludDhBcnJheSgxNikpKS5tYXAoKHgpID0+IGhleGlmeSh4KSkuam9pbignJyk7XG59XG4iLCJpbXBvcnQge1RoZW1lfSBmcm9tICcuLi8uLi9kZWZpbml0aW9ucyc7XG5pbXBvcnQge2NyZWF0ZVN0eWxlU2hlZXRNb2RpZmllcn0gZnJvbSAnLi9zdHlsZXNoZWV0LW1vZGlmaWVyJztcbmltcG9ydCB7Z2V0Q1NTVmFyaWFibGVzfSBmcm9tICcuL2Nzcy1ydWxlcyc7XG5cbmNvbnN0IGFkb3B0ZWRTdHlsZU92ZXJyaWRlcyA9IG5ldyBXZWFrTWFwPENTU1N0eWxlU2hlZXQsIENTU1N0eWxlU2hlZXQ+KCk7XG5jb25zdCBvdmVycmlkZUxpc3QgPSBuZXcgV2Vha1NldDxDU1NTdHlsZVNoZWV0PigpO1xuXG5leHBvcnQgaW50ZXJmYWNlIEFkb3B0ZWRTdHlsZVNoZWV0TWFuYWdlciB7XG4gICAgcmVuZGVyKHRoZW1lOiBUaGVtZSwgdmFyaWFibGVzOiBNYXA8c3RyaW5nLCBzdHJpbmc+LCBpZ25vcmVJbWFnZUFuYWx5c2lzOiBzdHJpbmdbXSk6IHZvaWQ7XG4gICAgZGVzdHJveSgpOiB2b2lkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlQWRvcHRlZFN0eWxlU2hlZXRPdmVycmlkZShub2RlOiBEb2N1bWVudCB8IFNoYWRvd1Jvb3QpOiBBZG9wdGVkU3R5bGVTaGVldE1hbmFnZXIge1xuXG4gICAgbGV0IGNhbmNlbEFzeW5jT3BlcmF0aW9ucyA9IGZhbHNlO1xuXG4gICAgZnVuY3Rpb24gaW5qZWN0U2hlZXQoc2hlZXQ6IENTU1N0eWxlU2hlZXQsIG92ZXJyaWRlOiBDU1NTdHlsZVNoZWV0KSB7XG4gICAgICAgIGNvbnN0IG5ld1NoZWV0cyA9IFsuLi5ub2RlLmFkb3B0ZWRTdHlsZVNoZWV0c107XG4gICAgICAgIGNvbnN0IHNoZWV0SW5kZXggPSBuZXdTaGVldHMuaW5kZXhPZihzaGVldCk7XG4gICAgICAgIGNvbnN0IGV4aXN0aW5nSW5kZXggPSBuZXdTaGVldHMuaW5kZXhPZihvdmVycmlkZSk7XG4gICAgICAgIGlmIChzaGVldEluZGV4ID09PSBleGlzdGluZ0luZGV4IC0gMSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGlmIChleGlzdGluZ0luZGV4ID49IDApIHtcbiAgICAgICAgICAgIG5ld1NoZWV0cy5zcGxpY2UoZXhpc3RpbmdJbmRleCwgMSk7XG4gICAgICAgIH1cbiAgICAgICAgbmV3U2hlZXRzLnNwbGljZShzaGVldEluZGV4ICsgMSwgMCwgb3ZlcnJpZGUpO1xuICAgICAgICBub2RlLmFkb3B0ZWRTdHlsZVNoZWV0cyA9IG5ld1NoZWV0cztcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBkZXN0cm95KCkge1xuICAgICAgICBjYW5jZWxBc3luY09wZXJhdGlvbnMgPSB0cnVlO1xuICAgICAgICBjb25zdCBuZXdTaGVldHMgPSBbLi4ubm9kZS5hZG9wdGVkU3R5bGVTaGVldHNdO1xuICAgICAgICBub2RlLmFkb3B0ZWRTdHlsZVNoZWV0cy5mb3JFYWNoKChhZG9wdGVkU3R5bGVTaGVldCkgPT4ge1xuICAgICAgICAgICAgaWYgKG92ZXJyaWRlTGlzdC5oYXMoYWRvcHRlZFN0eWxlU2hlZXQpKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZXhpc3RpbmdJbmRleCA9IG5ld1NoZWV0cy5pbmRleE9mKGFkb3B0ZWRTdHlsZVNoZWV0KTtcbiAgICAgICAgICAgICAgICBpZiAoZXhpc3RpbmdJbmRleCA+PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIG5ld1NoZWV0cy5zcGxpY2UoZXhpc3RpbmdJbmRleCwgMSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGFkb3B0ZWRTdHlsZU92ZXJyaWRlcy5kZWxldGUoYWRvcHRlZFN0eWxlU2hlZXQpO1xuICAgICAgICAgICAgICAgIG92ZXJyaWRlTGlzdC5kZWxldGUoYWRvcHRlZFN0eWxlU2hlZXQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgbm9kZS5hZG9wdGVkU3R5bGVTaGVldHMgPSBuZXdTaGVldHM7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcmVuZGVyKHRoZW1lOiBUaGVtZSwgZ2xvYmFsVmFyaWFibGVzOiBNYXA8c3RyaW5nLCBzdHJpbmc+LCBpZ25vcmVJbWFnZUFuYWx5c2lzOiBzdHJpbmdbXSkge1xuICAgICAgICBub2RlLmFkb3B0ZWRTdHlsZVNoZWV0cy5mb3JFYWNoKChzaGVldCkgPT4ge1xuICAgICAgICAgICAgaWYgKG92ZXJyaWRlTGlzdC5oYXMoc2hlZXQpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgcnVsZXMgPSBzaGVldC5ydWxlcztcbiAgICAgICAgICAgIGNvbnN0IG92ZXJyaWRlID0gbmV3IENTU1N0eWxlU2hlZXQoKTtcblxuICAgICAgICAgICAgZnVuY3Rpb24gcHJlcGFyZU92ZXJyaWRlc1NoZWV0KCkge1xuICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSBvdmVycmlkZS5jc3NSdWxlcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgICAgICAgICAgICAgICAgICBvdmVycmlkZS5kZWxldGVSdWxlKGkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpbmplY3RTaGVldChzaGVldCwgb3ZlcnJpZGUpO1xuICAgICAgICAgICAgICAgIGFkb3B0ZWRTdHlsZU92ZXJyaWRlcy5zZXQoc2hlZXQsIG92ZXJyaWRlKTtcbiAgICAgICAgICAgICAgICBvdmVycmlkZUxpc3QuYWRkKG92ZXJyaWRlKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gb3ZlcnJpZGU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIFRPRE86IE1ha2UgZWFjaCBhZG9wdGVkU3R5bGVTaGVldCB2YXJpYWJsZSBnb29kIGZvciB0aGUgcmVzcGVjdGl2ZSBgc2hhZG93LXJvb3Qgc2NvcGVgLlxuICAgICAgICAgICAgY29uc3QgdmFyaWFibGVzOiBNYXA8c3RyaW5nLCBzdHJpbmc+ID0gZ2xvYmFsVmFyaWFibGVzO1xuICAgICAgICAgICAgZ2V0Q1NTVmFyaWFibGVzKHNoZWV0LmNzc1J1bGVzKS5mb3JFYWNoKCh2YWx1ZSwga2V5KSA9PiB2YXJpYWJsZXMuc2V0KGtleSwgdmFsdWUpKTtcblxuICAgICAgICAgICAgY29uc3Qgc2hlZXRNb2RpZmllciA9IGNyZWF0ZVN0eWxlU2hlZXRNb2RpZmllcigpO1xuICAgICAgICAgICAgc2hlZXRNb2RpZmllci5tb2RpZnlTaGVldCh7XG4gICAgICAgICAgICAgICAgcHJlcGFyZVNoZWV0OiBwcmVwYXJlT3ZlcnJpZGVzU2hlZXQsXG4gICAgICAgICAgICAgICAgc291cmNlQ1NTUnVsZXM6IHJ1bGVzLFxuICAgICAgICAgICAgICAgIHRoZW1lLFxuICAgICAgICAgICAgICAgIHZhcmlhYmxlcyxcbiAgICAgICAgICAgICAgICBpZ25vcmVJbWFnZUFuYWx5c2lzLFxuICAgICAgICAgICAgICAgIGZvcmNlOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBpc0FzeW5jQ2FuY2VsbGVkOiAoKSA9PiBjYW5jZWxBc3luY09wZXJhdGlvbnMsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIHJldHVybiB7XG4gICAgICAgIHJlbmRlcixcbiAgICAgICAgZGVzdHJveVxuICAgIH07XG59XG4iLCJpbXBvcnQge3JlcGxhY2VDU1NWYXJpYWJsZXMsIGdldEVsZW1lbnRDU1NWYXJpYWJsZXN9IGZyb20gJy4vY3NzLXJ1bGVzJztcbmltcG9ydCB7b3ZlcnJpZGVJbmxpbmVTdHlsZSwgZ2V0SW5saW5lT3ZlcnJpZGVTdHlsZSwgd2F0Y2hGb3JJbmxpbmVTdHlsZXMsIHN0b3BXYXRjaGluZ0ZvcklubGluZVN0eWxlcywgSU5MSU5FX1NUWUxFX1NFTEVDVE9SfSBmcm9tICcuL2lubGluZS1zdHlsZSc7XG5pbXBvcnQge2NoYW5nZU1ldGFUaGVtZUNvbG9yV2hlbkF2YWlsYWJsZSwgcmVzdG9yZU1ldGFUaGVtZUNvbG9yfSBmcm9tICcuL21ldGEtdGhlbWUtY29sb3InO1xuaW1wb3J0IHtnZXRNb2RpZmllZFVzZXJBZ2VudFN0eWxlLCBnZXRNb2RpZmllZEZhbGxiYWNrU3R5bGUsIGNsZWFuTW9kaWZpY2F0aW9uQ2FjaGUsIHBhcnNlQ29sb3JXaXRoQ2FjaGUsIGdldFNlbGVjdGlvbkNvbG9yfSBmcm9tICcuL21vZGlmeS1jc3MnO1xuaW1wb3J0IHttYW5hZ2VTdHlsZSwgZ2V0TWFuYWdlYWJsZVN0eWxlcywgU3R5bGVFbGVtZW50LCBTdHlsZU1hbmFnZXJ9IGZyb20gJy4vc3R5bGUtbWFuYWdlcic7XG5pbXBvcnQge3dhdGNoRm9yU3R5bGVDaGFuZ2VzLCBzdG9wV2F0Y2hpbmdGb3JTdHlsZUNoYW5nZXN9IGZyb20gJy4vd2F0Y2gnO1xuaW1wb3J0IHtmb3JFYWNoLCBwdXNoLCB0b0FycmF5fSBmcm9tICcuLi8uLi91dGlscy9hcnJheSc7XG5pbXBvcnQge3JlbW92ZU5vZGUsIHdhdGNoRm9yTm9kZVBvc2l0aW9uLCBpdGVyYXRlU2hhZG93SG9zdHMsIGlzRE9NUmVhZHksIGFkZERPTVJlYWR5TGlzdGVuZXIsIHJlbW92ZURPTVJlYWR5TGlzdGVuZXJ9IGZyb20gJy4uL3V0aWxzL2RvbSc7XG5pbXBvcnQge2xvZ1dhcm59IGZyb20gJy4uL3V0aWxzL2xvZyc7XG5pbXBvcnQge3Rocm90dGxlfSBmcm9tICcuLi91dGlscy90aHJvdHRsZSc7XG5pbXBvcnQge2NsYW1wfSBmcm9tICcuLi8uLi91dGlscy9tYXRoJztcbmltcG9ydCB7aXNGaXJlZm94fSBmcm9tICcuLi8uLi91dGlscy9wbGF0Zm9ybSc7XG5pbXBvcnQge2dldENTU0ZpbHRlclZhbHVlfSBmcm9tICcuLi8uLi9nZW5lcmF0b3JzL2Nzcy1maWx0ZXInO1xuaW1wb3J0IHttb2RpZnlDb2xvcn0gZnJvbSAnLi4vLi4vZ2VuZXJhdG9ycy9tb2RpZnktY29sb3JzJztcbmltcG9ydCB7Y3JlYXRlVGV4dFN0eWxlfSBmcm9tICcuLi8uLi9nZW5lcmF0b3JzL3RleHQtc3R5bGUnO1xuaW1wb3J0IHtGaWx0ZXJDb25maWcsIER5bmFtaWNUaGVtZUZpeH0gZnJvbSAnLi4vLi4vZGVmaW5pdGlvbnMnO1xuaW1wb3J0IHtnZW5lcmF0ZVVJRH0gZnJvbSAnLi4vLi4vdXRpbHMvdWlkJztcbmltcG9ydCB7Y3JlYXRlQWRvcHRlZFN0eWxlU2hlZXRPdmVycmlkZSwgQWRvcHRlZFN0eWxlU2hlZXRNYW5hZ2VyfSBmcm9tICcuL2Fkb3B0ZWQtc3R5bGUtbWFuZ2VyJztcblxuY29uc3QgdmFyaWFibGVzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcbmNvbnN0IElOU1RBTkNFX0lEID0gZ2VuZXJhdGVVSUQoKTtcbmNvbnN0IHN0eWxlTWFuYWdlcnMgPSBuZXcgTWFwPFN0eWxlRWxlbWVudCwgU3R5bGVNYW5hZ2VyPigpO1xuY29uc3QgYWRvcHRlZFN0eWxlTWFuYWdlcnMgPSBbXSBhcyBBcnJheTxBZG9wdGVkU3R5bGVTaGVldE1hbmFnZXI+O1xubGV0IGZpbHRlcjogRmlsdGVyQ29uZmlnID0gbnVsbDtcbmxldCBmaXhlczogRHluYW1pY1RoZW1lRml4ID0gbnVsbDtcbmxldCBpc0lGcmFtZTogYm9vbGVhbiA9IG51bGw7XG5cbmZ1bmN0aW9uIGNyZWF0ZU9yVXBkYXRlU3R5bGUoY2xhc3NOYW1lOiBzdHJpbmcsIHJvb3Q6IFBhcmVudE5vZGUgPSBkb2N1bWVudC5oZWFkIHx8IGRvY3VtZW50KSB7XG4gICAgbGV0IHN0eWxlID0gcm9vdC5xdWVyeVNlbGVjdG9yKGAuJHtjbGFzc05hbWV9YCkgYXMgSFRNTFN0eWxlRWxlbWVudDtcbiAgICBpZiAoIXN0eWxlKSB7XG4gICAgICAgIHN0eWxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3R5bGUnKTtcbiAgICAgICAgc3R5bGUuY2xhc3NMaXN0LmFkZCgnZGFya3JlYWRlcicpO1xuICAgICAgICBzdHlsZS5jbGFzc0xpc3QuYWRkKGNsYXNzTmFtZSk7XG4gICAgICAgIHN0eWxlLm1lZGlhID0gJ3NjcmVlbic7XG4gICAgfVxuICAgIHJldHVybiBzdHlsZTtcbn1cblxuY29uc3Qgc3R5bGVQb3NpdGlvbldhdGNoZXJzID0gbmV3IE1hcDxzdHJpbmcsIFJldHVyblR5cGU8dHlwZW9mIHdhdGNoRm9yTm9kZVBvc2l0aW9uPj4oKTtcblxuZnVuY3Rpb24gc2V0dXBTdHlsZVBvc2l0aW9uV2F0Y2hlcihub2RlOiBOb2RlLCBhbGlhczogc3RyaW5nKSB7XG4gICAgc3R5bGVQb3NpdGlvbldhdGNoZXJzLmhhcyhhbGlhcykgJiYgc3R5bGVQb3NpdGlvbldhdGNoZXJzLmdldChhbGlhcykuc3RvcCgpO1xuICAgIHN0eWxlUG9zaXRpb25XYXRjaGVycy5zZXQoYWxpYXMsIHdhdGNoRm9yTm9kZVBvc2l0aW9uKG5vZGUsICdwYXJlbnQnKSk7XG59XG5cbmZ1bmN0aW9uIHN0b3BTdHlsZVBvc2l0aW9uV2F0Y2hlcnMoKSB7XG4gICAgZm9yRWFjaChzdHlsZVBvc2l0aW9uV2F0Y2hlcnMudmFsdWVzKCksICh3YXRjaGVyKSA9PiB3YXRjaGVyLnN0b3AoKSk7XG4gICAgc3R5bGVQb3NpdGlvbldhdGNoZXJzLmNsZWFyKCk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVN0YXRpY1N0eWxlT3ZlcnJpZGVzKCkge1xuICAgIGNvbnN0IGZhbGxiYWNrU3R5bGUgPSBjcmVhdGVPclVwZGF0ZVN0eWxlKCdkYXJrcmVhZGVyLS1mYWxsYmFjaycsIGRvY3VtZW50KTtcbiAgICBmYWxsYmFja1N0eWxlLnRleHRDb250ZW50ID0gZ2V0TW9kaWZpZWRGYWxsYmFja1N0eWxlKGZpbHRlciwge3N0cmljdDogdHJ1ZX0pO1xuICAgIGRvY3VtZW50LmhlYWQuaW5zZXJ0QmVmb3JlKGZhbGxiYWNrU3R5bGUsIGRvY3VtZW50LmhlYWQuZmlyc3RDaGlsZCk7XG4gICAgc2V0dXBTdHlsZVBvc2l0aW9uV2F0Y2hlcihmYWxsYmFja1N0eWxlLCAnZmFsbGJhY2snKTtcblxuICAgIGNvbnN0IHVzZXJBZ2VudFN0eWxlID0gY3JlYXRlT3JVcGRhdGVTdHlsZSgnZGFya3JlYWRlci0tdXNlci1hZ2VudCcpO1xuICAgIHVzZXJBZ2VudFN0eWxlLnRleHRDb250ZW50ID0gZ2V0TW9kaWZpZWRVc2VyQWdlbnRTdHlsZShmaWx0ZXIsIGlzSUZyYW1lLCBmaWx0ZXIuc3R5bGVTeXN0ZW1Db250cm9scyk7XG4gICAgZG9jdW1lbnQuaGVhZC5pbnNlcnRCZWZvcmUodXNlckFnZW50U3R5bGUsIGZhbGxiYWNrU3R5bGUubmV4dFNpYmxpbmcpO1xuICAgIHNldHVwU3R5bGVQb3NpdGlvbldhdGNoZXIodXNlckFnZW50U3R5bGUsICd1c2VyLWFnZW50Jyk7XG5cbiAgICBjb25zdCB0ZXh0U3R5bGUgPSBjcmVhdGVPclVwZGF0ZVN0eWxlKCdkYXJrcmVhZGVyLS10ZXh0Jyk7XG4gICAgaWYgKGZpbHRlci51c2VGb250IHx8IGZpbHRlci50ZXh0U3Ryb2tlID4gMCkge1xuICAgICAgICB0ZXh0U3R5bGUudGV4dENvbnRlbnQgPSBjcmVhdGVUZXh0U3R5bGUoZmlsdGVyKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICB0ZXh0U3R5bGUudGV4dENvbnRlbnQgPSAnJztcbiAgICB9XG4gICAgZG9jdW1lbnQuaGVhZC5pbnNlcnRCZWZvcmUodGV4dFN0eWxlLCBmYWxsYmFja1N0eWxlLm5leHRTaWJsaW5nKTtcbiAgICBzZXR1cFN0eWxlUG9zaXRpb25XYXRjaGVyKHRleHRTdHlsZSwgJ3RleHQnKTtcblxuICAgIGNvbnN0IGludmVydFN0eWxlID0gY3JlYXRlT3JVcGRhdGVTdHlsZSgnZGFya3JlYWRlci0taW52ZXJ0Jyk7XG4gICAgaWYgKGZpeGVzICYmIEFycmF5LmlzQXJyYXkoZml4ZXMuaW52ZXJ0KSAmJiBmaXhlcy5pbnZlcnQubGVuZ3RoID4gMCkge1xuICAgICAgICBpbnZlcnRTdHlsZS50ZXh0Q29udGVudCA9IFtcbiAgICAgICAgICAgIGAke2ZpeGVzLmludmVydC5qb2luKCcsICcpfSB7YCxcbiAgICAgICAgICAgIGAgICAgZmlsdGVyOiAke2dldENTU0ZpbHRlclZhbHVlKHtcbiAgICAgICAgICAgICAgICAuLi5maWx0ZXIsXG4gICAgICAgICAgICAgICAgY29udHJhc3Q6IGZpbHRlci5tb2RlID09PSAwID8gZmlsdGVyLmNvbnRyYXN0IDogY2xhbXAoZmlsdGVyLmNvbnRyYXN0IC0gMTAsIDAsIDEwMCksXG4gICAgICAgICAgICB9KX0gIWltcG9ydGFudDtgLFxuICAgICAgICAgICAgJ30nLFxuICAgICAgICBdLmpvaW4oJ1xcbicpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIGludmVydFN0eWxlLnRleHRDb250ZW50ID0gJyc7XG4gICAgfVxuICAgIGRvY3VtZW50LmhlYWQuaW5zZXJ0QmVmb3JlKGludmVydFN0eWxlLCB0ZXh0U3R5bGUubmV4dFNpYmxpbmcpO1xuICAgIHNldHVwU3R5bGVQb3NpdGlvbldhdGNoZXIoaW52ZXJ0U3R5bGUsICdpbnZlcnQnKTtcblxuICAgIGNvbnN0IGlubGluZVN0eWxlID0gY3JlYXRlT3JVcGRhdGVTdHlsZSgnZGFya3JlYWRlci0taW5saW5lJyk7XG4gICAgaW5saW5lU3R5bGUudGV4dENvbnRlbnQgPSBnZXRJbmxpbmVPdmVycmlkZVN0eWxlKCk7XG4gICAgZG9jdW1lbnQuaGVhZC5pbnNlcnRCZWZvcmUoaW5saW5lU3R5bGUsIGludmVydFN0eWxlLm5leHRTaWJsaW5nKTtcbiAgICBzZXR1cFN0eWxlUG9zaXRpb25XYXRjaGVyKGlubGluZVN0eWxlLCAnaW5saW5lJyk7XG5cbiAgICBjb25zdCBvdmVycmlkZVN0eWxlID0gY3JlYXRlT3JVcGRhdGVTdHlsZSgnZGFya3JlYWRlci0tb3ZlcnJpZGUnKTtcbiAgICBvdmVycmlkZVN0eWxlLnRleHRDb250ZW50ID0gZml4ZXMgJiYgZml4ZXMuY3NzID8gcmVwbGFjZUNTU1RlbXBsYXRlcyhmaXhlcy5jc3MpIDogJyc7XG4gICAgZG9jdW1lbnQuaGVhZC5hcHBlbmRDaGlsZChvdmVycmlkZVN0eWxlKTtcbiAgICBzZXR1cFN0eWxlUG9zaXRpb25XYXRjaGVyKG92ZXJyaWRlU3R5bGUsICdvdmVycmlkZScpO1xuXG4gICAgY29uc3QgdmFyaWFibGVTdHlsZSA9IGNyZWF0ZU9yVXBkYXRlU3R5bGUoJ2RhcmtyZWFkZXItLXZhcmlhYmxlcycpO1xuICAgIGNvbnN0IHNlbGVjdGlvbkNvbG9ycyA9IGdldFNlbGVjdGlvbkNvbG9yKGZpbHRlcik7XG4gICAgY29uc3Qge2RhcmtTY2hlbWVCYWNrZ3JvdW5kQ29sb3IsIGRhcmtTY2hlbWVUZXh0Q29sb3IsIGxpZ2h0U2NoZW1lQmFja2dyb3VuZENvbG9yLCBsaWdodFNjaGVtZVRleHRDb2xvcn0gPSBmaWx0ZXI7XG4gICAgdmFyaWFibGVTdHlsZS50ZXh0Q29udGVudCA9IFtcbiAgICAgICAgYDpyb290IHtgLFxuICAgICAgICBgICAgLS1kYXJrcmVhZGVyLW5ldXRyYWwtYmFja2dyb3VuZDogJHtmaWx0ZXIubW9kZSA9PT0gMCA/IGxpZ2h0U2NoZW1lQmFja2dyb3VuZENvbG9yIDogZGFya1NjaGVtZUJhY2tncm91bmRDb2xvcn07YCxcbiAgICAgICAgYCAgIC0tZGFya3JlYWRlci1uZXV0cmFsLXRleHQ6ICR7ZmlsdGVyLm1vZGUgPT09IDAgPyBsaWdodFNjaGVtZVRleHRDb2xvciA6IGRhcmtTY2hlbWVUZXh0Q29sb3J9O2AsXG4gICAgICAgIGAgICAtLWRhcmtyZWFkZXItc2VsZWN0aW9uLWJhY2tncm91bmQ6ICR7c2VsZWN0aW9uQ29sb3JzLmJhY2tncm91bmRDb2xvclNlbGVjdGlvbn07YCxcbiAgICAgICAgYCAgIC0tZGFya3JlYWRlci1zZWxlY3Rpb24tdGV4dDogJHtzZWxlY3Rpb25Db2xvcnMuZm9yZWdyb3VuZENvbG9yU2VsZWN0aW9ufTtgLFxuICAgICAgICBgfWBcbiAgICBdLmpvaW4oJ1xcbicpO1xuICAgIGRvY3VtZW50LmhlYWQuaW5zZXJ0QmVmb3JlKHZhcmlhYmxlU3R5bGUsIGlubGluZVN0eWxlLm5leHRTaWJsaW5nKTtcbiAgICBzZXR1cFN0eWxlUG9zaXRpb25XYXRjaGVyKHZhcmlhYmxlU3R5bGUsICd2YXJpYWJsZXMnKTtcbn1cblxuY29uc3Qgc2hhZG93Um9vdHNXaXRoT3ZlcnJpZGVzID0gbmV3IFNldDxTaGFkb3dSb290PigpO1xuXG5mdW5jdGlvbiBjcmVhdGVTaGFkb3dTdGF0aWNTdHlsZU92ZXJyaWRlcyhyb290OiBTaGFkb3dSb290KSB7XG4gICAgY29uc3QgaW5saW5lU3R5bGUgPSBjcmVhdGVPclVwZGF0ZVN0eWxlKCdkYXJrcmVhZGVyLS1pbmxpbmUnLCByb290KTtcbiAgICBpbmxpbmVTdHlsZS50ZXh0Q29udGVudCA9IGdldElubGluZU92ZXJyaWRlU3R5bGUoKTtcbiAgICByb290Lmluc2VydEJlZm9yZShpbmxpbmVTdHlsZSwgcm9vdC5maXJzdENoaWxkKTtcbiAgICBzaGFkb3dSb290c1dpdGhPdmVycmlkZXMuYWRkKHJvb3QpO1xufVxuXG5mdW5jdGlvbiByZXBsYWNlQ1NTVGVtcGxhdGVzKCRjc3NUZXh0OiBzdHJpbmcpIHtcbiAgICByZXR1cm4gJGNzc1RleHQucmVwbGFjZSgvXFwkeyguKz8pfS9nLCAobTAsICRjb2xvcikgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgY29sb3IgPSBwYXJzZUNvbG9yV2l0aENhY2hlKCRjb2xvcik7XG4gICAgICAgICAgICByZXR1cm4gbW9kaWZ5Q29sb3IoY29sb3IsIGZpbHRlcik7XG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgbG9nV2FybihlcnIpO1xuICAgICAgICAgICAgcmV0dXJuICRjb2xvcjtcbiAgICAgICAgfVxuICAgIH0pO1xufVxuXG5mdW5jdGlvbiBjbGVhbkZhbGxiYWNrU3R5bGUoKSB7XG4gICAgY29uc3QgZmFsbGJhY2sgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcuZGFya3JlYWRlci0tZmFsbGJhY2snKTtcbiAgICBpZiAoZmFsbGJhY2spIHtcbiAgICAgICAgZmFsbGJhY2sudGV4dENvbnRlbnQgPSAnJztcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGdldElnbm9yZUltYWdlQW5hbHlzaXNTZWxlY3RvcnMoKSB7XG4gICAgcmV0dXJuIGZpeGVzICYmIEFycmF5LmlzQXJyYXkoZml4ZXMuaWdub3JlSW1hZ2VBbmFseXNpcykgPyBmaXhlcy5pZ25vcmVJbWFnZUFuYWx5c2lzIDogW107XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUR5bmFtaWNTdHlsZU92ZXJyaWRlcygpIHtcbiAgICBjYW5jZWxSZW5kZXJpbmcoKTtcblxuICAgIHVwZGF0ZVZhcmlhYmxlcyhnZXRFbGVtZW50Q1NTVmFyaWFibGVzKGRvY3VtZW50LmRvY3VtZW50RWxlbWVudCkpO1xuXG4gICAgY29uc3QgYWxsU3R5bGVzID0gZ2V0TWFuYWdlYWJsZVN0eWxlcyhkb2N1bWVudCk7XG5cbiAgICBjb25zdCBuZXdNYW5hZ2VycyA9IGFsbFN0eWxlc1xuICAgICAgICAuZmlsdGVyKChzdHlsZSkgPT4gIXN0eWxlTWFuYWdlcnMuaGFzKHN0eWxlKSlcbiAgICAgICAgLm1hcCgoc3R5bGUpID0+IGNyZWF0ZU1hbmFnZXIoc3R5bGUpKTtcbiAgICBjb25zdCBuZXdWYXJpYWJsZXMgPSBuZXdNYW5hZ2Vyc1xuICAgICAgICAubWFwKChtYW5hZ2VyKSA9PiBtYW5hZ2VyLmRldGFpbHMoKSlcbiAgICAgICAgLmZpbHRlcigoZGV0YWlscykgPT4gZGV0YWlscyAmJiBkZXRhaWxzLnZhcmlhYmxlcy5zaXplID4gMClcbiAgICAgICAgLm1hcCgoe3ZhcmlhYmxlc30pID0+IHZhcmlhYmxlcyk7XG4gICAgaWYgKG5ld1ZhcmlhYmxlcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgc3R5bGVNYW5hZ2Vycy5mb3JFYWNoKChtYW5hZ2VyKSA9PiBtYW5hZ2VyLnJlbmRlcihmaWx0ZXIsIHZhcmlhYmxlcywgZ2V0SWdub3JlSW1hZ2VBbmFseXNpc1NlbGVjdG9ycygpKSk7XG4gICAgICAgIGlmIChsb2FkaW5nU3R5bGVzLnNpemUgPT09IDApIHtcbiAgICAgICAgICAgIGNsZWFuRmFsbGJhY2tTdHlsZSgpO1xuICAgICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgICAgbmV3VmFyaWFibGVzLmZvckVhY2goKHZhcmlhYmxlcykgPT4gdXBkYXRlVmFyaWFibGVzKHZhcmlhYmxlcykpO1xuICAgICAgICB0aHJvdHRsZWRSZW5kZXJBbGxTdHlsZXMoKCkgPT4ge1xuICAgICAgICAgICAgaWYgKGxvYWRpbmdTdHlsZXMuc2l6ZSA9PT0gMCkge1xuICAgICAgICAgICAgICAgIGNsZWFuRmFsbGJhY2tTdHlsZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG4gICAgbmV3TWFuYWdlcnMuZm9yRWFjaCgobWFuYWdlcikgPT4gbWFuYWdlci53YXRjaCgpKTtcblxuICAgIGNvbnN0IGlubGluZVN0eWxlRWxlbWVudHMgPSB0b0FycmF5KGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoSU5MSU5FX1NUWUxFX1NFTEVDVE9SKSk7XG4gICAgaXRlcmF0ZVNoYWRvd0hvc3RzKGRvY3VtZW50LmRvY3VtZW50RWxlbWVudCwgKGhvc3QpID0+IHtcbiAgICAgICAgY29uc3QgZWxlbWVudHMgPSBob3N0LnNoYWRvd1Jvb3QucXVlcnlTZWxlY3RvckFsbChJTkxJTkVfU1RZTEVfU0VMRUNUT1IpO1xuICAgICAgICBpZiAoZWxlbWVudHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgY3JlYXRlU2hhZG93U3RhdGljU3R5bGVPdmVycmlkZXMoaG9zdC5zaGFkb3dSb290KTtcbiAgICAgICAgICAgIHB1c2goaW5saW5lU3R5bGVFbGVtZW50cywgZWxlbWVudHMpO1xuICAgICAgICB9XG4gICAgfSk7XG4gICAgY29uc3QgaWdub3JlZElubGluZVNlbGVjdG9ycyA9IGZpeGVzICYmIEFycmF5LmlzQXJyYXkoZml4ZXMuaWdub3JlSW5saW5lU3R5bGUpID8gZml4ZXMuaWdub3JlSW5saW5lU3R5bGUgOiBbXTtcbiAgICBpbmxpbmVTdHlsZUVsZW1lbnRzLmZvckVhY2goKGVsKSA9PiBvdmVycmlkZUlubGluZVN0eWxlKGVsIGFzIEhUTUxFbGVtZW50LCBmaWx0ZXIsIGdldElnbm9yZUltYWdlQW5hbHlzaXNTZWxlY3RvcnMoKSwgaWdub3JlZElubGluZVNlbGVjdG9ycykpO1xuICAgIGhhbmRsZUFkb3B0ZWRTdHlsZVNoZWV0cyhkb2N1bWVudCk7XG59XG5cbmxldCBsb2FkaW5nU3R5bGVzQ291bnRlciA9IDA7XG5jb25zdCBsb2FkaW5nU3R5bGVzID0gbmV3IFNldCgpO1xuXG5mdW5jdGlvbiBjcmVhdGVNYW5hZ2VyKGVsZW1lbnQ6IFN0eWxlRWxlbWVudCkge1xuICAgIGNvbnN0IGxvYWRpbmdTdHlsZUlkID0gKytsb2FkaW5nU3R5bGVzQ291bnRlcjtcblxuICAgIGZ1bmN0aW9uIGxvYWRpbmdTdGFydCgpIHtcbiAgICAgICAgaWYgKCFpc0RPTVJlYWR5KCkgfHwgIWRpZERvY3VtZW50U2hvd1VwKSB7XG4gICAgICAgICAgICBsb2FkaW5nU3R5bGVzLmFkZChsb2FkaW5nU3R5bGVJZCk7XG5cbiAgICAgICAgICAgIGNvbnN0IGZhbGxiYWNrU3R5bGUgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcuZGFya3JlYWRlci0tZmFsbGJhY2snKTtcbiAgICAgICAgICAgIGlmICghZmFsbGJhY2tTdHlsZS50ZXh0Q29udGVudCkge1xuICAgICAgICAgICAgICAgIGZhbGxiYWNrU3R5bGUudGV4dENvbnRlbnQgPSBnZXRNb2RpZmllZEZhbGxiYWNrU3R5bGUoZmlsdGVyLCB7c3RyaWN0OiBmYWxzZX0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbG9hZGluZ0VuZCgpIHtcbiAgICAgICAgbG9hZGluZ1N0eWxlcy5kZWxldGUobG9hZGluZ1N0eWxlSWQpO1xuICAgICAgICBpZiAobG9hZGluZ1N0eWxlcy5zaXplID09PSAwICYmIGlzRE9NUmVhZHkoKSkge1xuICAgICAgICAgICAgY2xlYW5GYWxsYmFja1N0eWxlKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiB1cGRhdGUoKSB7XG4gICAgICAgIGNvbnN0IGRldGFpbHMgPSBtYW5hZ2VyLmRldGFpbHMoKTtcbiAgICAgICAgaWYgKCFkZXRhaWxzKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGRldGFpbHMudmFyaWFibGVzLnNpemUgPT09IDApIHtcbiAgICAgICAgICAgIG1hbmFnZXIucmVuZGVyKGZpbHRlciwgdmFyaWFibGVzLCBnZXRJZ25vcmVJbWFnZUFuYWx5c2lzU2VsZWN0b3JzKCkpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdXBkYXRlVmFyaWFibGVzKGRldGFpbHMudmFyaWFibGVzKTtcbiAgICAgICAgICAgIHRocm90dGxlZFJlbmRlckFsbFN0eWxlcygpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgbWFuYWdlciA9IG1hbmFnZVN0eWxlKGVsZW1lbnQsIHt1cGRhdGUsIGxvYWRpbmdTdGFydCwgbG9hZGluZ0VuZH0pO1xuICAgIHN0eWxlTWFuYWdlcnMuc2V0KGVsZW1lbnQsIG1hbmFnZXIpO1xuXG4gICAgcmV0dXJuIG1hbmFnZXI7XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZVZhcmlhYmxlcyhuZXdWYXJzOiBNYXA8c3RyaW5nLCBzdHJpbmc+KSB7XG4gICAgaWYgKG5ld1ZhcnMuc2l6ZSA9PT0gMCkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIG5ld1ZhcnMuZm9yRWFjaCgodmFsdWUsIGtleSkgPT4ge1xuICAgICAgICB2YXJpYWJsZXMuc2V0KGtleSwgdmFsdWUpO1xuICAgIH0pO1xuICAgIHZhcmlhYmxlcy5mb3JFYWNoKCh2YWx1ZSwga2V5KSA9PiB7XG4gICAgICAgIHZhcmlhYmxlcy5zZXQoa2V5LCByZXBsYWNlQ1NTVmFyaWFibGVzKHZhbHVlLCB2YXJpYWJsZXMpKTtcbiAgICB9KTtcbn1cblxuZnVuY3Rpb24gcmVtb3ZlTWFuYWdlcihlbGVtZW50OiBTdHlsZUVsZW1lbnQpIHtcbiAgICBjb25zdCBtYW5hZ2VyID0gc3R5bGVNYW5hZ2Vycy5nZXQoZWxlbWVudCk7XG4gICAgaWYgKG1hbmFnZXIpIHtcbiAgICAgICAgbWFuYWdlci5kZXN0cm95KCk7XG4gICAgICAgIHN0eWxlTWFuYWdlcnMuZGVsZXRlKGVsZW1lbnQpO1xuICAgIH1cbn1cblxuY29uc3QgdGhyb3R0bGVkUmVuZGVyQWxsU3R5bGVzID0gdGhyb3R0bGUoKGNhbGxiYWNrPzogKCkgPT4gdm9pZCkgPT4ge1xuICAgIHN0eWxlTWFuYWdlcnMuZm9yRWFjaCgobWFuYWdlcikgPT4gbWFuYWdlci5yZW5kZXIoZmlsdGVyLCB2YXJpYWJsZXMsIGdldElnbm9yZUltYWdlQW5hbHlzaXNTZWxlY3RvcnMoKSkpO1xuICAgIGFkb3B0ZWRTdHlsZU1hbmFnZXJzLmZvckVhY2goKG1hbmFnZXIpID0+IG1hbmFnZXIucmVuZGVyKGZpbHRlciwgdmFyaWFibGVzLCBnZXRJZ25vcmVJbWFnZUFuYWx5c2lzU2VsZWN0b3JzKCkpKTtcbiAgICBjYWxsYmFjayAmJiBjYWxsYmFjaygpO1xufSk7XG5cbmNvbnN0IGNhbmNlbFJlbmRlcmluZyA9IGZ1bmN0aW9uICgpIHtcbiAgICB0aHJvdHRsZWRSZW5kZXJBbGxTdHlsZXMuY2FuY2VsKCk7XG59O1xuXG5mdW5jdGlvbiBvbkRPTVJlYWR5KCkge1xuICAgIGlmIChsb2FkaW5nU3R5bGVzLnNpemUgPT09IDApIHtcbiAgICAgICAgY2xlYW5GYWxsYmFja1N0eWxlKCk7XG4gICAgfVxufVxuXG5sZXQgZG9jdW1lbnRWaXNpYmlsaXR5TGlzdGVuZXI6ICgpID0+IHZvaWQgPSBudWxsO1xubGV0IGRpZERvY3VtZW50U2hvd1VwID0gIWRvY3VtZW50LmhpZGRlbjtcblxuZnVuY3Rpb24gd2F0Y2hGb3JEb2N1bWVudFZpc2liaWxpdHkoY2FsbGJhY2s6ICgpID0+IHZvaWQpIHtcbiAgICBjb25zdCBhbHJlYWR5V2F0Y2hpbmcgPSBCb29sZWFuKGRvY3VtZW50VmlzaWJpbGl0eUxpc3RlbmVyKTtcbiAgICBkb2N1bWVudFZpc2liaWxpdHlMaXN0ZW5lciA9ICgpID0+IHtcbiAgICAgICAgaWYgKCFkb2N1bWVudC5oaWRkZW4pIHtcbiAgICAgICAgICAgIHN0b3BXYXRjaGluZ0ZvckRvY3VtZW50VmlzaWJpbGl0eSgpO1xuICAgICAgICAgICAgY2FsbGJhY2soKTtcbiAgICAgICAgICAgIGRpZERvY3VtZW50U2hvd1VwID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH07XG4gICAgaWYgKCFhbHJlYWR5V2F0Y2hpbmcpIHtcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigndmlzaWJpbGl0eWNoYW5nZScsIGRvY3VtZW50VmlzaWJpbGl0eUxpc3RlbmVyKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHN0b3BXYXRjaGluZ0ZvckRvY3VtZW50VmlzaWJpbGl0eSgpIHtcbiAgICBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCd2aXNpYmlsaXR5Y2hhbmdlJywgZG9jdW1lbnRWaXNpYmlsaXR5TGlzdGVuZXIpO1xuICAgIGRvY3VtZW50VmlzaWJpbGl0eUxpc3RlbmVyID0gbnVsbDtcbn1cblxuZnVuY3Rpb24gY3JlYXRlVGhlbWVBbmRXYXRjaEZvclVwZGF0ZXMoKSB7XG4gICAgY3JlYXRlU3RhdGljU3R5bGVPdmVycmlkZXMoKTtcblxuICAgIGZ1bmN0aW9uIHJ1bkR5bmFtaWNTdHlsZSgpIHtcbiAgICAgICAgY3JlYXRlRHluYW1pY1N0eWxlT3ZlcnJpZGVzKCk7XG4gICAgICAgIHdhdGNoRm9yVXBkYXRlcygpO1xuICAgIH1cblxuICAgIGlmIChkb2N1bWVudC5oaWRkZW4pIHtcbiAgICAgICAgd2F0Y2hGb3JEb2N1bWVudFZpc2liaWxpdHkocnVuRHluYW1pY1N0eWxlKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBydW5EeW5hbWljU3R5bGUoKTtcbiAgICB9XG5cbiAgICBjaGFuZ2VNZXRhVGhlbWVDb2xvcldoZW5BdmFpbGFibGUoZmlsdGVyKTtcbn1cblxuZnVuY3Rpb24gaGFuZGxlQWRvcHRlZFN0eWxlU2hlZXRzKG5vZGU6IFNoYWRvd1Jvb3QgfCBEb2N1bWVudCkge1xuICAgIGlmIChBcnJheS5pc0FycmF5KG5vZGUuYWRvcHRlZFN0eWxlU2hlZXRzKSkge1xuICAgICAgICBpZiAobm9kZS5hZG9wdGVkU3R5bGVTaGVldHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgY29uc3QgbmV3TWFuZ2VyID0gY3JlYXRlQWRvcHRlZFN0eWxlU2hlZXRPdmVycmlkZShub2RlKTtcblxuICAgICAgICAgICAgYWRvcHRlZFN0eWxlTWFuYWdlcnMucHVzaChuZXdNYW5nZXIpO1xuICAgICAgICAgICAgbmV3TWFuZ2VyLnJlbmRlcihmaWx0ZXIsIHZhcmlhYmxlcywgZ2V0SWdub3JlSW1hZ2VBbmFseXNpc1NlbGVjdG9ycygpKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuZnVuY3Rpb24gd2F0Y2hGb3JVcGRhdGVzKCkge1xuICAgIGNvbnN0IG1hbmFnZWRTdHlsZXMgPSBBcnJheS5mcm9tKHN0eWxlTWFuYWdlcnMua2V5cygpKTtcbiAgICB3YXRjaEZvclN0eWxlQ2hhbmdlcyhtYW5hZ2VkU3R5bGVzLCAoe2NyZWF0ZWQsIHVwZGF0ZWQsIHJlbW92ZWQsIG1vdmVkfSkgPT4ge1xuICAgICAgICBjb25zdCBzdHlsZXNUb1JlbW92ZSA9IHJlbW92ZWQ7XG4gICAgICAgIGNvbnN0IHN0eWxlc1RvTWFuYWdlID0gY3JlYXRlZC5jb25jYXQodXBkYXRlZCkuY29uY2F0KG1vdmVkKVxuICAgICAgICAgICAgLmZpbHRlcigoc3R5bGUpID0+ICFzdHlsZU1hbmFnZXJzLmhhcyhzdHlsZSkpO1xuICAgICAgICBjb25zdCBzdHlsZXNUb1Jlc3RvcmUgPSBtb3ZlZFxuICAgICAgICAgICAgLmZpbHRlcigoc3R5bGUpID0+IHN0eWxlTWFuYWdlcnMuaGFzKHN0eWxlKSk7XG4gICAgICAgIHN0eWxlc1RvUmVtb3ZlLmZvckVhY2goKHN0eWxlKSA9PiByZW1vdmVNYW5hZ2VyKHN0eWxlKSk7XG4gICAgICAgIGNvbnN0IG5ld01hbmFnZXJzID0gc3R5bGVzVG9NYW5hZ2VcbiAgICAgICAgICAgIC5tYXAoKHN0eWxlKSA9PiBjcmVhdGVNYW5hZ2VyKHN0eWxlKSk7XG4gICAgICAgIGNvbnN0IG5ld1ZhcmlhYmxlcyA9IG5ld01hbmFnZXJzXG4gICAgICAgICAgICAubWFwKChtYW5hZ2VyKSA9PiBtYW5hZ2VyLmRldGFpbHMoKSlcbiAgICAgICAgICAgIC5maWx0ZXIoKGRldGFpbHMpID0+IGRldGFpbHMgJiYgZGV0YWlscy52YXJpYWJsZXMuc2l6ZSA+IDApXG4gICAgICAgICAgICAubWFwKCh7dmFyaWFibGVzfSkgPT4gdmFyaWFibGVzKTtcbiAgICAgICAgaWYgKG5ld1ZhcmlhYmxlcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIG5ld01hbmFnZXJzLmZvckVhY2goKG1hbmFnZXIpID0+IG1hbmFnZXIucmVuZGVyKGZpbHRlciwgdmFyaWFibGVzLCBnZXRJZ25vcmVJbWFnZUFuYWx5c2lzU2VsZWN0b3JzKCkpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIG5ld1ZhcmlhYmxlcy5mb3JFYWNoKCh2YXJpYWJsZXMpID0+IHVwZGF0ZVZhcmlhYmxlcyh2YXJpYWJsZXMpKTtcbiAgICAgICAgICAgIHRocm90dGxlZFJlbmRlckFsbFN0eWxlcygpO1xuICAgICAgICB9XG4gICAgICAgIG5ld01hbmFnZXJzLmZvckVhY2goKG1hbmFnZXIpID0+IG1hbmFnZXIud2F0Y2goKSk7XG4gICAgICAgIHN0eWxlc1RvUmVzdG9yZS5mb3JFYWNoKChzdHlsZSkgPT4gc3R5bGVNYW5hZ2Vycy5nZXQoc3R5bGUpLnJlc3RvcmUoKSk7XG4gICAgfSwgKHNoYWRvd1Jvb3QpID0+IHtcbiAgICAgICAgaGFuZGxlQWRvcHRlZFN0eWxlU2hlZXRzKHNoYWRvd1Jvb3QpO1xuICAgIH0pO1xuXG4gICAgY29uc3QgaWdub3JlZElubGluZVNlbGVjdG9ycyA9IGZpeGVzICYmIEFycmF5LmlzQXJyYXkoZml4ZXMuaWdub3JlSW5saW5lU3R5bGUpID8gZml4ZXMuaWdub3JlSW5saW5lU3R5bGUgOiBbXTtcbiAgICB3YXRjaEZvcklubGluZVN0eWxlcygoZWxlbWVudCkgPT4ge1xuICAgICAgICBvdmVycmlkZUlubGluZVN0eWxlKGVsZW1lbnQsIGZpbHRlciwgaWdub3JlZElubGluZVNlbGVjdG9ycywgZ2V0SWdub3JlSW1hZ2VBbmFseXNpc1NlbGVjdG9ycygpKTtcbiAgICAgICAgaWYgKGVsZW1lbnQgPT09IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudCkge1xuICAgICAgICAgICAgY29uc3Qgcm9vdFZhcmlhYmxlcyA9IGdldEVsZW1lbnRDU1NWYXJpYWJsZXMoZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50KTtcbiAgICAgICAgICAgIGlmIChyb290VmFyaWFibGVzLnNpemUgPiAwKSB7XG4gICAgICAgICAgICAgICAgdXBkYXRlVmFyaWFibGVzKHJvb3RWYXJpYWJsZXMpO1xuICAgICAgICAgICAgICAgIHRocm90dGxlZFJlbmRlckFsbFN0eWxlcygpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSwgKHJvb3QpID0+IHtcbiAgICAgICAgY29uc3QgaW5saW5lU3R5bGVFbGVtZW50cyA9IHJvb3QucXVlcnlTZWxlY3RvckFsbChJTkxJTkVfU1RZTEVfU0VMRUNUT1IpO1xuICAgICAgICBpZiAoaW5saW5lU3R5bGVFbGVtZW50cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBjcmVhdGVTaGFkb3dTdGF0aWNTdHlsZU92ZXJyaWRlcyhyb290KTtcbiAgICAgICAgICAgIGZvckVhY2goaW5saW5lU3R5bGVFbGVtZW50cywgKGVsKSA9PiBvdmVycmlkZUlubGluZVN0eWxlKGVsIGFzIEhUTUxFbGVtZW50LCBmaWx0ZXIsIGdldElnbm9yZUltYWdlQW5hbHlzaXNTZWxlY3RvcnMoKSwgaWdub3JlZElubGluZVNlbGVjdG9ycykpO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICBhZGRET01SZWFkeUxpc3RlbmVyKG9uRE9NUmVhZHkpO1xufVxuXG5mdW5jdGlvbiBzdG9wV2F0Y2hpbmdGb3JVcGRhdGVzKCkge1xuICAgIHN0eWxlTWFuYWdlcnMuZm9yRWFjaCgobWFuYWdlcikgPT4gbWFuYWdlci5wYXVzZSgpKTtcbiAgICBzdG9wU3R5bGVQb3NpdGlvbldhdGNoZXJzKCk7XG4gICAgc3RvcFdhdGNoaW5nRm9yU3R5bGVDaGFuZ2VzKCk7XG4gICAgc3RvcFdhdGNoaW5nRm9ySW5saW5lU3R5bGVzKCk7XG4gICAgcmVtb3ZlRE9NUmVhZHlMaXN0ZW5lcihvbkRPTVJlYWR5KTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlRGFya1JlYWRlckluc3RhbmNlTWFya2VyKCkge1xuICAgIGNvbnN0IG1ldGFFbGVtZW50OiBIVE1MTWV0YUVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdtZXRhJyk7XG4gICAgbWV0YUVsZW1lbnQubmFtZSA9ICdkYXJrcmVhZGVyJztcbiAgICBtZXRhRWxlbWVudC5jb250ZW50ID0gSU5TVEFOQ0VfSUQ7XG4gICAgZG9jdW1lbnQuaGVhZC5hcHBlbmRDaGlsZChtZXRhRWxlbWVudCk7XG59XG5cbmZ1bmN0aW9uIGlzQW5vdGhlckRhcmtSZWFkZXJJbnN0YW5jZUFjdGl2ZSgpIHtcbiAgICBjb25zdCBtZXRhOiBIVE1MTWV0YUVsZW1lbnQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdtZXRhW25hbWU9XCJkYXJrcmVhZGVyXCJdJyk7XG4gICAgaWYgKG1ldGEpIHtcbiAgICAgICAgaWYgKG1ldGEuY29udGVudCAhPT0gSU5TVEFOQ0VfSUQpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBjcmVhdGVEYXJrUmVhZGVySW5zdGFuY2VNYXJrZXIoKTtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZU9yVXBkYXRlRHluYW1pY1RoZW1lKGZpbHRlckNvbmZpZzogRmlsdGVyQ29uZmlnLCBkeW5hbWljVGhlbWVGaXhlczogRHluYW1pY1RoZW1lRml4LCBpZnJhbWU6IGJvb2xlYW4pIHtcbiAgICBmaWx0ZXIgPSBmaWx0ZXJDb25maWc7XG4gICAgZml4ZXMgPSBkeW5hbWljVGhlbWVGaXhlcztcbiAgICBpc0lGcmFtZSA9IGlmcmFtZTtcbiAgICBpZiAoZG9jdW1lbnQuaGVhZCkge1xuICAgICAgICBpZiAoaXNBbm90aGVyRGFya1JlYWRlckluc3RhbmNlQWN0aXZlKCkpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBjcmVhdGVUaGVtZUFuZFdhdGNoRm9yVXBkYXRlcygpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIGlmICghaXNGaXJlZm94KCkpIHtcbiAgICAgICAgICAgIGNvbnN0IGZhbGxiYWNrU3R5bGUgPSBjcmVhdGVPclVwZGF0ZVN0eWxlKCdkYXJrcmVhZGVyLS1mYWxsYmFjaycpO1xuICAgICAgICAgICAgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LmFwcGVuZENoaWxkKGZhbGxiYWNrU3R5bGUpO1xuICAgICAgICAgICAgZmFsbGJhY2tTdHlsZS50ZXh0Q29udGVudCA9IGdldE1vZGlmaWVkRmFsbGJhY2tTdHlsZShmaWx0ZXIsIHtzdHJpY3Q6IHRydWV9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGhlYWRPYnNlcnZlciA9IG5ldyBNdXRhdGlvbk9ic2VydmVyKCgpID0+IHtcbiAgICAgICAgICAgIGlmIChkb2N1bWVudC5oZWFkKSB7XG4gICAgICAgICAgICAgICAgaGVhZE9ic2VydmVyLmRpc2Nvbm5lY3QoKTtcbiAgICAgICAgICAgICAgICBpZiAoaXNBbm90aGVyRGFya1JlYWRlckluc3RhbmNlQWN0aXZlKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVtb3ZlRHluYW1pY1RoZW1lKCk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY3JlYXRlVGhlbWVBbmRXYXRjaEZvclVwZGF0ZXMoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIGhlYWRPYnNlcnZlci5vYnNlcnZlKGRvY3VtZW50LCB7Y2hpbGRMaXN0OiB0cnVlLCBzdWJ0cmVlOiB0cnVlfSk7XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVtb3ZlRHluYW1pY1RoZW1lKCkge1xuICAgIGNsZWFuRHluYW1pY1RoZW1lQ2FjaGUoKTtcbiAgICByZW1vdmVOb2RlKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5kYXJrcmVhZGVyLS1mYWxsYmFjaycpKTtcbiAgICBpZiAoZG9jdW1lbnQuaGVhZCkge1xuICAgICAgICByZXN0b3JlTWV0YVRoZW1lQ29sb3IoKTtcbiAgICAgICAgcmVtb3ZlTm9kZShkb2N1bWVudC5oZWFkLnF1ZXJ5U2VsZWN0b3IoJy5kYXJrcmVhZGVyLS11c2VyLWFnZW50JykpO1xuICAgICAgICByZW1vdmVOb2RlKGRvY3VtZW50LmhlYWQucXVlcnlTZWxlY3RvcignLmRhcmtyZWFkZXItLXRleHQnKSk7XG4gICAgICAgIHJlbW92ZU5vZGUoZG9jdW1lbnQuaGVhZC5xdWVyeVNlbGVjdG9yKCcuZGFya3JlYWRlci0taW52ZXJ0JykpO1xuICAgICAgICByZW1vdmVOb2RlKGRvY3VtZW50LmhlYWQucXVlcnlTZWxlY3RvcignLmRhcmtyZWFkZXItLWlubGluZScpKTtcbiAgICAgICAgcmVtb3ZlTm9kZShkb2N1bWVudC5oZWFkLnF1ZXJ5U2VsZWN0b3IoJy5kYXJrcmVhZGVyLS1vdmVycmlkZScpKTtcbiAgICAgICAgcmVtb3ZlTm9kZShkb2N1bWVudC5oZWFkLnF1ZXJ5U2VsZWN0b3IoJ21ldGFbbmFtZT1cImRhcmtyZWFkZXJcIl0nKSk7XG4gICAgfVxuICAgIHNoYWRvd1Jvb3RzV2l0aE92ZXJyaWRlcy5mb3JFYWNoKChyb290KSA9PiB7XG4gICAgICAgIHJlbW92ZU5vZGUocm9vdC5xdWVyeVNlbGVjdG9yKCcuZGFya3JlYWRlci0taW5saW5lJykpO1xuICAgIH0pO1xuICAgIHNoYWRvd1Jvb3RzV2l0aE92ZXJyaWRlcy5jbGVhcigpO1xuICAgIGZvckVhY2goc3R5bGVNYW5hZ2Vycy5rZXlzKCksIChlbCkgPT4gcmVtb3ZlTWFuYWdlcihlbCkpO1xuICAgIGZvckVhY2goZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLmRhcmtyZWFkZXInKSwgcmVtb3ZlTm9kZSk7XG5cbiAgICBhZG9wdGVkU3R5bGVNYW5hZ2Vycy5mb3JFYWNoKChtYW5hZ2VyKSA9PiB7XG4gICAgICAgIG1hbmFnZXIuZGVzdHJveSgpO1xuICAgIH0pO1xuICAgIGFkb3B0ZWRTdHlsZU1hbmFnZXJzLnNwbGljZSgwKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNsZWFuRHluYW1pY1RoZW1lQ2FjaGUoKSB7XG4gICAgc3RvcFdhdGNoaW5nRm9yRG9jdW1lbnRWaXNpYmlsaXR5KCk7XG4gICAgY2FuY2VsUmVuZGVyaW5nKCk7XG4gICAgc3RvcFdhdGNoaW5nRm9yVXBkYXRlcygpO1xuICAgIGNsZWFuTW9kaWZpY2F0aW9uQ2FjaGUoKTtcbn1cbiIsImV4cG9ydCBmdW5jdGlvbiB3YXRjaEZvckNvbG9yU2NoZW1lQ2hhbmdlKGNhbGxiYWNrOiAoe2lzRGFya30pID0+IHZvaWQpIHtcbiAgICBjb25zdCBxdWVyeSA9IHdpbmRvdy5tYXRjaE1lZGlhKCcocHJlZmVycy1jb2xvci1zY2hlbWU6IGRhcmspJyk7XG4gICAgY29uc3Qgb25DaGFuZ2UgPSAoKSA9PiBjYWxsYmFjayh7aXNEYXJrOiBxdWVyeS5tYXRjaGVzfSk7XG4gICAgcXVlcnkuYWRkTGlzdGVuZXIob25DaGFuZ2UpO1xuICAgIHJldHVybiB7XG4gICAgICAgIGRpc2Nvbm5lY3QoKSB7XG4gICAgICAgICAgICBxdWVyeS5yZW1vdmVMaXN0ZW5lcihvbkNoYW5nZSk7XG4gICAgICAgIH0sXG4gICAgfTtcbn1cbiIsImltcG9ydCB7Zm9yRWFjaH0gZnJvbSAnLi4vLi4vdXRpbHMvYXJyYXknO1xuaW1wb3J0IHtsb2FkQXNEYXRhVVJMfSBmcm9tICcuLi8uLi91dGlscy9uZXR3b3JrJztcbmltcG9ydCB7Z2V0TWF0Y2hlcywgZm9ybWF0Q1NTfSBmcm9tICcuLi8uLi91dGlscy90ZXh0JztcblxuY29uc3QgYmxvYlJlZ2V4ID0gL3VybFxcKFxcXCIoYmxvYlxcOi4qPylcXFwiXFwpL2c7XG5cbmFzeW5jIGZ1bmN0aW9uIHJlcGxhY2VCbG9icyh0ZXh0OiBzdHJpbmcpIHtcbiAgICBjb25zdCBwcm9taXNlcyA9IFtdO1xuICAgIGdldE1hdGNoZXMoYmxvYlJlZ2V4LCB0ZXh0LCAxKS5mb3JFYWNoKCh1cmwpID0+IHtcbiAgICAgICAgY29uc3QgcHJvbWlzZSA9IGxvYWRBc0RhdGFVUkwodXJsKTtcbiAgICAgICAgcHJvbWlzZXMucHVzaChwcm9taXNlKTtcbiAgICB9KTtcbiAgICBjb25zdCBkYXRhID0gYXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuICAgIHJldHVybiB0ZXh0LnJlcGxhY2UoYmxvYlJlZ2V4LCAoKSA9PiBgdXJsKFwiJHtkYXRhLnNoaWZ0KCl9XCIpYCk7XG59XG5cbmNvbnN0IGJhbm5lciA9IGAvKlxuICAgICAgICAgICAgICAgICAgICAgICAgX19fX19fX1xuICAgICAgICAgICAgICAgICAgICAgICAvICAgICAgIFxcXFxcbiAgICAgICAgICAgICAgICAgICAgICAuPT0uICAgIC49PS5cbiAgICAgICAgICAgICAgICAgICAgICgoICApKT09KCggICkpXG4gICAgICAgICAgICAgICAgICAgIC8gXCI9PVwiICAgIFwiPT1cIlxcXFxcbiAgICAgICAgICAgICAgICAgICAvX19fX3x8IHx8IHx8X19fXFxcXFxuICAgICAgIF9fX19fX19fICAgICBfX19fICAgIF9fX19fX19fICBfX18gICAgX19fXG4gICAgICAgfCAgX19fICBcXFxcICAgLyAgICBcXFxcICAgfCAgX19fICBcXFxcIHwgIHwgIC8gIC9cbiAgICAgICB8ICB8ICBcXFxcICBcXFxcIC8gIC9cXFxcICBcXFxcICB8ICB8ICBcXFxcICBcXFxcfCAgfF8vICAvXG4gICAgICAgfCAgfCAgICkgIC8gIC9fX1xcXFwgIFxcXFwgfCAgfF9fLyAgL3wgIF9fXyAgXFxcXFxuICAgICAgIHwgIHxfXy8gIC8gIF9fX19fXyAgXFxcXHwgIF9fX18gIFxcXFx8ICB8ICBcXFxcICBcXFxcXG5fX19fX19ffF9fX19fX18vX18vIF9fX18gXFxcXF9fXFxcXF9ffF9fX1xcXFxfX1xcXFxfX3xfX19cXFxcX19cXFxcX19fX1xufCAgX19fICBcXFxcIHwgIF9fX18vIC8gICAgXFxcXCAgIHwgIF9fXyAgXFxcXCB8ICBfX19ffCAgX19fICBcXFxcXG58ICB8ICBcXFxcICBcXFxcfCAgfF9fXyAvICAvXFxcXCAgXFxcXCAgfCAgfCAgXFxcXCAgXFxcXHwgIHxfX198ICB8ICBcXFxcICBcXFxcXG58ICB8X18vICAvfCAgX19fXy8gIC9fX1xcXFwgIFxcXFwgfCAgfCAgICkgIHwgIF9fX198ICB8X18vICAvXG58ICBfX19fICBcXFxcfCAgfF9fLyAgX19fX19fICBcXFxcfCAgfF9fLyAgL3wgIHxfX198ICBfX19fICBcXFxcXG58X198ICAgXFxcXF9fXFxcXF9fX18vX18vICAgICAgXFxcXF9fXFxcXF9fX19fX18vIHxfX19fX198X198ICAgXFxcXF9fXFxcXFxuICAgICAgICAgICAgICAgIGh0dHBzOi8vZGFya3JlYWRlci5vcmdcbiovYDtcblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNvbGxlY3RDU1MoKSB7XG4gICAgY29uc3QgY3NzID0gW2Jhbm5lcl07XG5cbiAgICBmdW5jdGlvbiBhZGRTdGF0aWNDU1Moc2VsZWN0b3I6IHN0cmluZywgY29tbWVudDogc3RyaW5nKSB7XG4gICAgICAgIGNvbnN0IHN0YXRpY1N0eWxlID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XG4gICAgICAgIGlmIChzdGF0aWNTdHlsZSAmJiBzdGF0aWNTdHlsZS50ZXh0Q29udGVudCkge1xuICAgICAgICAgICAgY3NzLnB1c2goYC8qICR7Y29tbWVudH0gKi9gKTtcbiAgICAgICAgICAgIGNzcy5wdXNoKHN0YXRpY1N0eWxlLnRleHRDb250ZW50KTtcbiAgICAgICAgICAgIGNzcy5wdXNoKCcnKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGFkZFN0YXRpY0NTUygnLmRhcmtyZWFkZXItLWZhbGxiYWNrJywgJ0ZhbGxiYWNrIFN0eWxlJyk7XG4gICAgYWRkU3RhdGljQ1NTKCcuZGFya3JlYWRlci0tdXNlci1hZ2VudCcsICdVc2VyLUFnZW50IFN0eWxlJyk7XG4gICAgYWRkU3RhdGljQ1NTKCcuZGFya3JlYWRlci0tdGV4dCcsICdUZXh0IFN0eWxlJyk7XG4gICAgYWRkU3RhdGljQ1NTKCcuZGFya3JlYWRlci0taW52ZXJ0JywgJ0ludmVydCBTdHlsZScpO1xuICAgIGFkZFN0YXRpY0NTUygnLmRhcmtyZWFkZXItLW92ZXJyaWRlJywgJ092ZXJyaWRlIFN0eWxlJyk7XG4gICAgYWRkU3RhdGljQ1NTKCcuZGFya3JlYWRlci0tdmFyaWFibGVzJywgJ1ZhcmlhYmxlcyBTdHlsZScpO1xuXG4gICAgY29uc3QgbW9kaWZpZWRDU1MgPSBbXTtcbiAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcuZGFya3JlYWRlci0tc3luYycpLmZvckVhY2goKGVsZW1lbnQ6IEhUTUxTdHlsZUVsZW1lbnQpID0+IHtcbiAgICAgICAgZm9yRWFjaChlbGVtZW50LnNoZWV0LmNzc1J1bGVzLCAocnVsZSkgPT4ge1xuICAgICAgICAgICAgcnVsZSAmJiBydWxlLmNzc1RleHQgJiYgbW9kaWZpZWRDU1MucHVzaChydWxlLmNzc1RleHQpO1xuICAgICAgICB9KTtcbiAgICB9KTtcblxuICAgIGlmIChtb2RpZmllZENTUy5sZW5ndGggIT0gMCkge1xuICAgICAgICBjb25zdCBmb3JtYXR0ZWRDU1MgPSBmb3JtYXRDU1MobW9kaWZpZWRDU1Muam9pbignXFxuJykpO1xuICAgICAgICBjc3MucHVzaCgnLyogTW9kaWZpZWQgQ1NTICovJyk7XG4gICAgICAgIGNzcy5wdXNoKGF3YWl0IHJlcGxhY2VCbG9icyhmb3JtYXR0ZWRDU1MpKTtcbiAgICAgICAgY3NzLnB1c2goJycpO1xuICAgIH1cblxuICAgIHJldHVybiBjc3Muam9pbignXFxuJyk7XG59XG4iLCJpbXBvcnQge2NyZWF0ZU9yVXBkYXRlU3R5bGUsIHJlbW92ZVN0eWxlfSBmcm9tICcuL3N0eWxlJztcbmltcG9ydCB7Y3JlYXRlT3JVcGRhdGVTVkdGaWx0ZXIsIHJlbW92ZVNWR0ZpbHRlcn0gZnJvbSAnLi9zdmctZmlsdGVyJztcbmltcG9ydCB7Y3JlYXRlT3JVcGRhdGVEeW5hbWljVGhlbWUsIHJlbW92ZUR5bmFtaWNUaGVtZSwgY2xlYW5EeW5hbWljVGhlbWVDYWNoZX0gZnJvbSAnLi9keW5hbWljLXRoZW1lJztcbmltcG9ydCB7bG9nSW5mbywgbG9nV2Fybn0gZnJvbSAnLi91dGlscy9sb2cnO1xuaW1wb3J0IHt3YXRjaEZvckNvbG9yU2NoZW1lQ2hhbmdlfSBmcm9tICcuL3V0aWxzL3dhdGNoLWNvbG9yLXNjaGVtZSc7XG5pbXBvcnQge2NvbGxlY3RDU1N9IGZyb20gJy4vZHluYW1pYy10aGVtZS9jc3MtY29sbGVjdGlvbic7XG5cbmZ1bmN0aW9uIG9uTWVzc2FnZSh7dHlwZSwgZGF0YX0pIHtcbiAgICBzd2l0Y2ggKHR5cGUpIHtcbiAgICAgICAgY2FzZSAnYWRkLWNzcy1maWx0ZXInOlxuICAgICAgICBjYXNlICdhZGQtc3RhdGljLXRoZW1lJzoge1xuICAgICAgICAgICAgY29uc3QgY3NzID0gZGF0YTtcbiAgICAgICAgICAgIHJlbW92ZUR5bmFtaWNUaGVtZSgpO1xuICAgICAgICAgICAgY3JlYXRlT3JVcGRhdGVTdHlsZShjc3MpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgY2FzZSAnYWRkLXN2Zy1maWx0ZXInOiB7XG4gICAgICAgICAgICBjb25zdCB7Y3NzLCBzdmdNYXRyaXgsIHN2Z1JldmVyc2VNYXRyaXh9ID0gZGF0YTtcbiAgICAgICAgICAgIHJlbW92ZUR5bmFtaWNUaGVtZSgpO1xuICAgICAgICAgICAgY3JlYXRlT3JVcGRhdGVTVkdGaWx0ZXIoc3ZnTWF0cml4LCBzdmdSZXZlcnNlTWF0cml4KTtcbiAgICAgICAgICAgIGNyZWF0ZU9yVXBkYXRlU3R5bGUoY3NzKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGNhc2UgJ2FkZC1keW5hbWljLXRoZW1lJzoge1xuICAgICAgICAgICAgY29uc3Qge2ZpbHRlciwgZml4ZXMsIGlzSUZyYW1lfSA9IGRhdGE7XG4gICAgICAgICAgICByZW1vdmVTdHlsZSgpO1xuICAgICAgICAgICAgY3JlYXRlT3JVcGRhdGVEeW5hbWljVGhlbWUoZmlsdGVyLCBmaXhlcywgaXNJRnJhbWUpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgY2FzZSAnZXhwb3J0LWNzcyc6IHtcbiAgICAgICAgICAgIGNvbGxlY3RDU1MoKS50aGVuKChjb2xsZWN0ZWRDU1MpID0+IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHt0eXBlOiAnZXhwb3J0LWNzcy1yZXNwb25zZScsIGRhdGE6IGNvbGxlY3RlZENTU30pKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGNhc2UgJ3Vuc3VwcG9ydGVkLXNlbmRlcic6XG4gICAgICAgIGNhc2UgJ2NsZWFuLXVwJzoge1xuICAgICAgICAgICAgcmVtb3ZlU3R5bGUoKTtcbiAgICAgICAgICAgIHJlbW92ZVNWR0ZpbHRlcigpO1xuICAgICAgICAgICAgcmVtb3ZlRHluYW1pY1RoZW1lKCk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgIH1cbn1cblxuLy8gVE9ETzogVXNlIGJhY2tncm91bmQgcGFnZSBjb2xvciBzY2hlbWUgd2F0Y2hlciB3aGVuIGJyb3dzZXIgYnVncyBmaXhlZC5cbmNvbnN0IGNvbG9yU2NoZW1lV2F0Y2hlciA9IHdhdGNoRm9yQ29sb3JTY2hlbWVDaGFuZ2UoKHtpc0Rhcmt9KSA9PiB7XG4gICAgbG9nSW5mbygnTWVkaWEgcXVlcnkgd2FzIGNoYW5nZWQnKTtcbiAgICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7dHlwZTogJ2NvbG9yLXNjaGVtZS1jaGFuZ2UnLCBkYXRhOiB7aXNEYXJrfX0pO1xufSk7XG5cbmNvbnN0IHBvcnQgPSBjaHJvbWUucnVudGltZS5jb25uZWN0KHtuYW1lOiAndGFiJ30pO1xucG9ydC5vbk1lc3NhZ2UuYWRkTGlzdGVuZXIob25NZXNzYWdlKTtcbnBvcnQub25EaXNjb25uZWN0LmFkZExpc3RlbmVyKCgpID0+IHtcbiAgICBsb2dXYXJuKCdkaXNjb25uZWN0Jyk7XG4gICAgY2xlYW5EeW5hbWljVGhlbWVDYWNoZSgpO1xuICAgIGNvbG9yU2NoZW1lV2F0Y2hlci5kaXNjb25uZWN0KCk7XG59KTtcbiJdLCJuYW1lcyI6WyJjb2xvclBhcnNlQ2FjaGUiLCJ0aGVtZUNhY2hlS2V5cyIsImNyZWF0ZU9yVXBkYXRlU3R5bGUiXSwibWFwcGluZ3MiOiI7OzthQUdnQixPQUFPLENBQUMsR0FBRyxJQUFJO1NBQ2xCLE9BQU8sQ0FBQyxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQztJQUNuQyxDQUFDO2FBRWUsT0FBTyxDQUFDLEdBQUcsSUFBSTtTQUNsQixPQUFPLENBQUMsSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUM7SUFDbkM7O2FDVGdCLFFBQVEsQ0FBbUMsUUFBVztRQUNsRSxJQUFJLE9BQU8sR0FBRyxLQUFLLENBQUM7UUFDcEIsSUFBSSxPQUFPLEdBQVcsSUFBSSxDQUFDO1FBQzNCLElBQUksUUFBZSxDQUFDO1FBRXBCLE1BQU0sU0FBUyxJQUFPLENBQUMsR0FBRyxJQUFXO1lBQ2pDLFFBQVEsR0FBRyxJQUFJLENBQUM7WUFDaEIsSUFBSSxPQUFPLEVBQUU7Z0JBQ1QsT0FB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
