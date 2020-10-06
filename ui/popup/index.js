(function () {
    'use strict'
    function m(tagOrComponent, props, ...children) {
        props = props || {}
        if (typeof tagOrComponent === 'string') {
            const tag = tagOrComponent
            return { type: tag, props, children }
        }
        if (typeof tagOrComponent === 'function') {
            const component = tagOrComponent
            return { type: component, props, children }
        }
        throw new Error('Unsupported spec type')
    }
    function createPluginsStore() {
        const plugins = []
        return {
            add(plugin) {
                plugins.push(plugin)
                return this
            },
            apply(props) {
                let result
                let plugin
                const usedPlugins = new Set()
                for (let i = plugins.length - 1;i >= 0;i--) {
                    plugin = plugins[i]
                    if (usedPlugins.has(plugin)) {
                        continue
                    }
                    result = plugin(props)
                    if (result != null) {
                        return result
                    }
                    usedPlugins.add(plugin)
                }
                return null
            },
            delete(plugin) {
                for (let i = plugins.length - 1;i >= 0;i--) {
                    if (plugins[i] === plugin) {
                        plugins.splice(i, 1)
                        break
                    }
                }
                return this
            },
            empty() {
                return plugins.length === 0
            },
        }
    }
    function iterateComponentPlugins(type, pairs, iterator) {
        pairs
            .filter(([key]) => type[key])
            .forEach(([key, plugins]) => {
                return type[key].forEach((plugin) => iterator(plugins, plugin))
            })
    }
    function addComponentPlugins(type, pairs) {
        iterateComponentPlugins(type, pairs, (plugins, plugin) => plugins.add(plugin))
    }
    function deleteComponentPlugins(type, pairs) {
        iterateComponentPlugins(type, pairs, (plugins, plugin) => plugins.delete(plugin))
    }
    function createPluginsAPI(key) {
        const api = {
            add(type, plugin) {
                if (!type[key]) {
                    type[key] = []
                }
                type[key].push(plugin)
                return api
            },
        }
        return api
    }

    const XHTML_NS = 'http://www.w3.org/1999/xhtml'
    const SVG_NS = 'http://www.w3.org/2000/svg'
    const PLUGINS_CREATE_ELEMENT = Symbol()
    const pluginsCreateElement = createPluginsStore()
    function createElement(spec, parent) {
        const result = pluginsCreateElement.apply({ spec, parent })
        if (result) {
            return result
        }
        const tag = spec.type
        if (tag === 'svg') {
            return document.createElementNS(SVG_NS, 'svg')
        }
        const namespace = parent.namespaceURI
        if (namespace === XHTML_NS || namespace == null) {
            return document.createElement(tag)
        }
        return document.createElementNS(namespace, tag)
    }

    function classes(...args) {
        const classes = []
        args.filter((c) => Boolean(c)).forEach((c) => {
            if (typeof c === 'string') {
                classes.push(c)
            }
            else if (typeof c === 'object') {
                classes.push(...Object.keys(c).filter((key) => Boolean(c[key])))
            }
        })
        return classes.join(' ')
    }
    function setInlineCSSPropertyValue(element, prop, $value) {
        if ($value != null && $value !== '') {
            let value = String($value)
            let important = ''
            if (value.endsWith('!important')) {
                value = value.substring(0, value.length - 10)
                important = 'important'
            }
            element.style.setProperty(prop, value, important)
        }
        else {
            element.style.removeProperty(prop)
        }
    }

    function isObject(value) {
        return value != null && typeof value === 'object'
    }

    const eventListeners = new WeakMap()
    function addEventListener$1(element, event, listener) {
        let listeners
        if (eventListeners.has(element)) {
            listeners = eventListeners.get(element)
        }
        else {
            listeners = new Map()
            eventListeners.set(element, listeners)
        }
        if (listeners.get(event) !== listener) {
            if (listeners.has(event)) {
                element.removeEventListener(event, listeners.get(event))
            }
            element.addEventListener(event, listener)
            listeners.set(event, listener)
        }
    }
    function removeEventListener(element, event) {
        if (!eventListeners.has(element)) {
            return
        }
        const listeners = eventListeners.get(element)
        element.removeEventListener(event, listeners.get(event))
        listeners.delete(event)
    }

    function setClassObject(element, classObj) {
        const cls = Array.isArray(classObj)
            ? classes(...classObj)
            : classes(classObj)
        if (cls) {
            element.setAttribute('class', cls)
        }
        else {
            element.removeAttribute('class')
        }
    }
    function mergeValues(obj, old) {
        const values = new Map()
        const newProps = new Set(Object.keys(obj))
        const oldProps = Object.keys(old)
        oldProps
            .filter((prop) => !newProps.has(prop))
            .forEach((prop) => values.set(prop, null))
        newProps.forEach((prop) => values.set(prop, obj[prop]))
        return values
    }
    function setStyleObject(element, styleObj, prev) {
        let prevObj
        if (isObject(prev)) {
            prevObj = prev
        }
        else {
            prevObj = {}
            element.removeAttribute('style')
        }
        const declarations = mergeValues(styleObj, prevObj)
        declarations.forEach(($value, prop) => setInlineCSSPropertyValue(element, prop, $value))
    }
    function setEventListener(element, event, listener) {
        if (typeof listener === 'function') {
            addEventListener$1(element, event, listener)
        }
        else {
            removeEventListener(element, event)
        }
    }
    const specialAttrs = new Set([
        'key',
        'oncreate',
        'onupdate',
        'onrender',
        'onremove',
    ])
    const PLUGINS_SET_ATTRIBUTE = Symbol()
    const pluginsSetAttribute = createPluginsStore()
    function getPropertyValue(obj, prop) {
        return obj && obj.hasOwnProperty(prop) ? obj[prop] : null
    }
    function syncAttrs(element, attrs, prev) {
        const values = mergeValues(attrs, prev || {})
        values.forEach((value, attr) => {
            if (!pluginsSetAttribute.empty()) {
                const result = pluginsSetAttribute.apply({
                    element,
                    attr,
                    value,
                    get prev() {
                        return getPropertyValue(prev, attr)
                    },
                })
                if (result != null) {
                    return
                }
            }
            if (attr === 'class' && isObject(value)) {
                setClassObject(element, value)
            }
            else if (attr === 'style' && isObject(value)) {
                const prevValue = getPropertyValue(prev, attr)
                setStyleObject(element, value, prevValue)
            }
            else if (attr.startsWith('on')) {
                const event = attr.substring(2)
                setEventListener(element, event, value)
            }
            else if (specialAttrs.has(attr));
            else if (value == null || value === false) {
                element.removeAttribute(attr)
            }
            else {
                element.setAttribute(attr, value === true ? '' : String(value))
            }
        })
    }

    class LinkedList {
        constructor(...items) {
            this.nexts = new WeakMap()
            this.prevs = new WeakMap()
            this.first = null
            this.last = null
            items.forEach((item) => this.push(item))
        }
        empty() {
            return this.first == null
        }
        push(item) {
            if (this.empty()) {
                this.first = item
                this.last = item
            }
            else {
                this.nexts.set(this.last, item)
                this.prevs.set(item, this.last)
                this.last = item
            }
        }
        insertBefore(newItem, refItem) {
            const prev = this.before(refItem)
            this.prevs.set(newItem, prev)
            this.nexts.set(newItem, refItem)
            this.prevs.set(refItem, newItem)
            prev && this.nexts.set(prev, newItem)
            refItem === this.first && (this.first = newItem)
        }
        delete(item) {
            const prev = this.before(item)
            const next = this.after(item)
            prev && this.nexts.set(prev, next)
            next && this.prevs.set(next, prev)
            item === this.first && (this.first = next)
            item === this.last && (this.last = prev)
        }
        before(item) {
            return this.prevs.get(item) || null
        }
        after(item) {
            return this.nexts.get(item) || null
        }
        loop(iterator) {
            if (this.empty()) {
                return
            }
            let current = this.first
            do {
                if (iterator(current)) {
                    break
                }
            } while ((current = this.after(current)))
        }
        copy() {
            const list = new LinkedList()
            this.loop((item) => {
                list.push(item)
                return false
            })
            return list
        }
        forEach(iterator) {
            this.loop((item) => {
                iterator(item)
                return false
            })
        }
        find(iterator) {
            let result = null
            this.loop((item) => {
                if (iterator(item)) {
                    result = item
                    return true
                }
                return false
            })
            return result
        }
        map(iterator) {
            const results = []
            this.loop((item) => {
                results.push(iterator(item))
                return false
            })
            return results
        }
    }

    function matchChildren(vnode, old) {
        const oldChildren = old.children()
        const oldChildrenByKey = new Map()
        const oldChildrenWithoutKey = []
        oldChildren.forEach((v) => {
            const key = v.key()
            if (key == null) {
                oldChildrenWithoutKey.push(v)
            }
            else {
                oldChildrenByKey.set(key, v)
            }
        })
        const children = vnode.children()
        const matches = []
        const unmatched = new Set(oldChildren)
        const keys = new Set()
        children.forEach((v) => {
            let match = null
            let guess = null
            const key = v.key()
            if (key != null) {
                if (keys.has(key)) {
                    throw new Error('Duplicate key')
                }
                keys.add(key)
                if (oldChildrenByKey.has(key)) {
                    guess = oldChildrenByKey.get(key)
                }
            }
            else if (oldChildrenWithoutKey.length > 0) {
                guess = oldChildrenWithoutKey.shift()
            }
            if (v.matches(guess)) {
                match = guess
            }
            matches.push([v, match])
            if (match) {
                unmatched.delete(match)
            }
        })
        return { matches, unmatched }
    }

    function execute(vnode, old, vdom) {
        const didMatch = vnode && old && vnode.matches(old)
        if (didMatch && vnode.parent() === old.parent()) {
            vdom.replaceVNode(old, vnode)
        }
        else if (vnode) {
            vdom.addVNode(vnode)
        }
        const context = vdom.getVNodeContext(vnode)
        const oldContext = vdom.getVNodeContext(old)
        if (old && !didMatch) {
            old.detach(oldContext)
            old.children().forEach((v) => execute(null, v, vdom))
            old.detached(oldContext)
        }
        if (vnode && !didMatch) {
            vnode.attach(context)
            vnode.children().forEach((v) => execute(v, null, vdom))
            vnode.attached(context)
        }
        if (didMatch) {
            const result = vnode.update(old, context)
            if (result !== vdom.LEAVE) {
                const { matches, unmatched } = matchChildren(vnode, old)
                unmatched.forEach((v) => execute(null, v, vdom))
                matches.forEach(([v, o]) => execute(v, o, vdom))
                vnode.updated(context)
            }
        }
    }

    function isSpec(x) {
        return isObject(x) && x.type != null && x.nodeType == null
    }
    function isNodeSpec(x) {
        return isSpec(x) && typeof x.type === 'string'
    }
    function isComponentSpec(x) {
        return isSpec(x) && typeof x.type === 'function'
    }

    class VNodeBase {
        constructor(parent) {
            this.parentVNode = parent
        }
        key() {
            return null
        }
        parent(vnode) {
            if (vnode) {
                this.parentVNode = vnode
                return
            }
            return this.parentVNode
        }
        children() {
            return []
        }
        attach(context) { }
        detach(context) { }
        update(old, context) {
            return null
        }
        attached(context) { }
        detached(context) { }
        updated(context) { }
    }
    function nodeMatchesSpec(node, spec) {
        return node instanceof Element && spec.type === node.tagName.toLowerCase()
    }
    const refinedElements = new WeakMap()
    function markElementAsRefined(element, vdom) {
        let refined
        if (refinedElements.has(vdom)) {
            refined = refinedElements.get(vdom)
        }
        else {
            refined = new WeakSet()
            refinedElements.set(vdom, refined)
        }
        refined.add(element)
    }
    function isElementRefined(element, vdom) {
        return refinedElements.has(vdom) && refinedElements.get(vdom).has(element)
    }
    class ElementVNode extends VNodeBase {
        constructor(spec, parent) {
            super(parent)
            this.spec = spec
        }
        matches(other) {
            return (other instanceof ElementVNode && this.spec.type === other.spec.type)
        }
        key() {
            return this.spec.props.key
        }
        children() {
            return [this.child]
        }
        getExistingElement(context) {
            const parent = context.parent
            const existing = context.node
            let element
            if (nodeMatchesSpec(existing, this.spec)) {
                element = existing
            }
            else if (!isElementRefined(parent, context.vdom) &&
                context.vdom.isDOMNodeCaptured(parent)) {
                const sibling = context.sibling
                const guess = sibling
                    ? sibling.nextElementSibling
                    : parent.firstElementChild
                if (guess && !context.vdom.isDOMNodeCaptured(guess)) {
                    if (nodeMatchesSpec(guess, this.spec)) {
                        element = guess
                    }
                    else {
                        parent.removeChild(guess)
                    }
                }
            }
            return element
        }
        attach(context) {
            let element
            const existing = this.getExistingElement(context)
            if (existing) {
                element = existing
            }
            else {
                element = createElement(this.spec, context.parent)
                markElementAsRefined(element, context.vdom)
            }
            syncAttrs(element, this.spec.props, null)
            this.child = createDOMVNode(element, this.spec.children, this, false)
        }
        update(prev, context) {
            const prevContext = context.vdom.getVNodeContext(prev)
            const element = prevContext.node
            syncAttrs(element, this.spec.props, prev.spec.props)
            this.child = createDOMVNode(element, this.spec.children, this, false)
        }
        attached(context) {
            const { oncreate, onrender } = this.spec.props
            if (oncreate) {
                oncreate(context.node)
            }
            if (onrender) {
                onrender(context.node)
            }
        }
        detached(context) {
            const { onremove } = this.spec.props
            if (onremove) {
                onremove(context.node)
            }
        }
        updated(context) {
            const { onupdate, onrender } = this.spec.props
            if (onupdate) {
                onupdate(context.node)
            }
            if (onrender) {
                onrender(context.node)
            }
        }
    }
    const symbols = {
        CREATED: Symbol(),
        REMOVED: Symbol(),
        UPDATED: Symbol(),
        RENDERED: Symbol(),
        ACTIVE: Symbol(),
        DEFAULTS_ASSIGNED: Symbol(),
    }
    const domPlugins = [
        [PLUGINS_CREATE_ELEMENT, pluginsCreateElement],
        [PLUGINS_SET_ATTRIBUTE, pluginsSetAttribute],
    ]
    class ComponentVNode extends VNodeBase {
        constructor(spec, parent) {
            super(parent)
            this.lock = false
            this.spec = spec
            this.prev = null
            this.store = {}
            this.store[symbols.ACTIVE] = this
        }
        matches(other) {
            return (other instanceof ComponentVNode &&
                this.spec.type === other.spec.type)
        }
        key() {
            return this.spec.props.key
        }
        children() {
            return [this.child]
        }
        createContext(context) {
            const { parent } = context
            const { spec, prev, store } = this
            return {
                spec,
                prev,
                store,
                get node() {
                    return context.node
                },
                get nodes() {
                    return context.nodes
                },
                parent,
                onCreate: (fn) => (store[symbols.CREATED] = fn),
                onUpdate: (fn) => (store[symbols.UPDATED] = fn),
                onRemove: (fn) => (store[symbols.REMOVED] = fn),
                onRender: (fn) => (store[symbols.RENDERED] = fn),
                refresh: () => {
                    const activeVNode = store[symbols.ACTIVE]
                    activeVNode.refresh(context)
                },
                leave: () => context.vdom.LEAVE,
                getStore: (defaults) => {
                    if (defaults && !store[symbols.DEFAULTS_ASSIGNED]) {
                        Object.entries(defaults).forEach(([prop, value]) => {
                            store[prop] = value
                        })
                        store[symbols.DEFAULTS_ASSIGNED] = true
                    }
                    return store
                },
            }
        }
        unbox(context) {
            const Component = this.spec.type
            const props = this.spec.props
            const children = this.spec.children
            this.lock = true
            const prevContext = ComponentVNode.context
            ComponentVNode.context = this.createContext(context)
            let unboxed = null
            try {
                unboxed = Component(props, ...children)
            }
            finally {
                ComponentVNode.context = prevContext
                this.lock = false
            }
            return unboxed
        }
        refresh(context) {
            if (this.lock) {
                throw new Error('Calling refresh during unboxing causes infinite loop')
            }
            this.prev = this.spec
            const latestContext = context.vdom.getVNodeContext(this)
            const unboxed = this.unbox(latestContext)
            if (unboxed === context.vdom.LEAVE) {
                return
            }
            const prevChild = this.child
            this.child = createVNode(unboxed, this)
            context.vdom.execute(this.child, prevChild)
            this.updated(context)
        }
        addPlugins() {
            addComponentPlugins(this.spec.type, domPlugins)
        }
        deletePlugins() {
            deleteComponentPlugins(this.spec.type, domPlugins)
        }
        attach(context) {
            this.addPlugins()
            const unboxed = this.unbox(context)
            const childSpec = unboxed === context.vdom.LEAVE ? null : unboxed
            this.child = createVNode(childSpec, this)
        }
        update(prev, context) {
            this.store = prev.store
            this.prev = prev.spec
            this.store[symbols.ACTIVE] = this
            const prevContext = context.vdom.getVNodeContext(prev)
            this.addPlugins()
            const unboxed = this.unbox(prevContext)
            let result = null
            if (unboxed === context.vdom.LEAVE) {
                result = unboxed
                this.child = prev.child
                context.vdom.adoptVNode(this.child, this)
            }
            else {
                this.child = createVNode(unboxed, this)
            }
            return result
        }
        handle(event, context) {
            const fn = this.store[event]
            if (fn) {
                const nodes = context.nodes.length === 0 ? [null] : context.nodes
                fn(...nodes)
            }
        }
        attached(context) {
            this.deletePlugins()
            this.handle(symbols.CREATED, context)
            this.handle(symbols.RENDERED, context)
        }
        detached(context) {
            this.handle(symbols.REMOVED, context)
        }
        updated(context) {
            this.deletePlugins()
            this.handle(symbols.UPDATED, context)
            this.handle(symbols.RENDERED, context)
        }
    }
    ComponentVNode.context = null
    function getComponentContext() {
        return ComponentVNode.context
    }
    class TextVNode extends VNodeBase {
        constructor(text, parent) {
            super(parent)
            this.text = text
        }
        matches(other) {
            return other instanceof TextVNode
        }
        children() {
            return [this.child]
        }
        getExistingNode(context) {
            const { parent } = context
            let node
            if (context.node instanceof Text) {
                node = context.node
            }
            else if (!isElementRefined(parent, context.vdom) &&
                context.vdom.isDOMNodeCaptured(parent)) {
                const sibling = context.sibling
                const guess = sibling ? sibling.nextSibling : parent.firstChild
                if (guess &&
                    !context.vdom.isDOMNodeCaptured(guess) &&
                    guess instanceof Text) {
                    node = guess
                }
            }
            return node
        }
        attach(context) {
            const existing = this.getExistingNode(context)
            let node
            if (existing) {
                node = existing
                node.textContent = this.text
            }
            else {
                node = document.createTextNode(this.text)
            }
            this.child = createVNode(node, this)
        }
        update(prev, context) {
            const prevContext = context.vdom.getVNodeContext(prev)
            const { node } = prevContext
            if (this.text !== prev.text) {
                node.textContent = this.text
            }
            this.child = createVNode(node, this)
        }
    }
    class InlineFunctionVNode extends VNodeBase {
        constructor(fn, parent) {
            super(parent)
            this.fn = fn
        }
        matches(other) {
            return other instanceof InlineFunctionVNode
        }
        children() {
            return [this.child]
        }
        call(context) {
            const fn = this.fn
            const inlineFnContext = {
                parent: context.parent,
                get node() {
                    return context.node
                },
                get nodes() {
                    return context.nodes
                },
            }
            const result = fn(inlineFnContext)
            this.child = createVNode(result, this)
        }
        attach(context) {
            this.call(context)
        }
        update(prev, context) {
            const prevContext = context.vdom.getVNodeContext(prev)
            this.call(prevContext)
        }
    }
    class NullVNode extends VNodeBase {
        matches(other) {
            return other instanceof NullVNode
        }
    }
    class DOMVNode extends VNodeBase {
        constructor(node, childSpecs, parent, isNative) {
            super(parent)
            this.node = node
            this.childSpecs = childSpecs
            this.isNative = isNative
        }
        matches(other) {
            return other instanceof DOMVNode && this.node === other.node
        }
        wrap() {
            this.childVNodes = this.childSpecs.map((spec) => createVNode(spec, this))
        }
        insertNode(context) {
            const { parent, sibling } = context
            const shouldInsert = !(parent === this.node.parentElement &&
                sibling === this.node.previousSibling)
            if (shouldInsert) {
                const target = sibling ? sibling.nextSibling : parent.firstChild
                parent.insertBefore(this.node, target)
            }
        }
        attach(context) {
            this.wrap()
            this.insertNode(context)
        }
        detach(context) {
            context.parent.removeChild(this.node)
        }
        update(prev, context) {
            this.wrap()
            this.insertNode(context)
        }
        cleanupDOMChildren(context) {
            const element = this.node
            for (let current = element.lastChild;current != null;) {
                if (context.vdom.isDOMNodeCaptured(current)) {
                    current = current.previousSibling
                }
                else {
                    const prev = current.previousSibling
                    element.removeChild(current)
                    current = prev
                }
            }
        }
        refine(context) {
            if (!this.isNative) {
                this.cleanupDOMChildren(context)
            }
            const element = this.node
            markElementAsRefined(element, context.vdom)
        }
        attached(context) {
            const { node } = this
            if (node instanceof Element &&
                !isElementRefined(node, context.vdom) &&
                context.vdom.isDOMNodeCaptured(node)) {
                this.refine(context)
            }
        }
        children() {
            return this.childVNodes
        }
    }
    function isDOMVNode(v) {
        return v instanceof DOMVNode
    }
    function createDOMVNode(node, childSpecs, parent, isNative) {
        return new DOMVNode(node, childSpecs, parent, isNative)
    }
    class ArrayVNode extends VNodeBase {
        constructor(items, key, parent) {
            super(parent)
            this.items = items
            this.id = key
        }
        matches(other) {
            return other instanceof ArrayVNode
        }
        key() {
            return this.id
        }
        children() {
            return this.childVNodes
        }
        wrap() {
            this.childVNodes = this.items.map((spec) => createVNode(spec, this))
        }
        attach() {
            this.wrap()
        }
        update() {
            this.wrap()
        }
    }
    function createVNode(spec, parent) {
        if (isNodeSpec(spec)) {
            return new ElementVNode(spec, parent)
        }
        if (isComponentSpec(spec)) {
            if (spec.type === Array) {
                return new ArrayVNode(spec.children, spec.props.key, parent)
            }
            return new ComponentVNode(spec, parent)
        }
        if (typeof spec === 'string') {
            return new TextVNode(spec, parent)
        }
        if (spec == null) {
            return new NullVNode(parent)
        }
        if (typeof spec === 'function') {
            return new InlineFunctionVNode(spec, parent)
        }
        if (spec instanceof Node) {
            return createDOMVNode(spec, [], parent, true)
        }
        if (Array.isArray(spec)) {
            return new ArrayVNode(spec, null, parent)
        }
        throw new Error('Unable to create virtual node for spec')
    }

    function createVDOM(rootNode) {
        const contexts = new WeakMap()
        const hubs = new WeakMap()
        const parentNodes = new WeakMap()
        const passingLinks = new WeakMap()
        const linkedParents = new WeakSet()
        const LEAVE = Symbol()
        function execute$1(vnode, old) {
            execute(vnode, old, vdom)
        }
        function creatVNodeContext(vnode) {
            const parentNode = parentNodes.get(vnode)
            contexts.set(vnode, {
                parent: parentNode,
                get node() {
                    const linked = passingLinks
                        .get(vnode)
                        .find((link) => link.node != null)
                    return linked ? linked.node : null
                },
                get nodes() {
                    return passingLinks
                        .get(vnode)
                        .map((link) => link.node)
                        .filter((node) => node)
                },
                get sibling() {
                    if (parentNode === rootNode.parentElement) {
                        return passingLinks.get(vnode).first.node.previousSibling
                    }
                    const hub = hubs.get(parentNode)
                    let current = passingLinks.get(vnode).first
                    while ((current = hub.links.before(current))) {
                        if (current.node) {
                            return current.node
                        }
                    }
                    return null
                },
                vdom,
            })
        }
        function createRootVNodeLinks(vnode) {
            const parentNode = rootNode.parentElement || document.createDocumentFragment()
            const node = rootNode
            const links = new LinkedList({
                parentNode,
                node,
            })
            passingLinks.set(vnode, links.copy())
            parentNodes.set(vnode, parentNode)
            hubs.set(parentNode, {
                node: parentNode,
                links,
            })
        }
        function createVNodeLinks(vnode) {
            const parent = vnode.parent()
            const isBranch = linkedParents.has(parent)
            const parentNode = isDOMVNode(parent)
                ? parent.node
                : parentNodes.get(parent)
            parentNodes.set(vnode, parentNode)
            const vnodeLinks = new LinkedList()
            passingLinks.set(vnode, vnodeLinks)
            if (isBranch) {
                const newLink = {
                    parentNode,
                    node: null,
                }
                let current = vnode
                do {
                    passingLinks.get(current).push(newLink)
                    current = current.parent()
                } while (current && !isDOMVNode(current))
                hubs.get(parentNode).links.push(newLink)
            }
            else {
                linkedParents.add(parent)
                const links = isDOMVNode(parent)
                    ? hubs.get(parentNode).links
                    : passingLinks.get(parent)
                links.forEach((link) => vnodeLinks.push(link))
            }
        }
        function connectDOMVNode(vnode) {
            if (isDOMVNode(vnode)) {
                const { node } = vnode
                hubs.set(node, {
                    node,
                    links: new LinkedList({
                        parentNode: node,
                        node: null,
                    }),
                })
                passingLinks.get(vnode).forEach((link) => (link.node = node))
            }
        }
        function addVNode(vnode) {
            const parent = vnode.parent()
            if (parent == null) {
                createRootVNodeLinks(vnode)
            }
            else {
                createVNodeLinks(vnode)
            }
            connectDOMVNode(vnode)
            creatVNodeContext(vnode)
        }
        function getVNodeContext(vnode) {
            return contexts.get(vnode)
        }
        function getAncestorsLinks(vnode) {
            const parentNode = parentNodes.get(vnode)
            const hub = hubs.get(parentNode)
            const allLinks = []
            let current = vnode
            while ((current = current.parent()) && !isDOMVNode(current)) {
                allLinks.push(passingLinks.get(current))
            }
            allLinks.push(hub.links)
            return allLinks
        }
        function replaceVNode(old, vnode) {
            if (vnode.parent() == null) {
                addVNode(vnode)
                return
            }
            const oldContext = contexts.get(old)
            const { parent: parentNode } = oldContext
            parentNodes.set(vnode, parentNode)
            const oldLinks = passingLinks.get(old)
            const newLink = {
                parentNode,
                node: null,
            }
            getAncestorsLinks(vnode).forEach((links) => {
                const nextLink = links.after(oldLinks.last)
                oldLinks.forEach((link) => links.delete(link))
                if (nextLink) {
                    links.insertBefore(newLink, nextLink)
                }
                else {
                    links.push(newLink)
                }
            })
            const vnodeLinks = new LinkedList(newLink)
            passingLinks.set(vnode, vnodeLinks)
            creatVNodeContext(vnode)
        }
        function adoptVNode(vnode, parent) {
            const vnodeLinks = passingLinks.get(vnode)
            const parentLinks = passingLinks.get(parent).copy()
            vnode.parent(parent)
            getAncestorsLinks(vnode).forEach((links) => {
                vnodeLinks.forEach((link) => links.insertBefore(link, parentLinks.first))
                parentLinks.forEach((link) => links.delete(link))
            })
        }
        function isDOMNodeCaptured(node) {
            return hubs.has(node) && node !== rootNode.parentElement
        }
        const vdom = {
            execute: execute$1,
            addVNode,
            getVNodeContext,
            replaceVNode,
            adoptVNode,
            isDOMNodeCaptured,
            LEAVE,
        }
        return vdom
    }

    const roots = new WeakMap()
    const vdoms = new WeakMap()
    function realize(node, vnode) {
        const old = roots.get(node) || null
        roots.set(node, vnode)
        let vdom
        if (vdoms.has(node)) {
            vdom = vdoms.get(node)
        }
        else {
            vdom = createVDOM(node)
            vdoms.set(node, vdom)
        }
        vdom.execute(vnode, old)
        return vdom.getVNodeContext(vnode)
    }
    function render(element, spec) {
        const vnode = createDOMVNode(element, Array.isArray(spec) ? spec : [spec], null, false)
        realize(element, vnode)
        return element
    }
    function sync(node, spec) {
        const vnode = createVNode(spec, null)
        const context = realize(node, vnode)
        const { nodes } = context
        if (nodes.length !== 1 || nodes[0] !== node) {
            throw new Error('Spec does not match the node')
        }
        return nodes[0]
    }

    const plugins = {
        createElement: createPluginsAPI(PLUGINS_CREATE_ELEMENT),
        setAttribute: createPluginsAPI(PLUGINS_SET_ATTRIBUTE),
    }

    class Connector {
        constructor() {
            this.counter = 0
            this.port = chrome.runtime.connect({ name: 'ui' })
        }
        getRequestId() {
            return ++this.counter
        }
        sendRequest(request, executor) {
            const id = this.getRequestId()
            return new Promise((resolve, reject) => {
                const listener = ({ id: responseId, ...response }) => {
                    if (responseId === id) {
                        executor(response, resolve, reject)
                        this.port.onMessage.removeListener(listener)
                    }
                }
                this.port.onMessage.addListener(listener)
                this.port.postMessage({ ...request, id })
            })
        }
        getData() {
            return this.sendRequest({ type: 'get-data' }, ({ data }, resolve) => resolve(data))
        }
        getActiveTabInfo() {
            return this.sendRequest({ type: 'get-active-tab-info' }, ({ data }, resolve) => resolve(data))
        }
        subscribeToChanges(callback) {
            const id = this.getRequestId()
            this.port.onMessage.addListener(({ id: responseId, data }) => {
                if (responseId === id) {
                    callback(data)
                }
            })
            this.port.postMessage({ type: 'subscribe-to-changes', id })
        }
        enable() {
            this.port.postMessage({ type: 'enable' })
        }
        disable() {
            this.port.postMessage({ type: 'disable' })
        }
        setShortcut(command, shortcut) {
            this.port.postMessage({ type: 'set-shortcut', data: { command, shortcut } })
        }
        changeSettings(settings) {
            this.port.postMessage({ type: 'change-settings', data: settings })
        }
        setTheme(theme) {
            this.port.postMessage({ type: 'set-theme', data: theme })
        }
        toggleURL(url) {
            this.port.postMessage({ type: 'toggle-url', data: url })
        }
        markNewsAsRead(ids) {
            this.port.postMessage({ type: 'mark-news-as-read', data: ids })
        }
        loadConfig(options) {
            this.port.postMessage({ type: 'load-config', data: options })
        }
        applyDevDynamicThemeFixes(text) {
            return this.sendRequest({ type: 'apply-dev-dynamic-theme-fixes', data: text }, ({ error }, resolve, reject) => error ? reject(error) : resolve())
        }
        resetDevDynamicThemeFixes() {
            this.port.postMessage({ type: 'reset-dev-dynamic-theme-fixes' })
        }
        applyDevInversionFixes(text) {
            return this.sendRequest({ type: 'apply-dev-inversion-fixes', data: text }, ({ error }, resolve, reject) => error ? reject(error) : resolve())
        }
        resetDevInversionFixes() {
            this.port.postMessage({ type: 'reset-dev-inversion-fixes' })
        }
        applyDevStaticThemes(text) {
            return this.sendRequest({ type: 'apply-dev-static-themes', data: text }, ({ error }, resolve, reject) => error ? reject(error) : resolve())
        }
        resetDevStaticThemes() {
            this.port.postMessage({ type: 'reset-dev-static-themes' })
        }
        disconnect() {
            this.port.disconnect()
        }
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

    function getMockData(override = {}) {
        return Object.assign({
            isEnabled: true,
            isReady: true,
            settings: {
                enabled: true,
                presets: [],
                theme: {
                    mode: 1,
                    brightness: 110,
                    contrast: 90,
                    grayscale: 20,
                    sepia: 10,
                    useFont: false,
                    fontFamily: 'Segoe UI',
                    textStroke: 0,
                    engine: 'cssFilter',
                    stylesheet: '',
                    scrollbarColor: 'auto',
                    styleSystemControls: true,
                },
                customThemes: [],
                siteList: [],
                siteListEnabled: [],
                applyToListedOnly: false,
                changeBrowserTheme: false,
                enableForPDF: true,
                enableForProtectedPages: false,
                notifyOfNews: false,
                syncSettings: true,
                automation: '',
                time: {
                    activation: '18:00',
                    deactivation: '9:00',
                },
                location: {
                    latitude: 52.4237178,
                    longitude: 31.021786,
                },
            },
            fonts: [
                'serif',
                'sans-serif',
                'monospace',
                'cursive',
                'fantasy',
                'system-ui'
            ],
            shortcuts: {
                'addSite': 'Alt+Shift+A',
                'toggle': 'Alt+Shift+D'
            },
            devtools: {
                dynamicFixesText: '',
                filterFixesText: '',
                staticThemesText: '',
                hasCustomDynamicFixes: false,
                hasCustomFilterFixes: false,
                hasCustomStaticFixes: false,
            },
        }, override)
    }
    function getMockActiveTabInfo() {
        return {
            url: '',
            isProtected: false,
            isInDarkList: false,
        }
    }
    function createConnectorMock() {
        let listener = null
        const data = getMockData()
        const tab = getMockActiveTabInfo()
        const connector = {
            getData() {
                return Promise.resolve(data)
            },
            getActiveTabInfo() {
                return Promise.resolve(tab)
            },
            subscribeToChanges(callback) {
                listener = callback
            },
            changeSettings(settings) {
                Object.assign(data.settings, settings)
                listener(data)
            },
            setTheme(theme) {
                Object.assign(data.settings.theme, theme)
                listener(data)
            },
            setShortcut(command, shortcut) {
                Object.assign(data.shortcuts, { [command]: shortcut })
                listener(data)
            },
            toggleURL(url) {
                const pattern = getURLHostOrProtocol(url)
                const index = data.settings.siteList.indexOf(pattern)
                if (index >= 0) {
                    data.settings.siteList.splice(index, 1, pattern)
                }
                else {
                    data.settings.siteList.push(pattern)
                }
                listener(data)
            },
            disconnect() {
            },
        }
        return connector
    }

    function connect() {
        if (typeof chrome === 'undefined' || !chrome.extension) {
            return createConnectorMock()
        }
        return new Connector()
    }

    /* malevic@0.18.6 - Jul 15, 2020 */

    function withForms(type) {
        plugins.setAttribute.add(type, ({ element, attr, value }) => {
            if (attr === 'value' && element instanceof HTMLInputElement) {
                const text = (element.value = value == null ? '' : value)
                element.value = text
                return true
            }
            return null
        })
        return type
    }

    /* malevic@0.18.6 - Jul 15, 2020 */

    let currentUseStateFn = null
    function useState(initialState) {
        if (!currentUseStateFn) {
            throw new Error('`useState()` should be called inside a component')
        }
        return currentUseStateFn(initialState)
    }
    function withState(type) {
        const Stateful = (props, ...children) => {
            const context = getComponentContext()
            const useState = (initial) => {
                if (!context) {
                    return { state: initial, setState: null }
                }
                const { store, refresh } = context
                store.state = store.state || initial
                const setState = (newState) => {
                    if (lock) {
                        throw new Error('Setting state during unboxing causes infinite loop')
                    }
                    store.state = Object.assign(Object.assign({}, store.state), newState)
                    refresh()
                }
                return {
                    state: store.state,
                    setState,
                }
            }
            let lock = true
            const prevUseStateFn = currentUseStateFn
            currentUseStateFn = useState
            let result
            try {
                result = type(props, ...children)
            }
            finally {
                currentUseStateFn = prevUseStateFn
                lock = false
            }
            return result
        }
        return Stateful
    }

    function isFirefox() {
        return navigator.userAgent.includes('Firefox')
    }
    function isVivaldi() {
        return navigator.userAgent.toLowerCase().includes('vivaldi')
    }
    function isYaBrowser() {
        return navigator.userAgent.toLowerCase().includes('yabrowser')
    }
    function isOpera() {
        const agent = navigator.userAgent.toLowerCase()
        return agent.includes('opr') || agent.includes('opera')
    }
    function isEdge() {
        return navigator.userAgent.includes('Edg')
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
    function isMobile() {
        if (typeof navigator === 'undefined') {
            return null
        }
        return navigator.userAgent.toLowerCase().includes('mobile')
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

    function classes$1(...args) {
        const classes = []
        args.filter((c) => Boolean(c)).forEach((c) => {
            if (typeof c === 'string') {
                classes.push(c)
            }
            else if (typeof c === 'object') {
                classes.push(...Object.keys(c).filter((key) => Boolean(c[key])))
            }
        })
        return classes.join(' ')
    }
    function compose(type, ...wrappers) {
        return wrappers.reduce((t, w) => w(t), type)
    }
    function openFile(options, callback) {
        const input = document.createElement('input')
        input.type = 'file'
        input.style.display = 'none'
        if (options.extensions && options.extensions.length > 0) {
            input.accept = options.extensions.map((ext) => `.${ext}`).join(',')
        }
        const reader = new FileReader()
        reader.onloadend = () => callback(reader.result)
        input.onchange = () => {
            if (input.files[0]) {
                reader.readAsText(input.files[0])
                document.body.removeChild(input)
            }
        }
        document.body.appendChild(input)
        input.click()
    }
    function saveFile(name, content) {
        if (isFirefox()) {
            const a = document.createElement('a')
            a.href = URL.createObjectURL(new Blob([content]))
            a.download = name
            a.click()
        }
        else {
            chrome.runtime.sendMessage({ type: 'save-file', data: { name, content } })
        }
    }
    function throttle(callback) {
        let frameId = null
        return ((...args) => {
            if (!frameId) {
                callback(...args)
                frameId = requestAnimationFrame(() => (frameId = null))
            }
        })
    }
    function onSwipeStart(startEventObj, startHandler) {
        const isTouchEvent = typeof TouchEvent !== 'undefined' &&
            startEventObj instanceof TouchEvent
        const touchId = isTouchEvent
            ? startEventObj.changedTouches[0].identifier
            : null
        const pointerMoveEvent = isTouchEvent ? 'touchmove' : 'mousemove'
        const pointerUpEvent = isTouchEvent ? 'touchend' : 'mouseup'
        if (!isTouchEvent) {
            startEventObj.preventDefault()
        }
        function getSwipeEventObject(e) {
            const { clientX, clientY } = isTouchEvent
                ? getTouch(e)
                : e
            return { clientX, clientY }
        }
        const startSE = getSwipeEventObject(startEventObj)
        const { move: moveHandler, up: upHandler } = startHandler(startSE, startEventObj)
        function getTouch(e) {
            return Array.from(e.changedTouches).find(({ identifier: id }) => id === touchId)
        }
        const onPointerMove = throttle((e) => {
            const se = getSwipeEventObject(e)
            moveHandler(se, e)
        })
        function onPointerUp(e) {
            unsubscribe()
            const se = getSwipeEventObject(e)
            upHandler(se, e)
        }
        function unsubscribe() {
            window.removeEventListener(pointerMoveEvent, onPointerMove)
            window.removeEventListener(pointerUpEvent, onPointerUp)
        }
        window.addEventListener(pointerMoveEvent, onPointerMove, { passive: true })
        window.addEventListener(pointerUpEvent, onPointerUp, { passive: true })
    }
    function createSwipeHandler(startHandler) {
        return (e) => onSwipeStart(e, startHandler)
    }

    function toArray(x) {
        return Array.isArray(x) ? x : [x]
    }
    function mergeClass(cls, propsCls) {
        const normalized = toArray(cls).concat(toArray(propsCls))
        return classes$1(...normalized)
    }
    function omitAttrs(omit, attrs) {
        const result = {}
        Object.keys(attrs).forEach((key) => {
            if (omit.indexOf(key) < 0) {
                result[key] = attrs[key]
            }
        })
        return result
    }

    function Button(props, ...children) {
        const cls = mergeClass('button', props.class)
        const attrs = omitAttrs(['class'], props)
        return (m("button", Object.assign({ class: cls }, attrs),
            m("span", { class: "button__wrapper" }, children)))
    }

    function CheckBox(props, ...children) {
        const cls = mergeClass('checkbox', props.class)
        const attrs = omitAttrs(['class', 'checked', 'onchange'], props)
        const check = (domNode) => domNode.checked = Boolean(props.checked)
        return (m("label", Object.assign({ class: cls }, attrs),
            m("input", { class: "checkbox__input", type: "checkbox", checked: props.checked, onchange: props.onchange, onrender: check }),
            m("span", { class: "checkbox__checkmark" }),
            m("span", { class: "checkbox__content" }, children)))
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

    function TextBox(props) {
        const cls = mergeClass('textbox', props.class)
        const attrs = omitAttrs(['class', 'type'], props)
        return (m("input", Object.assign({ class: cls, type: "text" }, attrs)))
    }

    function scale(x, inLow, inHigh, outLow, outHigh) {
        return (x - inLow) * (outHigh - outLow) / (inHigh - inLow) + outLow
    }
    function clamp(x, min, max) {
        return Math.min(max, Math.max(min, x))
    }

    function rgbToHSB({ r, g, b }) {
        const min = Math.min(r, g, b)
        const max = Math.max(r, g, b)
        return {
            h: rgbToHSL({ r, g, b }).h,
            s: max === 0 ? 0 : (1 - (min / max)),
            b: max / 255,
        }
    }
    function hsbToRGB({ h: hue, s: sat, b: br }) {
        let c
        if (hue < 60) {
            c = [1, hue / 60, 0]
        }
        else if (hue < 120) {
            c = [(120 - hue) / 60, 1, 0]
        }
        else if (hue < 180) {
            c = [0, 1, (hue - 120) / 60]
        }
        else if (hue < 240) {
            c = [0, (240 - hue) / 60, 1]
        }
        else if (hue < 300) {
            c = [(hue - 240) / 60, 0, 1]
        }
        else {
            c = [1, 0, (360 - hue) / 60]
        }
        const max = Math.max(...c)
        const [r, g, b] = c
            .map((v) => v + (max - v) * (1 - sat))
            .map((v) => v * br)
            .map((v) => Math.round(v * 255))
        return { r, g, b, a: 1 }
    }
    function hsbToString(hsb) {
        const rgb = hsbToRGB(hsb)
        return rgbToHexString(rgb)
    }
    function render$1(canvas, getPixel) {
        const { width, height } = canvas
        const context = canvas.getContext('2d')
        const imageData = context.getImageData(0, 0, width, height)
        const d = imageData.data
        for (let y = 0;y < height;y++) {
            for (let x = 0;x < width;x++) {
                const i = 4 * (y * width + x)
                const c = getPixel(x, y)
                for (let j = 0;j < 4;j++) {
                    d[i + j] = c[j]
                }
            }
        }
        context.putImageData(imageData, 0, 0)
    }
    function renderHue(canvas) {
        const { height } = canvas
        render$1(canvas, (_, y) => {
            const hue = scale(y, 0, height, 0, 360)
            const { r, g, b } = hsbToRGB({ h: hue, s: 1, b: 1 })
            return new Uint8ClampedArray([r, g, b, 255])
        })
    }
    function renderSB(hue, canvas) {
        const { width, height } = canvas
        render$1(canvas, (x, y) => {
            const sat = scale(x, 0, width - 1, 0, 1)
            const br = scale(y, 0, height - 1, 1, 0)
            const { r, g, b } = hsbToRGB({ h: hue, s: sat, b: br })
            return new Uint8ClampedArray([r, g, b, 255])
        })
    }
    function HSBPicker(props) {
        const context = getComponentContext()
        const store = context.store
        store.activeChangeHandler = props.onChange
        const prevColor = context.prev && context.prev.props.color
        const prevActiveColor = store.activeHSB ? hsbToString(store.activeHSB) : null
        const didColorChange = props.color !== prevColor && props.color !== prevActiveColor
        let activeHSB
        if (didColorChange) {
            const rgb = parse(props.color)
            activeHSB = rgbToHSB(rgb)
            store.activeHSB = activeHSB
        }
        else {
            activeHSB = store.activeHSB
        }
        function onSBCanvasRender(canvas) {
            const hue = activeHSB.h
            const prevHue = prevColor && rgbToHSB(parse(prevColor)).h
            if (hue === prevHue) {
                return
            }
            renderSB(hue, canvas)
        }
        function onHueCanvasCreate(canvas) {
            renderHue(canvas)
        }
        function createHSBSwipeHandler(getEventHSB) {
            return createSwipeHandler((startEvt, startNativeEvt) => {
                const rect = startNativeEvt.currentTarget.getBoundingClientRect()
                function onPointerMove(e) {
                    store.activeHSB = getEventHSB({ ...e, rect })
                    props.onColorPreview(hsbToString(store.activeHSB))
                    context.refresh()
                }
                function onPointerUp(e) {
                    const hsb = getEventHSB({ ...e, rect })
                    store.activeHSB = hsb
                    props.onChange(hsbToString(hsb))
                }
                store.activeHSB = getEventHSB({ ...startEvt, rect })
                context.refresh()
                return {
                    move: onPointerMove,
                    up: onPointerUp,
                }
            })
        }
        const onSBPointerDown = createHSBSwipeHandler(({ clientX, clientY, rect }) => {
            const sat = clamp((clientX - rect.left) / rect.width, 0, 1)
            const br = clamp(1 - (clientY - rect.top) / rect.height, 0, 1)
            return { ...activeHSB, s: sat, b: br }
        })
        const onHuePointerDown = createHSBSwipeHandler(({ clientY, rect }) => {
            const hue = clamp((clientY - rect.top) / rect.height, 0, 1) * 360
            return { ...activeHSB, h: hue }
        })
        const hueCursorStyle = {
            'background-color': hslToString({ h: activeHSB.h, s: 1, l: 0.5, a: 1 }),
            'left': '0%',
            'top': `${activeHSB.h / 360 * 100}%`,
        }
        const sbCursorStyle = {
            'background-color': rgbToHexString(hsbToRGB(activeHSB)),
            'left': `${activeHSB.s * 100}%`,
            'top': `${(1 - activeHSB.b) * 100}%`,
        }
        return (m("span", { class: "hsb-picker" },
            m("span", {
                class: "hsb-picker__sb-container", onmousedown: onSBPointerDown, onupdate: (el) => {
                    if (store.sbTouchStartHandler) {
                        el.removeEventListener('touchstart', store.sbTouchStartHandler)
                    }
                    el.addEventListener('touchstart', onSBPointerDown, { passive: true })
                    store.sbTouchStartHandler = onSBPointerDown
                }
            },
                m("canvas", { class: "hsb-picker__sb-canvas", onrender: onSBCanvasRender }),
                m("span", { class: "hsb-picker__sb-cursor", style: sbCursorStyle })),
            m("span", {
                class: "hsb-picker__hue-container", onmousedown: onHuePointerDown, onupdate: (el) => {
                    if (store.hueTouchStartHandler) {
                        el.removeEventListener('touchstart', store.hueTouchStartHandler)
                    }
                    el.addEventListener('touchstart', onHuePointerDown, { passive: true })
                    store.hueTouchStartHandler = onHuePointerDown
                }
            },
                m("canvas", { class: "hsb-picker__hue-canvas", oncreate: onHueCanvasCreate }),
                m("span", { class: "hsb-picker__hue-cursor", style: hueCursorStyle }))))
    }

    function isValidColor(color) {
        try {
            parse(color)
            return true
        }
        catch (err) {
            return false
        }
    }
    const colorPickerFocuses = new WeakMap()
    function focusColorPicker(node) {
        const focus = colorPickerFocuses.get(node)
        focus()
    }
    function ColorPicker(props) {
        const context = getComponentContext()
        context.onRender((node) => colorPickerFocuses.set(node, focus))
        const store = context.store
        const isColorValid = isValidColor(props.color)
        function onColorPreview(previewColor) {
            store.previewNode.style.backgroundColor = previewColor
            store.textBoxNode.value = previewColor
            store.textBoxNode.blur()
        }
        function onColorChange(rawValue) {
            const value = rawValue.trim()
            if (isValidColor(value)) {
                props.onChange(value)
            }
            else {
                props.onChange(props.color)
            }
        }
        function focus() {
            if (store.isFocused) {
                return
            }
            store.isFocused = true
            context.refresh()
            window.addEventListener('mousedown', onOuterClick)
        }
        function blur() {
            if (!store.isFocused) {
                return
            }
            window.removeEventListener('mousedown', onOuterClick)
            store.isFocused = false
            context.refresh()
        }
        function toggleFocus() {
            if (store.isFocused) {
                blur()
            }
            else {
                focus()
            }
        }
        function onOuterClick(e) {
            if (!e.composedPath().some((el) => el === context.node)) {
                blur()
            }
        }
        const textBox = (m(TextBox, {
            class: "color-picker__input", onrender: (el) => {
                store.textBoxNode = el
                store.textBoxNode.value = isColorValid ? props.color : ''
            }, onkeypress: (e) => {
                const input = e.target
                if (e.key === 'Enter') {
                    const { value } = input
                    onColorChange(value)
                    blur()
                    onColorPreview(value)
                }
            }, onfocus: focus
        }))
        const previewElement = (m("span", {
            class: "color-picker__preview", onclick: toggleFocus, onrender: (el) => {
                store.previewNode = el
                el.style.backgroundColor = isColorValid ? props.color : 'transparent'
            }
        }))
        const resetButton = props.canReset ? (m("span", {
            role: "button", class: "color-picker__reset", onclick: () => {
                props.onReset()
                blur()
            }
        })) : null
        const textBoxLine = (m("span", { class: "color-picker__textbox-line" },
            textBox,
            previewElement,
            resetButton))
        const hsbLine = isColorValid ? (m("span", { class: "color-picker__hsb-line" },
            m(HSBPicker, { color: props.color, onChange: onColorChange, onColorPreview: onColorPreview }))) : null
        return (m("span", { class: ['color-picker', store.isFocused && 'color-picker--focused', props.class] },
            m("span", { class: "color-picker__wrapper" },
                textBoxLine,
                hsbLine)))
    }
    var ColorPicker$1 = Object.assign(ColorPicker, { focus: focusColorPicker })

    function DropDown(props) {
        const context = getComponentContext()
        const store = context.store
        if (context.prev) {
            const currOptions = props.options.map((o) => o.id)
            const prevOptions = context.prev.props.options.map((o) => o.id)
            if (currOptions.length !== prevOptions.length || currOptions.some((o, i) => o !== prevOptions[i])) {
                store.isOpen = false
            }
        }
        function saveListNode(el) {
            store.listNode = el
        }
        function saveSelectedNode(el) {
            store.selectedNode = el
        }
        function onSelectedClick() {
            store.isOpen = !store.isOpen
            context.refresh()
            if (store.isOpen) {
                const onOuterClick = (e) => {
                    window.removeEventListener('mousedown', onOuterClick, false)
                    const listRect = store.listNode.getBoundingClientRect()
                    const ex = e.clientX
                    const ey = e.clientY
                    if (ex < listRect.left ||
                        ex > listRect.right ||
                        ey < listRect.top ||
                        ey > listRect.bottom) {
                        store.isOpen = false
                        context.refresh()
                    }
                }
                window.addEventListener('mousedown', onOuterClick, false)
            }
        }
        function createListItem(value) {
            return (m("span", {
                class: {
                    'dropdown__list__item': true,
                    'dropdown__list__item--selected': value.id === props.selected,
                    [props.class]: props.class != null,
                }, onclick: () => {
                    store.isOpen = false
                    context.refresh()
                    props.onChange(value.id)
                }
            }, value.content))
        }
        const selectedContent = props.options.find((value) => value.id === props.selected).content
        return (m("span", {
            class: {
                'dropdown': true,
                'dropdown--open': store.isOpen,
                [props.class]: Boolean(props.class),
            }
        },
            m("span", { class: "dropdown__list", oncreate: saveListNode }, props.options
                .slice()
                .sort((a, b) => a.id === props.selected ? -1 : b.id === props.selected ? 1 : 0)
                .map(createListItem)),
            m("span", { class: "dropdown__selected", oncreate: saveSelectedNode, onclick: onSelectedClick },
                m("span", { class: "dropdown__selected__text" }, selectedContent))))
    }

    function ColorDropDown(props) {
        const context = getComponentContext()
        const store = context.store
        const labels = {
            DEFAULT: 'Default',
            AUTO: 'Auto',
            CUSTOM: 'Custom',
        }
        const dropDownOptions = [
            props.hasDefaultOption ? { id: 'default', content: labels.DEFAULT } : null,
            props.hasAutoOption ? { id: 'auto', content: labels.AUTO } : null,
            { id: 'custom', content: labels.CUSTOM },
        ].filter((v) => v)
        const selectedDropDownValue = (props.value === '' ? 'default' :
            props.value === 'auto' ? 'auto' :
                'custom')
        function onDropDownChange(value) {
            const result = {
                default: '',
                auto: 'auto',
                custom: props.colorSuggestion,
            }[value]
            props.onChange(result)
        }
        let isPickerVisible
        try {
            parse(props.value)
            isPickerVisible = true
        }
        catch (err) {
            isPickerVisible = false
        }
        const prevValue = context.prev ? context.prev.props.value : null
        const shouldFocusOnPicker = ((props.value !== '' && props.value !== 'auto') &&
            prevValue != null &&
            (prevValue === '' || prevValue === 'auto'))
        function onRootRender(root) {
            if (shouldFocusOnPicker) {
                const pickerNode = root.querySelector('.color-dropdown__picker')
                ColorPicker$1.focus(pickerNode)
            }
        }
        return (m("span", {
            class: {
                'color-dropdown': true,
                'color-dropdown--open': store.isOpen,
                [props.class]: Boolean(props.class),
            }, onrender: onRootRender
        },
            m(DropDown, { class: "color-dropdown__options", options: dropDownOptions, selected: selectedDropDownValue, onChange: onDropDownChange }),
            m(ColorPicker$1, {
                class: {
                    'color-dropdown__picker': true,
                    'color-dropdown__picker--hidden': !isPickerVisible,
                }, color: props.value, onChange: props.onChange, canReset: true, onReset: props.onReset
            })))
    }

    const DEFAULT_OVERLAY_KEY = Symbol()
    const overlayNodes = new Map()
    const clickListeners = new WeakMap()
    function getOverlayDOMNode(key) {
        if (key == null) {
            key = DEFAULT_OVERLAY_KEY
        }
        if (!overlayNodes.has(key)) {
            const node = document.createElement('div')
            node.classList.add('overlay')
            node.addEventListener('click', (e) => {
                if (clickListeners.has(node) && e.currentTarget === node) {
                    const listener = clickListeners.get(node)
                    listener()
                }
            })
            overlayNodes.set(key, node)
        }
        return overlayNodes.get(key)
    }
    function Overlay(props) {
        return getOverlayDOMNode(props.key)
    }
    function Portal(props, ...content) {
        const context = getComponentContext()
        context.onRender(() => {
            const node = getOverlayDOMNode(props.key)
            if (props.onOuterClick) {
                clickListeners.set(node, props.onOuterClick)
            }
            else {
                clickListeners.delete(node)
            }
            render(node, content)
        })
        context.onRemove(() => {
            const container = getOverlayDOMNode(props.key)
            render(container, null)
        })
        return context.leave()
    }
    var Overlay$1 = Object.assign(Overlay, { Portal })

    function MessageBox(props) {
        return (m(Overlay$1.Portal, { key: props.portalKey, onOuterClick: props.onCancel },
            m("div", { class: "message-box" },
                m("label", { class: "message-box__caption" }, props.caption),
                m("div", { class: "message-box__buttons" },
                    m(Button, { class: "message-box__button message-box__button-ok", onclick: props.onOK }, "OK"),
                    m(Button, { class: "message-box__button message-box__button-cancel", onclick: props.onCancel }, "Cancel")))))
    }

    function MultiSwitch(props, ...children) {
        return (m("span", { class: ['multi-switch', props.class] },
            m("span", {
                class: "multi-switch__highlight", style: {
                    'left': `${props.options.indexOf(props.value) / props.options.length * 100}%`,
                    'width': `${1 / props.options.length * 100}%`,
                }
            }),
            props.options.map((option) => (m("span", {
                class: {
                    'multi-switch__option': true,
                    'multi-switch__option--selected': option === props.value
                }, onclick: () => option !== props.value && props.onChange(option)
            }, option))),
            children))
    }

    function ResetButton(props, ...content) {
        return (m(Button, { class: ['nav-button', props.class], onclick: props.onClick },
            m("span", { class: "nav-button__content" }, content)))
    }

    function ResetButton$1(props, ...content) {
        return (m(Button, { class: "reset-button", onclick: props.onClick },
            m("span", { class: "reset-button__content" },
                m("span", { class: "reset-button__icon" }),
                content)))
    }

    function VirtualScroll(props) {
        if (props.items.length === 0) {
            return props.root
        }
        const { store } = getComponentContext()
        function renderContent(root, scrollToIndex) {
            if (root.clientWidth === 0) {
                return
            }
            if (store.itemHeight == null) {
                const tempItem = {
                    ...props.items[0],
                    props: {
                        ...props.items[0].props,
                        oncreate: null,
                        onupdate: null,
                        onrender: null,
                    },
                }
                const tempNode = render(root, tempItem).firstElementChild
                store.itemHeight = tempNode.getBoundingClientRect().height
            }
            const { itemHeight } = store
            const wrapper = render(root, (m("div", {
                style: {
                    'flex': 'none',
                    'height': `${props.items.length * itemHeight}px`,
                    'overflow': 'hidden',
                    'position': 'relative',
                }
            }))).firstElementChild
            if (scrollToIndex >= 0) {
                root.scrollTop = scrollToIndex * itemHeight
            }
            const containerHeight = document.documentElement.clientHeight - root.getBoundingClientRect().top
            let focusedIndex = -1
            if (document.activeElement) {
                let current = document.activeElement
                while (current && current.parentElement !== wrapper) {
                    current = current.parentElement
                }
                if (current) {
                    focusedIndex = store.nodesIndices.get(current)
                }
            }
            store.nodesIndices = store.nodesIndices || new WeakMap()
            const saveNodeIndex = (node, index) => store.nodesIndices.set(node, index)
            const items = props.items
                .map((item, index) => {
                    return { item, index }
                })
                .filter(({ index }) => {
                    const eTop = index * itemHeight
                    const eBottom = (index + 1) * itemHeight
                    const rTop = root.scrollTop
                    const rBottom = root.scrollTop + containerHeight
                    const isTopBoundVisible = eTop >= rTop && eTop <= rBottom
                    const isBottomBoundVisible = eBottom >= rTop && eBottom <= rBottom
                    return isTopBoundVisible || isBottomBoundVisible || focusedIndex === index
                })
                .map(({ item, index }) => (m("div", {
                    key: index, onrender: (node) => saveNodeIndex(node, index), style: {
                        'left': '0',
                        'position': 'absolute',
                        'top': `${index * itemHeight}px`,
                        'width': '100%',
                    }
                }, item)))
            render(wrapper, items)
        }
        let rootNode
        let prevScrollTop
        const rootDidMount = props.root.props.oncreate
        const rootDidUpdate = props.root.props.onupdate
        const rootDidRender = props.root.props.onrender
        return {
            ...props.root,
            props: {
                ...props.root.props,
                oncreate: rootDidMount,
                onupdate: rootDidUpdate,
                onrender: (node) => {
                    rootNode = node
                    rootDidRender && rootDidRender(rootNode)
                    renderContent(rootNode, isNaN(props.scrollToIndex) ? -1 : props.scrollToIndex)
                },
                onscroll: () => {
                    if (rootNode.scrollTop === prevScrollTop) {
                        return
                    }
                    prevScrollTop = rootNode.scrollTop
                    renderContent(rootNode, -1)
                },
            },
            children: []
        }
    }

    function Select(props) {
        const { state, setState } = useState({ isExpanded: false, focusedIndex: null })
        const values = Object.keys(props.options)
        const { store } = getComponentContext()
        const valueNodes = store.valueNodes || (store.valueNodes = new Map())
        const nodesValues = store.nodesValues || (store.nodesValues = new WeakMap())
        function onRender(node) {
            store.rootNode = node
        }
        function onOuterClick(e) {
            const r = store.rootNode.getBoundingClientRect()
            if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) {
                window.removeEventListener('click', onOuterClick)
                collapseList()
            }
        }
        function onTextInput(e) {
            const text = e.target
                .value
                .toLowerCase()
                .trim()
            expandList()
            values.some((value) => {
                if (value.toLowerCase().indexOf(text) === 0) {
                    scrollToValue(value)
                    return true
                }
            })
        }
        function onKeyPress(e) {
            const input = e.target
            if (e.key === 'Enter') {
                const value = input.value
                input.blur()
                collapseList()
                props.onChange(value)
            }
        }
        function scrollToValue(value) {
            setState({ focusedIndex: values.indexOf(value) })
        }
        function onExpandClick() {
            if (state.isExpanded) {
                collapseList()
            }
            else {
                expandList()
            }
        }
        function expandList() {
            setState({ isExpanded: true })
            scrollToValue(props.value)
            window.addEventListener('click', onOuterClick)
        }
        function collapseList() {
            setState({ isExpanded: false })
        }
        function onSelectOption(e) {
            let current = e.target
            while (current && !nodesValues.has(current)) {
                current = current.parentElement
            }
            if (current) {
                const value = nodesValues.get(current)
                props.onChange(value)
            }
            collapseList()
        }
        function saveValueNode(value, domNode) {
            valueNodes.set(value, domNode)
            nodesValues.set(domNode, value)
        }
        function removeValueNode(value) {
            const el = valueNodes.get(value)
            valueNodes.delete(value)
            nodesValues.delete(el)
        }
        return (m("span", {
            class: [
                'select',
                state.isExpanded && 'select--expanded',
                props.class,
            ], onrender: onRender
        },
            m("span", { class: "select__line" },
                m(TextBox, { class: "select__textbox", value: props.value, oninput: onTextInput, onkeypress: onKeyPress }),
                m(Button, { class: "select__expand", onclick: onExpandClick },
                    m("span", { class: "select__expand__icon" }))),
            m(VirtualScroll, {
                root: m("span", {
                    class: {
                        'select__list': true,
                        'select__list--expanded': state.isExpanded,
                        'select__list--short': Object.keys(props.options).length <= 7,
                    }, onclick: onSelectOption
                }), items: Object.entries(props.options).map(([value, content]) => (m("span", { class: "select__option", data: value, onrender: (domNode) => saveValueNode(value, domNode), onremove: () => removeValueNode(value) }, content))), scrollToIndex: state.focusedIndex
            })))
    }
    var Select$1 = withState(Select)

    /**
     * Displays a shortcut and navigates
     * to Chrome Commands page on click.
     */
    function ShortcutLink(props) {
        const cls = mergeClass('shortcut', props.class)
        const shortcut = props.shortcuts[props.commandName]
        const shortcutMessage = props.textTemplate(shortcut)
        let enteringShortcutInProgress = false
        function startEnteringShortcut(node) {
            if (enteringShortcutInProgress) {
                return
            }
            enteringShortcutInProgress = true
            const initialText = node.textContent
            node.textContent = '...⌨'
            function onKeyDown(e) {
                e.preventDefault()
                const ctrl = e.ctrlKey
                const alt = e.altKey
                const command = e.metaKey
                const shift = e.shiftKey
                let key = null
                if (e.code.startsWith('Key')) {
                    key = e.code.substring(3)
                }
                else if (e.code.startsWith('Digit')) {
                    key = e.code.substring(5)
                }
                const shortcut = `${ctrl ? 'Ctrl+' : alt ? 'Alt+' : command ? 'Command+' : ''}${shift ? 'Shift+' : ''}${key ? key : ''}`
                node.textContent = shortcut
                if ((ctrl || alt || command || shift) && key) {
                    removeListeners()
                    props.onSetShortcut(shortcut)
                    node.blur()
                    setTimeout(() => {
                        enteringShortcutInProgress = false
                        node.classList.remove('shortcut--edit')
                        node.textContent = props.textTemplate(shortcut)
                    }, 500)
                }
            }
            function onBlur() {
                removeListeners()
                node.classList.remove('shortcut--edit')
                node.textContent = initialText
                enteringShortcutInProgress = false
            }
            function removeListeners() {
                window.removeEventListener('keydown', onKeyDown, true)
                window.removeEventListener('blur', onBlur, true)
            }
            window.addEventListener('keydown', onKeyDown, true)
            window.addEventListener('blur', onBlur, true)
            node.classList.add('shortcut--edit')
        }
        function onClick(e) {
            e.preventDefault()
            if (isFirefox()) {
                startEnteringShortcut(e.target)
                return
            }
            if (isEdge()) {
                chrome.tabs.create({
                    url: `edge://extensions/shortcuts`,
                    active: true
                })
                return
            }
            chrome.tabs.create({
                url: `chrome://extensions/configureCommands#command-${chrome.runtime.id}-${props.commandName}`,
                active: true
            })
        }
        function onRender(node) {
            node.textContent = shortcutMessage
        }
        return (m("a", { class: cls, href: "#", onclick: onClick, oncreate: onRender }))
    }

    function throttle$1(callback) {
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

    function stickToStep(x, step) {
        const s = Math.round(x / step) * step
        const exp = Math.floor(Math.log10(step))
        if (exp >= 0) {
            const m = Math.pow(10, exp)
            return Math.round(s / m) * m
        }
        else {
            const m = Math.pow(10, -exp)
            return Math.round(s * m) / m
        }
    }
    function Slider(props) {
        const context = getComponentContext()
        const store = context.store
        store.activeProps = props
        function onRootCreate(rootNode) {
            rootNode.addEventListener('touchstart', onPointerDown, { passive: true })
        }
        function saveTrackNode(el) {
            store.trackNode = el
        }
        function getTrackNode() {
            return store.trackNode
        }
        function saveThumbNode(el) {
            store.thumbNode = el
        }
        function getThumbNode() {
            return store.thumbNode
        }
        function onPointerDown(startEvt) {
            if (store.isActive) {
                return
            }
            const { getClientX, pointerMoveEvent, pointerUpEvent, } = (() => {
                const isTouchEvent = typeof TouchEvent !== 'undefined' &&
                    startEvt instanceof TouchEvent
                const touchId = isTouchEvent
                    ? startEvt.changedTouches[0].identifier
                    : null
                function getTouch(e) {
                    const find = (touches) => Array.from(touches).find((t) => t.identifier === touchId)
                    return find(e.changedTouches) || find(e.touches)
                }
                function getClientX(e) {
                    const { clientX } = isTouchEvent
                        ? getTouch(e)
                        : e
                    return clientX
                }
                const pointerMoveEvent = isTouchEvent ? 'touchmove' : 'mousemove'
                const pointerUpEvent = isTouchEvent ? 'touchend' : 'mouseup'
                return { getClientX, pointerMoveEvent, pointerUpEvent }
            })()
            const dx = (() => {
                const thumbRect = getThumbNode().getBoundingClientRect()
                const startClientX = getClientX(startEvt)
                const isThumbPressed = startClientX >= thumbRect.left && startClientX <= thumbRect.right
                return isThumbPressed ? (thumbRect.left + thumbRect.width / 2 - startClientX) : 0
            })()
            function getEventValue(e) {
                const { min, max } = store.activeProps
                const clientX = getClientX(e)
                const rect = getTrackNode().getBoundingClientRect()
                const scaled = scale(clientX + dx, rect.left, rect.right, min, max)
                const clamped = clamp(scaled, min, max)
                return clamped
            }
            function onPointerMove(e) {
                const value = getEventValue(e)
                store.activeValue = value
                context.refresh()
            }
            function onPointerUp(e) {
                unsubscribe()
                const value = getEventValue(e)
                store.isActive = false
                context.refresh()
                store.activeValue = null
                const { onChange, step } = store.activeProps
                onChange(stickToStep(value, step))
            }
            function onKeyPress(e) {
                if (e.key === 'Escape') {
                    unsubscribe()
                    store.isActive = false
                    store.activeValue = null
                    context.refresh()
                }
            }
            function subscribe() {
                window.addEventListener(pointerMoveEvent, onPointerMove, { passive: true })
                window.addEventListener(pointerUpEvent, onPointerUp, { passive: true })
                window.addEventListener('keypress', onKeyPress)
            }
            function unsubscribe() {
                window.removeEventListener(pointerMoveEvent, onPointerMove)
                window.removeEventListener(pointerUpEvent, onPointerUp)
                window.removeEventListener('keypress', onKeyPress)
            }
            subscribe()
            store.isActive = true
            store.activeValue = getEventValue(startEvt)
            context.refresh()
        }
        function getValue() {
            return store.activeValue == null ? props.value : store.activeValue
        }
        const percent = scale(getValue(), props.min, props.max, 0, 100)
        const thumbPositionStyleValue = `${percent}%`
        const shouldFlipText = percent > 75
        const formattedValue = props.formatValue(stickToStep(getValue(), props.step))
        function scaleWheelDelta(delta) {
            return scale(delta, 0, -1000, 0, props.max - props.min)
        }
        const refreshOnWheel = throttle$1(() => {
            store.activeValue = stickToStep(store.wheelValue, props.step)
            store.wheelTimeoutId = setTimeout(() => {
                const { onChange } = store.activeProps
                onChange(store.activeValue)
                store.isActive = false
                store.activeValue = null
                store.wheelValue = null
            }, 400)
            context.refresh()
        })
        function onWheel(event) {
            if (store.wheelValue == null) {
                store.wheelValue = getValue()
            }
            store.isActive = true
            clearTimeout(store.wheelTimeoutId)
            event.preventDefault()
            const accumulatedValue = store.wheelValue + scaleWheelDelta(event.deltaY)
            store.wheelValue = clamp(accumulatedValue, props.min, props.max)
            refreshOnWheel()
        }
        return (m("span", { class: { 'slider': true, 'slider--active': store.isActive }, oncreate: onRootCreate, onmousedown: onPointerDown, onwheel: onWheel },
            m("span", { class: "slider__track", oncreate: saveTrackNode },
                m("span", { class: "slider__track__fill", style: { width: thumbPositionStyleValue } })),
            m("span", { class: "slider__thumb-wrapper" },
                m("span", { class: "slider__thumb", oncreate: saveThumbNode, style: { left: thumbPositionStyleValue } },
                    m("span", {
                        class: {
                            'slider__thumb__value': true,
                            'slider__thumb__value--flip': shouldFlipText,
                        }
                    }, formattedValue)))))
    }

    function Tab({ isActive }, ...children) {
        const tabCls = {
            'tab-panel__tab': true,
            'tab-panel__tab--active': isActive
        }
        return (m("div", { class: tabCls }, children))
    }

    function TabPanel(props) {
        const tabsNames = Object.keys(props.tabs)
        function isActiveTab(name, index) {
            return (name == null
                ? index === 0
                : name === props.activeTab)
        }
        const buttons = tabsNames.map((name, i) => {
            const btnCls = {
                'tab-panel__button': true,
                'tab-panel__button--active': isActiveTab(name, i)
            }
            return (m(Button, { class: btnCls, onclick: () => props.onSwitchTab(name) }, props.tabLabels[name]))
        })
        const tabs = tabsNames.map((name, i) => (m(Tab, { isActive: isActiveTab(name, i) }, props.tabs[name])))
        return (m("div", { class: "tab-panel" },
            m("div", { class: "tab-panel__buttons" }, buttons),
            m("div", { class: "tab-panel__tabs" }, tabs)))
    }

    function TextList(props) {
        const context = getComponentContext()
        context.store.indices = context.store.indices || new WeakMap()
        function onTextChange(e) {
            const index = context.store.indices.get(e.target)
            const values = props.values.slice()
            const value = e.target.value.trim()
            if (values.indexOf(value) >= 0) {
                return
            }
            if (!value) {
                values.splice(index, 1)
            }
            else if (index === values.length) {
                values.push(value)
            }
            else {
                values.splice(index, 1, value)
            }
            props.onChange(values)
        }
        function createTextBox(text, index) {
            const saveIndex = (node) => context.store.indices.set(node, index)
            return (m(TextBox, { class: "text-list__textbox", value: text, onrender: saveIndex, placeholder: props.placeholder }))
        }
        let shouldFocus = false
        const node = context.node
        const prevProps = context.prev ? context.prev.props : null
        if (node && props.isFocused && (!prevProps ||
            !prevProps.isFocused ||
            prevProps.values.length < props.values.length)) {
            focusLastNode()
        }
        function didMount(node) {
            context.store.node = node
            if (props.isFocused) {
                focusLastNode()
            }
        }
        function focusLastNode() {
            const node = context.store.node
            shouldFocus = true
            requestAnimationFrame(() => {
                const inputs = node.querySelectorAll('.text-list__textbox')
                const last = inputs.item(inputs.length - 1)
                last.focus()
            })
        }
        return (m(VirtualScroll, {
            root: (m("div", { class: ['text-list', props.class], onchange: onTextChange, oncreate: didMount })), items: props.values
                .map(createTextBox)
                .concat(createTextBox('', props.values.length)), scrollToIndex: shouldFocus ? props.values.length : -1
        }))
    }

    function getLocalMessage(messageName) {
        return chrome.i18n.getMessage(messageName)
    }
    function getUILanguage() {
        const code = chrome.i18n.getUILanguage()
        if (code.endsWith('-mac')) {
            return code.substring(0, code.length - 4)
        }
        return code
    }

    function parseTime($time) {
        const parts = $time.split(':').slice(0, 2)
        const lowercased = $time.trim().toLowerCase()
        const isAM = lowercased.endsWith('am') || lowercased.endsWith('a.m.')
        const isPM = lowercased.endsWith('pm') || lowercased.endsWith('p.m.')
        let hours = parts.length > 0 ? parseInt(parts[0]) : 0
        if (isNaN(hours) || hours > 23) {
            hours = 0
        }
        if (isAM && hours === 12) {
            hours = 0
        }
        if (isPM && hours < 12) {
            hours += 12
        }
        let minutes = parts.length > 1 ? parseInt(parts[1]) : 0
        if (isNaN(minutes) || minutes > 59) {
            minutes = 0
        }
        return [hours, minutes]
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

    const is12H = (new Date()).toLocaleTimeString(getUILanguage()).endsWith('M')
    function toLocaleTime($time) {
        const [hours, minutes] = parseTime($time)
        const mm = `${minutes < 10 ? '0' : ''}${minutes}`
        if (is12H) {
            const h = (hours === 0 ?
                '12' :
                hours > 12 ?
                    (hours - 12) :
                    hours)
            return `${h}:${mm}${hours < 12 ? 'AM' : 'PM'}`
        }
        return `${hours}:${mm}`
    }
    function to24HTime($time) {
        const [hours, minutes] = parseTime($time)
        const mm = `${minutes < 10 ? '0' : ''}${minutes}`
        return `${hours}:${mm}`
    }
    function TimeRangePicker(props) {
        function onStartTimeChange($startTime) {
            props.onChange([to24HTime($startTime), props.endTime])
        }
        function onEndTimeChange($endTime) {
            props.onChange([props.startTime, to24HTime($endTime)])
        }
        function setStartTime(node) {
            node.value = toLocaleTime(props.startTime)
        }
        function setEndTime(node) {
            node.value = toLocaleTime(props.endTime)
        }
        return (m("span", { class: "time-range-picker" },
            m(TextBox, {
                class: "time-range-picker__input time-range-picker__input--start", placeholder: toLocaleTime('18:00'), onrender: setStartTime, onchange: (e) => onStartTimeChange(e.target.value), onkeypress: (e) => {
                    if (e.key === 'Enter') {
                        const input = e.target
                        input.blur()
                        onStartTimeChange(input.value)
                    }
                }
            }),
            m(TextBox, {
                class: "time-range-picker__input time-range-picker__input--end", placeholder: toLocaleTime('9:00'), onrender: setEndTime, onchange: (e) => onEndTimeChange(e.target.value), onkeypress: (e) => {
                    if (e.key === 'Enter') {
                        const input = e.target
                        input.blur()
                        onEndTimeChange(input.value)
                    }
                }
            })))
    }

    function Toggle(props) {
        const { checked, onChange } = props
        const cls = [
            'toggle',
            checked ? 'toggle--checked' : null,
            props.class,
        ]
        const clsOn = {
            'toggle__btn': true,
            'toggle__on': true,
            'toggle__btn--active': checked
        }
        const clsOff = {
            'toggle__btn': true,
            'toggle__off': true,
            'toggle__btn--active': !checked
        }
        return (m("span", { class: cls },
            m("span", { class: clsOn, onclick: onChange ? () => !checked && onChange(true) : null }, props.labelOn),
            m("span", { class: clsOff, onclick: onChange ? () => checked && onChange(false) : null }, props.labelOff)))
    }

    function Track(props) {
        const valueStyle = { 'width': `${props.value * 100}%` }
        const isClickable = props.onChange != null
        function onMouseDown(e) {
            const targetNode = e.currentTarget
            const valueNode = targetNode.firstElementChild
            targetNode.classList.add('track--active')
            function getValue(clientX) {
                const rect = targetNode.getBoundingClientRect()
                return (clientX - rect.left) / rect.width
            }
            function setWidth(value) {
                valueNode.style.width = `${value * 100}%`
            }
            function onMouseMove(e) {
                const value = getValue(e.clientX)
                setWidth(value)
            }
            function onMouseUp(e) {
                const value = getValue(e.clientX)
                props.onChange(value)
                cleanup()
            }
            function onKeyPress(e) {
                if (e.key === 'Escape') {
                    setWidth(props.value)
                    cleanup()
                }
            }
            function cleanup() {
                window.removeEventListener('mousemove', onMouseMove)
                window.removeEventListener('mouseup', onMouseUp)
                window.removeEventListener('keypress', onKeyPress)
                targetNode.classList.remove('track--active')
            }
            window.addEventListener('mousemove', onMouseMove)
            window.addEventListener('mouseup', onMouseUp)
            window.addEventListener('keypress', onKeyPress)
            const value = getValue(e.clientX)
            setWidth(value)
        }
        return (m("span", {
            class: {
                'track': true,
                'track--clickable': Boolean(props.onChange),
            }, onmousedown: isClickable ? onMouseDown : null
        },
            m("span", { class: "track__value", style: valueStyle }),
            m("label", { class: "track__label" }, props.label)))
    }

    function UpDown(props) {
        const buttonDownCls = {
            'updown__button': true,
            'updown__button--disabled': props.value === props.min
        }
        const buttonUpCls = {
            'updown__button': true,
            'updown__button--disabled': props.value === props.max
        }
        function normalize(x) {
            const s = Math.round(x / props.step) * props.step
            const exp = Math.floor(Math.log10(props.step))
            if (exp >= 0) {
                const m = Math.pow(10, exp)
                return Math.round(s / m) * m
            }
            else {
                const m = Math.pow(10, -exp)
                return Math.round(s * m) / m
            }
        }
        function clamp(x) {
            return Math.max(props.min, Math.min(props.max, x))
        }
        function onButtonDownClick() {
            props.onChange(clamp(normalize(props.value - props.step)))
        }
        function onButtonUpClick() {
            props.onChange(clamp(normalize(props.value + props.step)))
        }
        function onTrackValueChange(trackValue) {
            props.onChange(clamp(normalize(trackValue * (props.max - props.min) + props.min)))
        }
        const trackValue = (props.value - props.min) / (props.max - props.min)
        const valueText = (props.value === props.default
            ? getLocalMessage('off').toLocaleLowerCase()
            : props.value > props.default
                ? `+${normalize(props.value - props.default)}`
                : `-${normalize(props.default - props.value)}`)
        return (m("div", { class: "updown" },
            m("div", { class: "updown__line" },
                m(Button, { class: buttonDownCls, onclick: onButtonDownClick },
                    m("span", { class: "updown__icon updown__icon-down" })),
                m(Track, { value: trackValue, label: props.name, onChange: onTrackValueChange }),
                m(Button, { class: buttonUpCls, onclick: onButtonUpClick },
                    m("span", { class: "updown__icon updown__icon-up" }))),
            m("label", { class: "updown__value-text" }, valueText)))
    }

    function CustomSettingsToggle({ data, tab, actions }) {
        const host = getURLHostOrProtocol(tab.url)
        const isCustom = data.settings.customThemes.some(({ url }) => isURLInList(tab.url, url))
        const urlText = host
            .split('.')
            .reduce((elements, part, i) => elements.concat(m("wbr", null), `${i > 0 ? '.' : ''}${part}`), [])
        return (m(Button, {
            class: {
                'custom-settings-toggle': true,
                'custom-settings-toggle--checked': isCustom,
                'custom-settings-toggle--disabled': tab.isProtected,
            }, onclick: (e) => {
                if (isCustom) {
                    const filtered = data.settings.customThemes.filter(({ url }) => !isURLInList(tab.url, url))
                    actions.changeSettings({ customThemes: filtered })
                }
                else {
                    const extended = data.settings.customThemes.concat({
                        url: [host],
                        theme: { ...data.settings.theme },
                    })
                    actions.changeSettings({ customThemes: extended })
                    e.currentTarget.classList.add('custom-settings-toggle--checked')
                }
            }
        }, m("span", { class: "custom-settings-toggle__wrapper" },
            getLocalMessage('only_for'),
            " ",
            m("span", { class: "custom-settings-toggle__url" }, urlText))))
    }

    function ModeToggle({ mode, onChange }) {
        return (m("div", { class: "mode-toggle" },
            m("div", { class: "mode-toggle__line" },
                m(Button, { class: { 'mode-toggle__button--active': mode === 1 }, onclick: () => onChange(1) },
                    m("span", { class: "icon icon--dark-mode" })),
                m(Toggle, { checked: mode === 1, labelOn: getLocalMessage('dark'), labelOff: getLocalMessage('light'), onChange: (checked) => onChange(checked ? 1 : 0) }),
                m(Button, { class: { 'mode-toggle__button--active': mode === 0 }, onclick: () => onChange(0) },
                    m("span", { class: "icon icon--light-mode" }))),
            m("label", { class: "mode-toggle__label" }, getLocalMessage('mode'))))
    }

    function FilterSettings({ data, actions, tab }) {
        const custom = data.settings.customThemes.find(({ url }) => isURLInList(tab.url, url))
        const filterConfig = custom ? custom.theme : data.settings.theme
        function setConfig(config) {
            if (custom) {
                custom.theme = { ...custom.theme, ...config }
                actions.changeSettings({ customThemes: data.settings.customThemes })
            }
            else {
                actions.setTheme(config)
            }
        }
        const brightness = (m(UpDown, { value: filterConfig.brightness, min: 50, max: 150, step: 5, default: 100, name: getLocalMessage('brightness'), onChange: (value) => setConfig({ brightness: value }) }))
        const contrast = (m(UpDown, { value: filterConfig.contrast, min: 50, max: 150, step: 5, default: 100, name: getLocalMessage('contrast'), onChange: (value) => setConfig({ contrast: value }) }))
        const grayscale = (m(UpDown, { value: filterConfig.grayscale, min: 0, max: 100, step: 5, default: 0, name: getLocalMessage('grayscale'), onChange: (value) => setConfig({ grayscale: value }) }))
        const sepia = (m(UpDown, { value: filterConfig.sepia, min: 0, max: 100, step: 5, default: 0, name: getLocalMessage('sepia'), onChange: (value) => setConfig({ sepia: value }) }))
        return (m("section", { class: "filter-settings" },
            m(ModeToggle, { mode: filterConfig.mode, onChange: (mode) => setConfig({ mode }) }),
            brightness,
            contrast,
            sepia,
            grayscale,
        ))
    }

    function SunMoonIcon({ date, latitude, longitude }) {
        if (latitude == null || longitude == null) {
            return (m("svg", { viewBox: "0 0 16 16" },
                m("text", { fill: "white", "font-size": "16", "font-weight": "bold", "text-anchor": "middle", x: "8", y: "14" }, "?")))
        }
        if (isNightAtLocation(date, latitude, longitude)) {
            return (m("svg", { viewBox: "0 0 16 16" },
                m("path", { fill: "white", stroke: "none", d: "M 6 3 Q 10 8 6 13 Q 12 13 12 8 Q 12 3 6 3" })))
        }
        return (m("svg", { viewBox: "0 0 16 16" },
            m("circle", { fill: "white", stroke: "none", cx: "8", cy: "8", r: "3" }),
            m("g", { fill: "none", stroke: "white", "stroke-linecap": "round", "stroke-width": "1.5" }, (Array.from({ length: 8 }).map((_, i) => {
                const cx = 8
                const cy = 8
                const angle = i * Math.PI / 4 + Math.PI / 8
                const pt = [5, 6].map((l) => [
                    cx + l * Math.cos(angle),
                    cy + l * Math.sin(angle),
                ])
                return (m("line", { x1: pt[0][0], y1: pt[0][1], x2: pt[1][0], y2: pt[1][1] }))
            })))))
    }

    function SystemIcon() {
        return (m("svg", { viewBox: "0 0 16 16" },
            m("path", { fill: "white", stroke: "none", d: "M3,3 h10 v7 h-3 v2 h1 v1 h-6 v-1 h1 v-2 h-3 z M4.5,4.5 v4 h7 v-4 z" })))
    }

    function WatchIcon({ hours, minutes }) {
        const cx = 8
        const cy = 8.5
        const lenHour = 3
        const lenMinute = 4
        const clockR = 5.5
        const btnSize = 2
        const btnPad = 1.5
        const ah = ((hours > 11 ? hours - 12 : hours) + minutes / 60) / 12 * Math.PI * 2
        const am = minutes / 60 * Math.PI * 2
        const hx = cx + lenHour * Math.sin(ah)
        const hy = cy - lenHour * Math.cos(ah)
        const mx = cx + lenMinute * Math.sin(am)
        const my = cy - lenMinute * Math.cos(am)
        return (m("svg", { viewBox: "0 0 16 16" },
            m("circle", { fill: "none", stroke: "white", "stroke-width": "1.5", cx: cx, cy: cy, r: clockR }),
            m("line", { stroke: "white", "stroke-width": "1.5", x1: cx, y1: cy, x2: hx, y2: hy }),
            m("line", { stroke: "white", "stroke-width": "1.5", opacity: "0.67", x1: cx, y1: cy, x2: mx, y2: my }),
            [30, -30].map((angle) => {
                return (m("path", { fill: "white", transform: `rotate(${angle})`, "transform-origin": `${cx} ${cy}`, d: `M${cx - btnSize},${cy - clockR - btnPad} a${btnSize},${btnSize} 0 0 1 ${2 * btnSize},0 z` }))
            })))
    }

    function CheckmarkIcon({ isChecked }) {
        return (m("svg", { viewBox: "0 0 8 8" },
            m("path", {
                d: (isChecked ?
                    'M1,4 l2,2 l4,-4 v1 l-4,4 l-2,-2 Z' :
                    'M2,2 l4,4 v1 l-4,-4 Z M2,6 l4,-4 v1 l-4,4 Z')
            })))
    }

    function SiteToggleButton({ data, tab, actions }) {
        function onSiteToggleClick() {
            if (pdf) {
                actions.changeSettings({ enableForPDF: !data.settings.enableForPDF })
            }
            else {
                actions.toggleURL(tab.url)
            }
        }
        const toggleHasEffect = (data.settings.enableForProtectedPages ||
            !tab.isProtected)
        const pdf = isPDF(tab.url)
        const isSiteEnabled = isURLEnabled(tab.url, data.settings, tab)
        const host = getURLHostOrProtocol(tab.url)
        const urlText = host
            .split('.')
            .reduce((elements, part, i) => elements.concat(m("wbr", null), `${i > 0 ? '.' : ''}${part}`), [])
        return (m(Button, {
            class: {
                'site-toggle': true,
                'site-toggle--active': isSiteEnabled,
                'site-toggle--disabled': !toggleHasEffect
            }, onclick: onSiteToggleClick
        },
            m("span", { class: "site-toggle__mark" },
                m(CheckmarkIcon, { isChecked: isSiteEnabled })),
            ' ',
            m("span", { class: "site-toggle__url" }, pdf ? 'PDF' : urlText)))
    }

    function MoreToggleSettings({ data, actions, isExpanded, onClose }) {
        const isSystemAutomation = data.settings.automation === 'system'
        const locationSettings = data.settings.location
        const values = {
            'latitude': {
                min: -90,
                max: 90
            },
            'longitude': {
                min: -180,
                max: 180,
            },
        }
        function getLocationString(location) {
            if (location == null) {
                return ''
            }
            return `${location}°`
        }
        function locationChanged(inputElement, newValue, type) {
            if (newValue.trim() === '') {
                inputElement.value = ''
                actions.changeSettings({
                    location: {
                        ...locationSettings,
                        [type]: null,
                    },
                })
                return
            }
            const min = values[type].min
            const max = values[type].max
            newValue = newValue.replace(',', '.').replace('°', '')
            let num = Number(newValue)
            if (isNaN(num)) {
                num = 0
            }
            else if (num > max) {
                num = max
            }
            else if (num < min) {
                num = min
            }
            inputElement.value = getLocationString(num)
            actions.changeSettings({
                location: {
                    ...locationSettings,
                    [type]: num,
                },
            })
        }
        return (m("div", {
            class: {
                'header__app-toggle__more-settings': true,
                'header__app-toggle__more-settings--expanded': isExpanded,
            }
        },
            m("div", { class: "header__app-toggle__more-settings__top" },
                m("span", { class: "header__app-toggle__more-settings__top__text" }, getLocalMessage('automation')),
                m("span", { class: "header__app-toggle__more-settings__top__close", role: "button", onclick: onClose }, "\u2715")),
            m("div", { class: "header__app-toggle__more-settings__content" },
                m("div", { class: "header__app-toggle__more-settings__line" },
                    m(CheckBox, { checked: data.settings.automation === 'time', onchange: (e) => actions.changeSettings({ automation: e.target.checked ? 'time' : '' }) }),
                    m(TimeRangePicker, { startTime: data.settings.time.activation, endTime: data.settings.time.deactivation, onChange: ([start, end]) => actions.changeSettings({ time: { activation: start, deactivation: end } }) })),
                m("p", { class: "header__app-toggle__more-settings__description" }, getLocalMessage('set_active_hours')),
                m("div", { class: "header__app-toggle__more-settings__line header__app-toggle__more-settings__location" },
                    m(CheckBox, { checked: data.settings.automation === 'location', onchange: (e) => actions.changeSettings({ automation: e.target.checked ? 'location' : '' }) }),
                    m(TextBox, {
                        class: "header__app-toggle__more-settings__location__latitude", placeholder: getLocalMessage('latitude'), onchange: (e) => locationChanged(e.target, e.target.value, 'latitude'), oncreate: (node) => node.value = getLocationString(locationSettings.latitude), onkeypress: (e) => {
                            if (e.key === 'Enter') {
                                e.target.blur()
                            }
                        }
                    }),
                    m(TextBox, {
                        class: "header__app-toggle__more-settings__location__longitude", placeholder: getLocalMessage('longitude'), onchange: (e) => locationChanged(e.target, e.target.value, 'longitude'), oncreate: (node) => node.value = getLocationString(locationSettings.longitude), onkeypress: (e) => {
                            if (e.key === 'Enter') {
                                e.target.blur()
                            }
                        }
                    })),
                m("p", { class: "header__app-toggle__more-settings__location-description" }, getLocalMessage('set_location')),
                m("div", {
                    class: [
                        'header__app-toggle__more-settings__line',
                        'header__app-toggle__more-settings__system-dark-mode',
                    ]
                },
                    m(CheckBox, { class: "header__app-toggle__more-settings__system-dark-mode__checkbox", checked: isSystemAutomation, onchange: (e) => actions.changeSettings({ automation: e.target.checked ? 'system' : '' }) }),
                    m(Button, {
                        class: {
                            'header__app-toggle__more-settings__system-dark-mode__button': true,
                            'header__app-toggle__more-settings__system-dark-mode__button--active': isSystemAutomation,
                        }, onclick: () => actions.changeSettings({ automation: isSystemAutomation ? '' : 'system' })
                    }, getLocalMessage('system_dark_mode'))),
                m("p", { class: "header__app-toggle__more-settings__description" }, getLocalMessage('system_dark_mode_description')))))
    }

    function multiline(...lines) {
        return lines.join('\n')
    }
    function Header({ data, actions, tab, onMoreToggleSettingsClick }) {
        function toggleExtension(enabled) {
            actions.changeSettings({
                enabled,
                automation: '',
            })
        }
        const isAutomation = Boolean(data.settings.automation)
        const isTimeAutomation = data.settings.automation === 'time'
        const isLocationAutomation = data.settings.automation === 'location'
        const now = new Date()
        return (m("header", { class: "header" },
            m("div", { class: "header__control header__app-toggle" },
                m(Toggle, { checked: data.isEnabled, labelOn: getLocalMessage('on'), labelOff: getLocalMessage('off'), onChange: toggleExtension }),
                m(ShortcutLink, {
                    commandName: "toggle", shortcuts: data.shortcuts, textTemplate: (hotkey) => (hotkey
                        ? multiline(getLocalMessage('toggle_extension'), hotkey)
                        : getLocalMessage('setup_hotkey_toggle_extension')), onSetShortcut: (shortcut) => actions.setShortcut('toggle', shortcut)
                }),
                m("span", { class: "header__app-toggle__more-button", onclick: onMoreToggleSettingsClick }),
                m("span", {
                    class: {
                        'header__app-toggle__time': true,
                        'header__app-toggle__time--active': isAutomation,
                    }
                }, (isTimeAutomation
                    ? m(WatchIcon, { hours: now.getHours(), minutes: now.getMinutes() })
                    : (isLocationAutomation
                        ? (m(SunMoonIcon, { date: now, latitude: data.settings.location.latitude, longitude: data.settings.location.longitude }))
                        : m(SystemIcon, null)))))))
    }

    function Loader({ complete = false }) {
        const { state, setState } = useState({ finished: false })
        return (m("div", {
            class: {
                'loader': true,
                'loader--complete': complete,
                'loader--transition-end': state.finished,
            }, ontransitionend: () => setState({ finished: true })
        },
            m("label", { class: "loader__message" }, getLocalMessage('loading_please_wait'))))
    }
    var Loader$1 = withState(Loader)

    const DONATE_URL = ''

    function AutomationPage(props) {
        const isSystemAutomation = props.data.settings.automation === 'system'
        const locationSettings = props.data.settings.location
        const values = {
            'latitude': {
                min: -90,
                max: 90
            },
            'longitude': {
                min: -180,
                max: 180,
            },
        }
        function getLocationString(location) {
            if (location == null) {
                return ''
            }
            return `${location}°`
        }
        function locationChanged(inputElement, newValue, type) {
            if (newValue.trim() === '') {
                inputElement.value = ''
                props.actions.changeSettings({
                    location: {
                        ...locationSettings,
                        [type]: null,
                    },
                })
                return
            }
            const min = values[type].min
            const max = values[type].max
            newValue = newValue.replace(',', '.').replace('°', '')
            let num = Number(newValue)
            if (isNaN(num)) {
                num = 0
            }
            else if (num > max) {
                num = max
            }
            else if (num < min) {
                num = min
            }
            inputElement.value = getLocationString(num)
            props.actions.changeSettings({
                location: {
                    ...locationSettings,
                    [type]: num,
                },
            })
        }
        return (m("div", { class: 'automation-page' },
            m("div", { class: "automation-page__line" },
                m(CheckBox, { checked: props.data.settings.automation === 'time', onchange: (e) => props.actions.changeSettings({ automation: e.target.checked ? 'time' : '' }) }),
                m(TimeRangePicker, { startTime: props.data.settings.time.activation, endTime: props.data.settings.time.deactivation, onChange: ([start, end]) => props.actions.changeSettings({ time: { activation: start, deactivation: end } }) })),
            m("p", { class: "automation-page__description" }, getLocalMessage('set_active_hours')),
            m("div", { class: "automation-page__line automation-page__location" },
                m(CheckBox, { checked: props.data.settings.automation === 'location', onchange: (e) => props.actions.changeSettings({ automation: e.target.checked ? 'location' : '' }) }),
                m(TextBox, {
                    class: "automation-page__location__latitude", placeholder: getLocalMessage('latitude'), onchange: (e) => locationChanged(e.target, e.target.value, 'latitude'), oncreate: (node) => node.value = getLocationString(locationSettings.latitude), onkeypress: (e) => {
                        if (e.key === 'Enter') {
                            e.target.blur()
                        }
                    }
                }),
                m(TextBox, {
                    class: "automation-page__location__longitude", placeholder: getLocalMessage('longitude'), onchange: (e) => locationChanged(e.target, e.target.value, 'longitude'), oncreate: (node) => node.value = getLocationString(locationSettings.longitude), onkeypress: (e) => {
                        if (e.key === 'Enter') {
                            e.target.blur()
                        }
                    }
                })),
            m("p", { class: "automation-page__location-description" }, getLocalMessage('set_location')),
            m("div", {
                class: [
                    'automation-page__line',
                    'automation-page__system-dark-mode',
                ]
            },
                m(CheckBox, { class: "automation-page__system-dark-mode__checkbox", checked: isSystemAutomation, onchange: (e) => props.actions.changeSettings({ automation: e.target.checked ? 'system' : '' }) }),
                m(Button, {
                    class: {
                        'automation-page__system-dark-mode__button': true,
                        'automation-page__system-dark-mode__button--active': isSystemAutomation,
                    }, onclick: () => props.actions.changeSettings({ automation: isSystemAutomation ? '' : 'system' })
                }, getLocalMessage('system_dark_mode'))),
            m("p", { class: "automation-page__description" }, getLocalMessage('system_dark_mode_description'))))
    }

    function ControlGroup(props, control, description) {
        return (m("span", { class: ['control-group', props.class] },
            control,
            description))
    }
    function Control(props, control) {
        return (m("span", { class: ['control-group__control', props.class] }, control))
    }
    function Description(props, description) {
        return (m("span", { class: ['control-group__description', props.class] }, description))
    }
    var ControlGroup$1 = Object.assign(ControlGroup, { Control, Description })

    function AppSwitch(props) {
        const isOn = props.data.settings.enabled === true && !props.data.settings.automation
        const isOff = props.data.settings.enabled === false && !props.data.settings.automation
        const isAutomation = Boolean(props.data.settings.automation)
        const isTimeAutomation = props.data.settings.automation === 'time'
        const isLocationAutomation = props.data.settings.automation === 'location'
        const now = new Date()
        const values = [
            getLocalMessage('on'),
            'Auto',
            getLocalMessage('off'),
        ]
        const value = isOn ? values[0] : isOff ? values[2] : values[1]
        function onSwitchChange(v) {
            const index = values.indexOf(v)
            if (index === 0) {
                props.actions.changeSettings({
                    enabled: true,
                    automation: '',
                })
            }
            else if (index === 2) {
                props.actions.changeSettings({
                    enabled: false,
                    automation: '',
                })
            }
            else if (index === 1) {
                props.actions.changeSettings({
                    automation: 'system',
                })
            }
        }
        const descriptionText = isOn ?
            'Extension is enabled' :
            isOff ?
                'Extension is disabled' :
                isTimeAutomation ?
                    'Switches according to specified time' :
                    isLocationAutomation ?
                        'Switched according to location' :
                        'Switches according to system dark mode'
        const description = (m("span", {
            class: {
                'app-switch__description': true,
                'app-switch__description--on': props.data.isEnabled,
                'app-switch__description--off': !props.data.isEnabled,
            }
        }, descriptionText))
        return (m(ControlGroup$1, { class: "app-switch" },
            m(ControlGroup$1.Control, null,
                m(MultiSwitch, { class: "app-switch__control", options: values, value: value, onChange: onSwitchChange },
                    m("span", {
                        class: {
                            'app-switch__time': true,
                            'app-switch__time--active': isAutomation,
                        }
                    }, (isTimeAutomation
                        ? m(WatchIcon, { hours: now.getHours(), minutes: now.getMinutes() })
                        : (isLocationAutomation
                            ? (m(SunMoonIcon, { date: now, latitude: props.data.settings.location.latitude, longitude: props.data.settings.location.longitude }))
                            : m(SystemIcon, null)))))),
            m(ControlGroup$1.Description, null, description)))
    }

    function HelpGroup() {
        return (m(ControlGroup$1, null,
            m(ControlGroup$1.Control, null,
                m("a", { class: "m-help-button", href: getHelpURL(), target: "_blank", rel: "noopener noreferrer" },
                    m("span", { class: "m-help-button__text" }, getLocalMessage('help'))))))
    }

    function SiteToggleGroup(props) {
        const isPageEnabled = isURLEnabled(props.tab.url, props.data.settings, props.tab)
        const descriptionText = isPDF(props.tab.url) ?
            isPageEnabled ?
                'Enabled for PDF files' :
                'Disabled for PDF files' :
            isPageEnabled ?
                'Enabled for current website' :
                'Disabled for current website'
        const description = (m("span", {
            class: {
                'site-toggle-group__description': true,
                'site-toggle-group__description--on': isPageEnabled,
                'site-toggle-group__description--off': !isPageEnabled,
            }
        }, descriptionText))
        return (m(ControlGroup$1, { class: "site-toggle-group" },
            m(ControlGroup$1.Control, { class: "site-toggle-group__control" },
                m(SiteToggleButton, Object.assign({}, props))),
            m(ControlGroup$1.Description, null, description)))
    }

    function ThemeControl(props, controls) {
        return (m("span", { class: "theme-control" },
            m("label", { class: "theme-control__label" }, props.label),
            controls))
    }

    function BackgroundColorEditor(props) {
        return (m(ThemeControl, { label: "Background" },
            m(ColorPicker$1, { color: props.value, onChange: props.onChange, canReset: props.canReset, onReset: props.onReset })))
    }

    function formatPercent(v) {
        return `${v}%`
    }

    function Brightness(props) {
        return (m(ThemeControl, { label: getLocalMessage('brightness') },
            m(Slider, { value: props.value, min: 50, max: 150, step: 1, formatValue: formatPercent, onChange: props.onChange })))
    }

    function Contrast(props) {
        return (m(ThemeControl, { label: getLocalMessage('contrast') },
            m(Slider, { value: props.value, min: 50, max: 150, step: 1, formatValue: formatPercent, onChange: props.onChange })))
    }

    function FontPicker(props) {
        return (m(ThemeControl, { label: "Font name" },
            m(Select$1, {
                class: {
                    'font-picker': true,
                    'font-picker--disabled': !props.theme.useFont,
                }, value: props.theme.fontFamily, onChange: props.onChange, options: props.fonts.reduce((map, font) => {
                    map[font] = (m("div", { style: { 'font-family': font } }, font))
                    return map
                }, {})
            })))
    }

    function Grayscale(props) {
        return (m(ThemeControl, { label: getLocalMessage('grayscale') },
            m(Slider, { value: props.value, min: 0, max: 100, step: 1, formatValue: formatPercent, onChange: props.onChange })))
    }

    var ThemeEngines = {
        cssFilter: 'cssFilter',
        svgFilter: 'svgFilter',
        staticTheme: 'staticTheme',
        dynamicTheme: 'dynamicTheme',
    }

    function Mode(props) {
        function openCSSEditor() {
            chrome.windows.create({
                type: 'panel',
                url: isFirefox() ? '../stylesheet-editor/index.html' : 'ui/stylesheet-editor/index.html',
                width: 600,
                height: 600,
            })
        }
        const modes = [
            { id: ThemeEngines.dynamicTheme, content: getLocalMessage('engine_dynamic') },
            { id: ThemeEngines.cssFilter, content: getLocalMessage('engine_filter') },
            { id: ThemeEngines.svgFilter, content: getLocalMessage('engine_filter_plus') },
            { id: ThemeEngines.staticTheme, content: getLocalMessage('engine_static') },
        ]
        return (m(ThemeControl, { label: "Mode" },
            m("div", { class: "mode-control-container" },
                m(DropDown, { selected: modes.find((m) => m.id === props.mode).id, options: modes, onChange: props.onChange }),
                m("span", {
                    class: {
                        'static-edit-button': true,
                        'static-edit-button--hidden': props.mode !== ThemeEngines.staticTheme,
                    }, onclick: openCSSEditor
                }))))
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

    function ResetButtonGroup(props) {
        function reset() {
            props.actions.setTheme(DEFAULT_SETTINGS.theme)
        }
        return (m(ControlGroup$1, null,
            m(ControlGroup$1.Control, null,
                m(ResetButton$1, { onClick: reset }, "Reset to defaults")),
            m(ControlGroup$1.Description, null, "Restore current theme values to defaults")))
    }

    function Scheme(props) {
        return (m(ThemeControl, { label: "Scheme" },
            m(DropDown, {
                selected: props.isDark, options: [
                    { id: true, content: getLocalMessage('dark') },
                    { id: false, content: getLocalMessage('light') },
                ], onChange: props.onChange
            })))
    }

    function ScrollbarEditor(props) {
        return (m(ThemeControl, { label: "Scrollbar" },
            m(ColorDropDown, { value: props.value, colorSuggestion: '#959799', onChange: props.onChange, onReset: props.onReset, hasAutoOption: true, hasDefaultOption: true })))
    }

    function SelectionColorEditor(props) {
        return (m(ThemeControl, { label: "Selection" },
            m(ColorDropDown, { value: props.value, colorSuggestion: '#005ccc', onChange: props.onChange, onReset: props.onReset, hasAutoOption: true, hasDefaultOption: true })))
    }

    function Sepia(props) {
        return (m(ThemeControl, { label: getLocalMessage('sepia') },
            m(Slider, { value: props.value, min: 0, max: 100, step: 1, formatValue: formatPercent, onChange: props.onChange })))
    }

    function StyleSystemControls(props) {
        const options = [{ id: true, content: 'Yes' }, { id: false, content: 'No' }]
        return (m(ThemeControl, { label: "Style system controls" },
            m(DropDown, { options: options, onChange: props.onChange, selected: props.value })))
    }

    function TextColorEditor(props) {
        return (m(ThemeControl, { label: "Text" },
            m(ColorPicker$1, { color: props.value, onChange: props.onChange, canReset: props.canReset, onReset: props.onReset })))
    }

    function TextStroke(props) {
        return (m(ThemeControl, { label: "Text stroke" },
            m(Slider, { value: props.value, min: 0, max: 1, step: 0.1, formatValue: String, onChange: props.onChange })))
    }

    function UseFont(props) {
        const options = [{ id: true, content: 'Yes' }, { id: false, content: 'No' }]
        return (m(ThemeControl, { label: "Change font" },
            m(DropDown, { options: options, onChange: props.onChange, selected: props.value })))
    }

    function hexify(number) {
        return ((number < 16 ? '0' : '') + number.toString(16))
    }
    function generateUID() {
        return Array.from(crypto.getRandomValues(new Uint8Array(16))).map((x) => hexify(x)).join('')
    }

    function PresetItem(props) {
        const context = getComponentContext()
        const store = context.store
        function onRemoveClick(e) {
            e.stopPropagation()
            store.isConfirmationVisible = true
            context.refresh()
        }
        function onConfirmRemoveClick() {
            const filtered = props.data.settings.presets.filter((p) => p.id !== props.preset.id)
            props.actions.changeSettings({ presets: filtered })
        }
        function onCancelRemoveClick() {
            store.isConfirmationVisible = false
            context.refresh()
        }
        const confirmation = store.isConfirmationVisible ? (m(MessageBox, { caption: `Are you sure you want to remove ${props.preset.name}?`, onOK: onConfirmRemoveClick, onCancel: onCancelRemoveClick })) : null
        return (m("span", { class: "theme-preset-picker__preset" },
            m("span", { class: "theme-preset-picker__preset__name" }, props.preset.name),
            m("span", { class: "theme-preset-picker__preset__remove-button", onclick: onRemoveClick }),
            confirmation))
    }
    const MAX_ALLOWED_PRESETS = 3
    function PresetPicker(props) {
        const host = getURLHostOrProtocol(props.tab.url)
        const preset = props.data.settings.presets.find(({ urls }) => isURLInList(props.tab.url, urls))
        const custom = props.data.settings.customThemes.find(({ url }) => isURLInList(props.tab.url, url))
        const selectedPresetId = custom ? 'custom' : preset ? preset.id : 'default'
        const defaultOption = { id: 'default', content: 'Theme for all websites' }
        const addNewPresetOption = props.data.settings.presets.length < MAX_ALLOWED_PRESETS ?
            { id: 'add-preset', content: '\uff0b Create new theme' } :
            null
        const userPresetsOptions = props.data.settings.presets.map((preset) => {
            if (preset.id === selectedPresetId) {
                return { id: preset.id, content: preset.name }
            }
            return {
                id: preset.id,
                content: m(PresetItem, Object.assign({}, props, { preset: preset }))
            }
        })
        const customSitePresetOption = {
            id: 'custom',
            content: `${selectedPresetId === 'custom' ? '\u2605' : '\u2606'} Theme for ${host}`,
        }
        const dropdownOptions = [
            defaultOption,
            ...userPresetsOptions,
            addNewPresetOption,
            customSitePresetOption,
        ].filter(Boolean)
        function onPresetChange(id) {
            const filteredCustomThemes = props.data.settings.customThemes.filter(({ url }) => !isURLInList(props.tab.url, url))
            const filteredPresets = props.data.settings.presets.map((preset) => {
                return {
                    ...preset,
                    urls: preset.urls.filter((template) => !isURLMatched(props.tab.url, template)),
                }
            })
            if (id === 'default') {
                props.actions.changeSettings({
                    customThemes: filteredCustomThemes,
                    presets: filteredPresets,
                })
            }
            else if (id === 'custom') {
                const extended = filteredCustomThemes.concat({
                    url: [host],
                    theme: { ...props.data.settings.theme },
                })
                props.actions.changeSettings({
                    customThemes: extended,
                    presets: filteredPresets,
                })
            }
            else if (id === 'add-preset') {
                let newPresetName
                for (let i = 0;i <= props.data.settings.presets.length;i++) {
                    newPresetName = `Theme ${i + 1}`
                    if (props.data.settings.presets.every((p) => p.name !== newPresetName)) {
                        break
                    }
                }
                const extended = filteredPresets.concat({
                    id: `preset-${generateUID()}`,
                    name: newPresetName,
                    urls: [host],
                    theme: { ...props.data.settings.theme },
                })
                props.actions.changeSettings({
                    customThemes: filteredCustomThemes,
                    presets: extended,
                })
            }
            else {
                const chosenPresetId = id
                const extended = filteredPresets.map((preset) => {
                    if (preset.id === chosenPresetId) {
                        return {
                            ...preset,
                            urls: preset.urls.concat(host)
                        }
                    }
                    return preset
                })
                props.actions.changeSettings({
                    customThemes: filteredCustomThemes,
                    presets: extended,
                })
            }
        }
        return (m(DropDown, { class: "theme-preset-picker", selected: selectedPresetId, options: dropdownOptions, onChange: onPresetChange }))
    }

    function getCurrentThemePreset(props) {
        const custom = props.data.settings.customThemes.find(({ url }) => isURLInList(props.tab.url, url))
        const preset = custom ? null : props.data.settings.presets.find(({ urls }) => isURLInList(props.tab.url, urls))
        const theme = custom ?
            custom.theme :
            preset ?
                preset.theme :
                props.data.settings.theme
        function setTheme(config) {
            if (custom) {
                custom.theme = { ...custom.theme, ...config }
                props.actions.changeSettings({
                    customThemes: props.data.settings.customThemes,
                })
            }
            else if (preset) {
                preset.theme = { ...preset.theme, ...config }
                props.actions.changeSettings({
                    presets: props.data.settings.presets,
                })
            }
            else {
                props.actions.setTheme(config)
            }
        }
        return {
            theme,
            change: setTheme,
        }
    }

    function ThemeControls(props) {
        const { theme, onChange } = props
        return (m("section", { class: "m-section m-theme-controls" },
            m(Brightness, { value: theme.brightness, onChange: (v) => onChange({ brightness: v }) }),
            m(Contrast, { value: theme.contrast, onChange: (v) => onChange({ contrast: v }) }),
            m(Scheme, { isDark: theme.mode === 1, onChange: (isDark) => onChange({ mode: isDark ? 1 : 0 }) }),
            m(Mode, { mode: theme.engine, onChange: (mode) => onChange({ engine: mode }) })))
    }
    function ThemeGroup(props) {
        const preset = getCurrentThemePreset(props)
        return (m("div", { class: "theme-group" },
            m("div", { class: "theme-group__presets-wrapper" },
                m(PresetPicker, Object.assign({}, props))),
            m("div", { class: "theme-group__controls-wrapper" },
                m(ThemeControls, { theme: preset.theme, onChange: preset.change }),
                m(Button, { class: "theme-group__more-button", onclick: props.onThemeNavClick }, "See all options")),
            m("label", { class: "theme-group__description" }, "Configure theme")))
    }

    function SwitchGroup(props) {
        return (m(Array, null,
            m(AppSwitch, Object.assign({}, props)),
            m(SiteToggleGroup, Object.assign({}, props))))
    }
    function SettingsNavButton(props) {
        return (m(ResetButton, { onClick: props.onClick },
            m("span", { class: "settings-button-icon" }),
            "Settings"))
    }
    function MainPage(props) {
        return (m(Array, null,
            m("section", { class: "m-section" },
                m(SwitchGroup, Object.assign({}, props))),
            m("section", { class: "m-section" },
                m(ThemeGroup, Object.assign({}, props))),
            m("section", { class: "m-section" },
                m(SettingsNavButton, { onClick: props.onSettingsNavClick }),
                m(HelpGroup, null))))
    }

    function Page(props, content) {
        return (m("div", { class: { 'page': true, 'page--active': props.active } },
            m("div", { class: "page__content" }, content),
            props.first ? null : (m(Button, { class: "page__back-button", onclick: props.onBackButtonClick }, "Back"))))
    }
    function PageViewer(props, ...pages) {
        return (m("div", { class: "page-viewer" }, pages.map((pageSpec, i) => {
            return {
                ...pageSpec,
                props: {
                    ...pageSpec.props,
                    active: props.activePage === pageSpec.props.id,
                    first: i === 0,
                    onBackButtonClick: props.onBackButtonClick,
                },
            }
        })))
    }

    function AutomationButton(props) {
        const now = new Date()
        return (m(ControlGroup$1, null,
            m(ControlGroup$1.Control, null,
                m(ResetButton, { onClick: props.onClick },
                    m("span", { class: "automation-button-icon" },
                        m(WatchIcon, { hours: now.getHours(), minutes: now.getMinutes() })),
                    "Automation")),
            m(ControlGroup$1.Description, null, "Configure when app is enabled")))
    }

    function getExistingDevToolsObject() {
        if (isMobile()) {
            return new Promise((resolve) => {
                chrome.tabs.query({}, (t) => {
                    for (const tab of t) {
                        if (tab.url.endsWith('ui/devtools/index.html')) {
                            resolve(tab)
                            return
                        }
                    }
                    resolve(null)
                })
            })
        }
        return new Promise((resolve) => {
            chrome.windows.getAll({
                populate: true,
                windowTypes: ['popup']
            }, (w) => {
                for (const window of w) {
                    if (window.tabs[0].url.endsWith('ui/devtools/index.html')) {
                        resolve(window)
                        return
                    }
                }
                resolve(null)
            })
        })
    }
    async function openDevTools() {
        const devToolsObject = await getExistingDevToolsObject()
        if (isMobile()) {
            if (devToolsObject) {
                chrome.tabs.update(devToolsObject.id, { 'active': true })
                window.close()
            }
            else {
                chrome.tabs.create({
                    url: '../devtools/index.html',
                })
                window.close()
            }
        }
        else {
            if (devToolsObject) {
                chrome.windows.update(devToolsObject.id, { 'focused': true })
            }
            else {
                chrome.windows.create({
                    type: 'popup',
                    url: isFirefox() ? '../devtools/index.html' : 'ui/devtools/index.html',
                    width: 600,
                    height: 600,
                })
            }
        }
    }
    function DevToolsGroup(props) {
        const globalThemeEngine = props.data.settings.theme.engine
        const devtoolsData = props.data.devtools
        const hasCustomFixes = ((globalThemeEngine === ThemeEngines.dynamicTheme && devtoolsData.hasCustomDynamicFixes) ||
            ([ThemeEngines.cssFilter, ThemeEngines.svgFilter].includes(globalThemeEngine) && devtoolsData.hasCustomFilterFixes) ||
            (globalThemeEngine === ThemeEngines.staticTheme && devtoolsData.hasCustomStaticFixes))
        return (m(ControlGroup$1, null,
            m(ControlGroup$1.Control, null,
                m(ResetButton, {
                    onClick: openDevTools, class: {
                        'dev-tools-button': true,
                        'dev-tools-button--has-custom-fixes': hasCustomFixes,
                    }
                },
                    "\uD83D\uDEE0 ",
                    getLocalMessage('open_dev_tools'))),
            m(ControlGroup$1.Description, null, "Make a fix for a website")))
    }

    function ManageSettingsButton(props) {
        return (m(ControlGroup$1, null,
            m(ControlGroup$1.Control, null,
                m(ResetButton, { onClick: props.onClick }, "Manage settings")),
            m(ControlGroup$1.Description, null, "Reset, export or import settings")))
    }

    function SiteListButton(props) {
        return (m(ControlGroup$1, null,
            m(ControlGroup$1.Control, null,
                m(ResetButton, { onClick: props.onClick },
                    m("span", { class: "site-list-button-icon" }),
                    "Site list")),
            m(ControlGroup$1.Description, null, "Enable or disable on listed websites")))
    }

    function CheckButton(props) {
        return (m(ControlGroup$1, { class: "check-button" },
            m(ControlGroup$1.Control, null,
                m(CheckBox, { class: "check-button__checkbox", checked: props.checked, onchange: (e) => props.onChange(e.target.checked) }, props.label)),
            m(ControlGroup$1.Description, { class: "check-button__description" }, props.description)))
    }

    function EnabledByDefaultGroup(props) {
        function onEnabledByDefaultChange(checked) {
            props.actions.changeSettings({ applyToListedOnly: !checked })
        }
        return (m(CheckButton, {
            checked: !props.data.settings.applyToListedOnly, label: "Enable by default", description: props.data.settings.applyToListedOnly ?
                'Disabled on all websites by default' :
                'Enabled on all websites by default', onChange: onEnabledByDefaultChange
        }))
    }

    function SettingsPage(props) {
        return (m("section", { class: "m-section" },
            m(EnabledByDefaultGroup, Object.assign({}, props)),
            m(SiteListButton, { onClick: props.onSiteListNavClick }),
            m(DevToolsGroup, Object.assign({}, props)),
            m(AutomationButton, { onClick: props.onAutomationNavClick }),
            m(ManageSettingsButton, { onClick: props.onManageSettingsClick })))
    }

    function SiteList(props) {
        const context = getComponentContext()
        const store = context.store
        if (!context.prev) {
            store.indices = new WeakMap()
            store.shouldFocusAtIndex = -1
            store.wasVisible = false
        }
        context.onRender((node) => {
            const isVisible = node.clientWidth > 0
            const { wasVisible } = store
            store.wasVisible = isVisible
            if (!wasVisible && isVisible) {
                store.shouldFocusAtIndex = props.siteList.length
                context.refresh()
            }
        })
        function onTextChange(e) {
            const index = store.indices.get(e.target)
            const values = props.siteList.slice()
            const value = e.target.value.trim()
            if (values.includes(value)) {
                return
            }
            if (!value) {
                values.splice(index, 1)
                store.shouldFocusAtIndex = index
            }
            else if (index === values.length) {
                values.push(value)
                store.shouldFocusAtIndex = index + 1
            }
            else {
                values.splice(index, 1, value)
                store.shouldFocusAtIndex = index + 1
            }
            props.onChange(values)
        }
        function removeValue(event) {
            const previousSibling = event.target.previousSibling
            const index = store.indices.get(previousSibling)
            const filtered = props.siteList.slice()
            filtered.splice(index, 1)
            store.shouldFocusAtIndex = index
            props.onChange(filtered)
        }
        function createTextBox(text, index) {
            const onRender = (node) => {
                store.indices.set(node, index)
                if (store.shouldFocusAtIndex === index) {
                    store.shouldFocusAtIndex = -1
                    node.focus()
                }
            }
            return (m("div", { class: "site-list__item" },
                m(TextBox, { class: "site-list__textbox", value: text, onrender: onRender, placeholder: "google.com/maps" }),
                m("span", { class: "site-list__item__remove", role: "button", onclick: removeValue })))
        }
        return (m("div", { class: "site-list" },
            m(VirtualScroll, {
                root: (m("div", { class: "site-list__v-scroll-root", onchange: onTextChange })), items: props.siteList
                    .map((site, index) => createTextBox(site, index))
                    .concat(createTextBox('', props.siteList.length)), scrollToIndex: store.shouldFocusAtIndex
            })))
    }

    function SiteListPage(props) {
        function onSiteListChange(sites) {
            props.actions.changeSettings({ siteList: sites })
        }
        function onInvertPDFChange(checked) {
            props.actions.changeSettings({ enableForPDF: checked })
        }
        function onEnableForProtectedPages(value) {
            props.actions.changeSettings({ enableForProtectedPages: value })
        }
        const label = props.data.settings.applyToListedOnly ?
            'Enable on these websites' :
            'Disable on these websites'
        return (m("div", { class: "site-list-page" },
            m("label", { class: "site-list-page__label" }, label),
            m(SiteList, { siteList: props.data.settings.siteList, onChange: onSiteListChange }),
            m("label", { class: "site-list-page__description" }, "Enter website name and press Enter"),
            isFirefox() ? null : m(CheckButton, {
                checked: props.data.settings.enableForPDF, label: "Enable for PDF files", description: props.data.settings.enableForPDF ?
                    'Enabled for PDF documents' :
                    'Disabled for PDF documents', onChange: onInvertPDFChange
            }),
            m(CheckButton, {
                checked: props.data.settings.enableForProtectedPages, onChange: onEnableForProtectedPages, label: 'Enable on restricted pages', description: props.data.settings.enableForProtectedPages ?
                    'You should enable it in browser flags too' :
                    'Disabled for web store and other pages'
            })))
    }

    function CollapsiblePanel({ }, ...groups) {
        const context = getComponentContext()
        const store = context.store
        if (store.activeGroup == null) {
            store.activeGroup = groups[0].props.id
        }
        return (m("div", { class: "collapsible-panel" }, groups.map((spec, i) => {
            const activeIndex = groups.findIndex((g) => store.activeGroup === g.props.id)
            const collapsed = i !== activeIndex
            const collapseTop = i < activeIndex
            const collapseBottom = i > activeIndex
            const onExpand = () => {
                store.activeGroup = spec.props.id
                context.refresh()
            }
            return {
                ...spec,
                props: {
                    ...spec.props,
                    collapsed,
                    collapseBottom,
                    collapseTop,
                    onExpand,
                },
            }
        })))
    }
    function Group(props, content) {
        return (m("div", {
            class: {
                'collapsible-panel__group': true,
                'collapsible-panel__group--collapsed': props.collapsed,
                'collapsible-panel__group--collapse-top': props.collapseTop,
                'collapsible-panel__group--collapse-bottom': props.collapseBottom,
            }
        },
            m("div", { class: "collapsible-panel__group__content" }, content),
            m("span", { role: "button", class: "collapsible-panel__group__expand-button", onclick: props.onExpand }, props.label)))
    }
    var Collapsible = Object.assign(CollapsiblePanel, { Group })

    function MainGroup({ theme, change }) {
        return (m(Array, null,
            m(Brightness, { value: theme.brightness, onChange: (v) => change({ brightness: v }) }),
            m(Contrast, { value: theme.contrast, onChange: (v) => change({ contrast: v }) }),
            m(Sepia, { value: theme.sepia, onChange: (v) => change({ sepia: v }) }),
            m(Grayscale, { value: theme.grayscale, onChange: (v) => change({ grayscale: v }) }),
            m(Scheme, { isDark: theme.mode === 1, onChange: (isDark) => change({ mode: isDark ? 1 : 0 }) }),
            m(Mode, { mode: theme.engine, onChange: (mode) => change({ engine: mode }) })))
    }
    function ColorsGroup({ theme, change }) {
        const isDarkScheme = theme.mode === 1
        const bgProp = isDarkScheme ? 'darkSchemeBackgroundColor' : 'lightSchemeBackgroundColor'
        const fgProp = isDarkScheme ? 'darkSchemeTextColor' : 'lightSchemeTextColor'
        const defaultSchemeColors = isDarkScheme ? DEFAULT_COLORS.darkScheme : DEFAULT_COLORS.lightScheme
        const defaultMatrixValues = { brightness: DEFAULT_THEME.brightness, contrast: DEFAULT_THEME.contrast, sepia: DEFAULT_THEME.sepia, grayscale: DEFAULT_THEME.grayscale }
        return (m(Array, null,
            m(BackgroundColorEditor, { value: theme[bgProp] === 'auto' ? defaultSchemeColors.background : theme[bgProp], onChange: (v) => change({ [bgProp]: v, ...defaultMatrixValues }), canReset: theme[bgProp] !== defaultSchemeColors.background, onReset: () => change({ [bgProp]: DEFAULT_SETTINGS.theme[bgProp] }) }),
            m(TextColorEditor, { value: theme[fgProp] === 'auto' ? defaultSchemeColors.text : theme[fgProp], onChange: (v) => change({ [fgProp]: v, ...defaultMatrixValues }), canReset: theme[fgProp] !== defaultSchemeColors.text, onReset: () => change({ [fgProp]: DEFAULT_SETTINGS.theme[fgProp] }) }),
            m(ScrollbarEditor, { value: theme.scrollbarColor, onChange: (v) => change({ scrollbarColor: v }), onReset: () => change({ scrollbarColor: DEFAULT_SETTINGS.theme.scrollbarColor }) }),
            m(SelectionColorEditor, { value: theme.selectionColor, onChange: (v) => change({ selectionColor: v }), onReset: () => change({ selectionColor: DEFAULT_SETTINGS.theme.selectionColor }) })))
    }
    function FontGroup({ theme, fonts, change }) {
        return (m(Array, null,
            m(UseFont, { value: theme.useFont, onChange: (useFont) => change({ useFont }) }),
            m(FontPicker, { theme: theme, fonts: fonts, onChange: (fontFamily) => change({ fontFamily }) }),
            m(TextStroke, { value: theme.textStroke, onChange: (textStroke) => change({ textStroke }) }),
            m(StyleSystemControls, { value: theme.styleSystemControls, onChange: (styleSystemControls) => change({ styleSystemControls }) })))
    }
    function ThemePage(props) {
        const { theme, change } = getCurrentThemePreset(props)
        return (m("section", { class: "m-section theme-page" },
            m(PresetPicker, Object.assign({}, props)),
            m(Collapsible, null,
                m(Collapsible.Group, { id: "main", label: "Brightness, contrast, mode" },
                    m(MainGroup, { theme: theme, change: change })),
                m(Collapsible.Group, { id: "colors", label: "Colors" },
                    m(ColorsGroup, { theme: theme, change: change })),
                m(Collapsible.Group, { id: "font", label: "Font & more" },
                    m(FontGroup, { theme: theme, fonts: props.data.fonts, change: change }))),
            m(ResetButtonGroup, Object.assign({}, props))))
    }

    function ResetButtonGroup$1(props) {
        const context = getComponentContext()
        function showDialog() {
            context.store.isDialogVisible = true
            context.refresh()
        }
        function hideDialog() {
            context.store.isDialogVisible = false
            context.refresh()
        }
        function reset() {
            context.store.isDialogVisible = false
            props.actions.changeSettings(DEFAULT_SETTINGS)
        }
        const dialog = context.store.isDialogVisible ? (m(MessageBox, { caption: "Are you sure you want to remove all your settings? You cannot restore them later", onOK: reset, onCancel: hideDialog })) : null
        return (m(ControlGroup$1, null,
            m(ControlGroup$1.Control, null,
                m(ResetButton$1, { onClick: showDialog },
                    "Reset settings",
                    dialog)),
            m(ControlGroup$1.Description, null, "Restore settings to defaults")))
    }

    function ImportButton(props) {
        function getValidatedObject(source, compare) {
            const result = {}
            if (source == null || typeof source !== 'object' || Array.isArray(source)) {
                return null
            }
            Object.keys(source).forEach((key) => {
                const value = source[key]
                if (value == null || compare[key] == null) {
                    return
                }
                const array1 = Array.isArray(value)
                const array2 = Array.isArray(compare[key])
                if (array1 || array2) {
                    if (array1 && array2) {
                        result[key] = value
                    }
                }
                else if (typeof value === 'object' && typeof compare[key] === 'object') {
                    result[key] = getValidatedObject(value, compare[key])
                }
                else if (typeof value === typeof compare[key]) {
                    result[key] = value
                }
            })
            return result
        }
        function importSettings() {
            openFile({ extensions: ['json'] }, (result) => {
                try {
                    const content = JSON.parse(result)
                    const result2 = getValidatedObject(content, DEFAULT_SETTINGS)
                    props.actions.changeSettings({ ...result2 })
                }
                catch (err) {
                    console.error(err)
                }
            })
        }
        return (m(ControlGroup$1, null,
            m(ControlGroup$1.Control, null,
                m(Button, { onclick: importSettings, class: "settings-button" }, "Import Settings")),
            m(ControlGroup$1.Description, null, "Open settings from a JSON file")))
    }

    function ExportButton(props) {
        function exportSettings() {
            saveFile('Dark-Mode-Settings.json', JSON.stringify(props.data.settings, null, 4))
        }
        return (m(ControlGroup$1, null,
            m(ControlGroup$1.Control, null,
                m(Button, { onclick: exportSettings, class: "settings-button" }, "Export Settings")),
            m(ControlGroup$1.Description, null, "Save settings to a JSON file")))
    }

    function SyncSettings(props) {
        function onSyncSettingsChange(checked) {
            props.actions.changeSettings({ syncSettings: checked })
        }
        return (m(CheckButton, {
            checked: props.data.settings.syncSettings, label: "Enable settings sync", description: props.data.settings.syncSettings ?
                'Synchronized across devices' :
                'Not synchronized across devices', onChange: onSyncSettingsChange
        }))
    }

    function ExportTheme() {
        const listener = ({ type, data }, sender) => {
            if (type === 'export-css-response') {
                const url = getURLHostOrProtocol(sender.tab.url).replace(/[^a-z0-1\-]/g, '-')
                saveFile(`darkmode-${url}.css`, data)
                chrome.runtime.onMessage.removeListener(listener)
            }
        }
        function exportCSS() {
            chrome.runtime.onMessage.addListener(listener)
            chrome.runtime.sendMessage({ type: 'request-export-css' })
        }
        return (m(ControlGroup$1, null,
            m(ControlGroup$1.Control, null,
                m(Button, { onclick: exportCSS, class: "settings-button" }, "Export Dynamic Theme")),
            m(ControlGroup$1.Description, null, "Save generated CSS to a file")))
    }

    function SyncConfigButton(props) {
        function syncConfig(syncSitesFixes) {
            props.actions.changeSettings({ syncSitesFixes })
            props.actions.loadConfig({ local: !syncSitesFixes })
        }
        return (m(CheckButton, { checked: props.data.settings.syncSitesFixes, label: "Synchronize sites fixes", description: "Load the latest sites fixes from a remote server", onChange: syncConfig }))
    }

    function ManageSettingsPage(props) {
        const custom = props.data.settings.customThemes.find(({ url }) => isURLInList(props.tab.url, url))
        const engine = custom ?
            custom.theme.engine :
            props.data.settings.theme.engine
        return (m("section", { class: "m-section" },
            m(SyncSettings, Object.assign({}, props)),
            m(SyncConfigButton, Object.assign({}, props)),
            m(ImportButton, Object.assign({}, props)),
            m(ExportButton, Object.assign({}, props)),
            engine === ThemeEngines.dynamicTheme ? m(ExportTheme, null) : null,
            m(ResetButtonGroup$1, Object.assign({}, props))))
    }

    function Logo() {
        return (m("a", { class: "m-logo", href: "", target: "_blank", rel: "noopener noreferrer" }, ""))
    }
    function Pages(props) {
        const context = getComponentContext()
        const store = context.store
        if (store.activePage == null) {
            store.activePage = 'main'
        }
        function onThemeNavClick() {
            store.activePage = 'theme'
            context.refresh()
        }
        function onSettingsNavClick() {
            store.activePage = 'settings'
            context.refresh()
        }
        function onAutomationNavClick() {
            store.activePage = 'automation'
            context.refresh()
        }
        function onManageSettingsClick() {
            store.activePage = 'manage-settings'
            context.refresh()
        }
        function onSiteListNavClick() {
            store.activePage = 'site-list'
            context.refresh()
        }
        function onBackClick() {
            const activePage = store.activePage
            const settingsPageSubpages = ['automation', 'manage-settings', 'site-list']
            if (settingsPageSubpages.includes(activePage)) {
                store.activePage = 'settings'
            }
            else {
                store.activePage = 'main'
            }
            context.refresh()
        }
        return (m(PageViewer, { activePage: store.activePage, onBackButtonClick: onBackClick },
            m(Page, { id: "main" },
                m(MainPage, Object.assign({}, props, { onThemeNavClick: onThemeNavClick, onSettingsNavClick: onSettingsNavClick }))),
            m(Page, { id: "theme" },
                m(ThemePage, Object.assign({}, props))),
            m(Page, { id: "settings" },
                m(SettingsPage, Object.assign({}, props, { onAutomationNavClick: onAutomationNavClick, onManageSettingsClick: onManageSettingsClick, onSiteListNavClick: onSiteListNavClick }))),
            m(Page, { id: "site-list" },
                m(SiteListPage, Object.assign({}, props))),
            m(Page, { id: "automation" },
                m(AutomationPage, Object.assign({}, props))),
            m(Page, { id: "manage-settings" },
                m(ManageSettingsPage, Object.assign({}, props)))))
    }
    function DonateGroup() {
        return (m("div", { class: "m-donate-group" },
            m("a", { class: "m-donate-button", href: DONATE_URL, target: "_blank", rel: "noopener noreferrer" },
                m("span", { class: "m-donate-button__text" }, getLocalMessage('donate'))),
            m("label", { class: "m-donate-description" }, "This project is sponsored by you")))
    }
    let appVersion
    function AppVersion() {
        if (!appVersion) {
            appVersion = chrome.runtime.getManifest().version
        }
        return (m("label", { class: "darkmode-version" },
            "Version 5 Preview (",
            appVersion,
            ")"))
    }
    function Body(props) {
        const context = getComponentContext()
        context.onCreate(() => {
            if (isMobile()) {
                window.addEventListener('contextmenu', (e) => e.preventDefault())
            }
        })
        context.onRemove(() => {
            document.documentElement.classList.remove('preview')
        })
        return (m("body", null,
            m("section", { class: "m-section" },
                m(Logo, null)),
            m("section", { class: "m-section pages-section" },
                m(Pages, Object.assign({}, props))),
            m("section", { class: "m-section" },
                m(DonateGroup, null)),
            m(AppVersion, null),
            m(Overlay$1, null)))
    }

    const engineNames = [
        [ThemeEngines.cssFilter, getLocalMessage('engine_filter')],
        [ThemeEngines.svgFilter, getLocalMessage('engine_filter_plus')],
        [ThemeEngines.staticTheme, getLocalMessage('engine_static')],
        [ThemeEngines.dynamicTheme, getLocalMessage('engine_dynamic')],
    ]
    function openCSSEditor() {
        chrome.windows.create({
            type: 'panel',
            url: isFirefox() ? '../stylesheet-editor/index.html' : 'ui/stylesheet-editor/index.html',
            width: 600,
            height: 600,
        })
    }
    function EngineSwitch({ engine, onChange }) {
        return (m("div", { class: "engine-switch" },
            m(MultiSwitch, { value: engineNames.find(([code]) => code === engine)[1], options: engineNames.map(([, name]) => name), onChange: (value) => onChange(engineNames.find(([, name]) => name === value)[0]) }),
            m("span", {
                class: {
                    'engine-switch__css-edit-button': true,
                    'engine-switch__css-edit-button_active': engine === ThemeEngines.staticTheme,
                }, onclick: openCSSEditor
            }),
            m("label", { class: "engine-switch__description" }, getLocalMessage('theme_generation_mode'))))
    }

    function FontSettings({ config, fonts, onChange }) {
        return (m("section", { class: "font-settings" },
            m("div", { class: "font-settings__font-select-container" },
                m("div", { class: "font-settings__font-select-container__line" },
                    m(CheckBox, { checked: config.useFont, onchange: (e) => onChange({ useFont: e.target.checked }) }),
                    m(Select$1, {
                        value: config.fontFamily, onChange: (value) => onChange({ fontFamily: value }), options: fonts.reduce((map, font) => {
                            map[font] = (m("div", { style: { 'font-family': font } }, font))
                            return map
                        }, {})
                    })),
                m("label", { class: "font-settings__font-select-container__label" }, getLocalMessage('select_font'))),
            m(UpDown, { value: config.textStroke, min: 0, max: 1, step: 0.1, default: 0, name: getLocalMessage('text_stroke'), onChange: (value) => onChange({ textStroke: value }) })))
    }

    function compileMarkdown(markdown) {
        return markdown.split('**')
            .map((text, i) => i % 2 ? (m("strong", null, text)) : text)
    }

    function MoreSettings({ data, actions, tab }) {
        const custom = data.settings.customThemes.find(({ url }) => isURLInList(tab.url, url))
        const filterConfig = custom ? custom.theme : data.settings.theme
        function setConfig(config) {
            if (custom) {
                custom.theme = { ...custom.theme, ...config }
                actions.changeSettings({ customThemes: data.settings.customThemes })
            }
            else {
                actions.setTheme(config)
            }
        }
        return (m("section", { class: "more-settings" },
            m("div", { class: "more-settings__section" },
                m(FontSettings, { config: filterConfig, fonts: data.fonts, onChange: setConfig })),
            m("div", { class: "more-settings__section" },
                isFirefox() ? null : m("p", { class: "more-settings__description" }, compileMarkdown(getLocalMessage('try_experimental_theme_engines'))),
                m(EngineSwitch, { engine: filterConfig.engine, onChange: (engine) => setConfig({ engine }) })),
            isFirefox() ? (m("div", { class: "more-settings__section" },
                m(Toggle, { checked: data.settings.changeBrowserTheme, labelOn: getLocalMessage('custom_browser_theme_on'), labelOff: getLocalMessage('custom_browser_theme_off'), onChange: (checked) => actions.changeSettings({ changeBrowserTheme: checked }) }),
                m("p", { class: "more-settings__description" }, getLocalMessage('change_browser_theme')))) : null))
    }


    function SiteListSettings({ data, actions, isFocused }) {
        function isSiteUrlValid(value) {
            return /^([^\.\s]+?\.?)+$/.test(value)
        }
        return (m("section", { class: "site-list-settings" },
            m(Toggle, { class: "site-list-settings__toggle", checked: data.settings.applyToListedOnly, labelOn: getLocalMessage('invert_listed_only'), labelOff: getLocalMessage('not_invert_listed'), onChange: (value) => actions.changeSettings({ applyToListedOnly: value }) }),
            m(TextList, {
                class: "site-list-settings__text-list", placeholder: "google.com/maps", values: data.settings.siteList, isFocused: isFocused, onChange: (values) => {
                    if (values.every(isSiteUrlValid)) {
                        actions.changeSettings({ siteList: values })
                    }
                }
            }),
            m(ShortcutLink, {
                class: "site-list-settings__shortcut", commandName: "addSite", shortcuts: data.shortcuts, textTemplate: (hotkey) => (hotkey
                    ? `${getLocalMessage('add_site_to_list')}: ${hotkey}`
                    : getLocalMessage('setup_add_site_hotkey')), onSetShortcut: (shortcut) => actions.setShortcut('addSite', shortcut)
            })))
    }

    function openDevTools$1() {
        chrome.windows.create({
            type: 'panel',
            url: isFirefox() ? '../devtools/index.html' : 'ui/devtools/index.html',
            width: 600,
            height: 600,
        })
    }
    function Body$1(props) {
        const context = getComponentContext()
        const { state, setState } = useState({
            activeTab: 'Filter',
            newsOpen: false,
            didNewsSlideIn: false,
            moreToggleSettingsOpen: false,
        })
        if (!props.data.isReady) {
            return (m("body", null,
                m(Loader$1, { complete: false })))
        }
        if (isMobile() || props.data.settings.previewNewDesign) {
            return m(Body, Object.assign({}, props))
        }
        const globalThemeEngine = props.data.settings.theme.engine
        const devtoolsData = props.data.devtools
        const hasCustomFixes = ((globalThemeEngine === ThemeEngines.dynamicTheme && devtoolsData.hasCustomDynamicFixes) ||
            ([ThemeEngines.cssFilter, ThemeEngines.svgFilter].includes(globalThemeEngine) && devtoolsData.hasCustomFilterFixes) ||
            (globalThemeEngine === ThemeEngines.staticTheme && devtoolsData.hasCustomStaticFixes))
        function toggleMoreToggleSettings() {
            setState({ moreToggleSettingsOpen: !state.moreToggleSettingsOpen })
        }
        return (m("body", { class: { 'ext-disabled': !props.data.isEnabled } },
            m(Loader$1, { complete: true }),
            m(Header, { data: props.data, tab: props.tab, actions: props.actions, onMoreToggleSettingsClick: toggleMoreToggleSettings }),
            m(TabPanel, {
                activeTab: state.activeTab, onSwitchTab: (tab) => setState({ activeTab: tab }), tabs: {
                    'Filter': (m(FilterSettings, { data: props.data, actions: props.actions, tab: props.tab })),
                    'Site list': (m(SiteListSettings, { data: props.data, actions: props.actions, isFocused: state.activeTab === 'Site list' })),
                    'More': (m(MoreSettings, { data: props.data, actions: props.actions, tab: props.tab })),
                }, tabLabels: {
                    'Filter': getLocalMessage('filter'),
                    'Site list': getLocalMessage('site_list'),
                    'More': getLocalMessage('more'),
                }
            }),
            m(MoreToggleSettings, { data: props.data, actions: props.actions, isExpanded: state.moreToggleSettingsOpen, onClose: toggleMoreToggleSettings })
        ))
    }
    var Body$2 = compose(Body$1, withState, withForms)

    function popupHasBuiltInBorders() {
        const chromeVersion = getChromeVersion()
        return Boolean(chromeVersion &&
            !isVivaldi() &&
            !isYaBrowser() &&
            !isOpera() &&
            isWindows() &&
            compareChromeVersions(chromeVersion, '62.0.3167.0') < 0)
    }
    function popupHasBuiltInHorizontalBorders() {
        const chromeVersion = getChromeVersion()
        return Boolean(chromeVersion &&
            !isVivaldi() &&
            !isYaBrowser() &&
            !isEdge() &&
            !isOpera() && ((isWindows() && compareChromeVersions(chromeVersion, '62.0.3167.0') >= 0) && compareChromeVersions(chromeVersion, '74.0.0.0') < 0 ||
                (isMacOS() && compareChromeVersions(chromeVersion, '67.0.3373.0') >= 0 && compareChromeVersions(chromeVersion, '73.0.3661.0') < 0)))
    }
    function fixNotClosingPopupOnNavigation() {
        document.addEventListener('click', (e) => {
            if (e.defaultPrevented || e.button === 2) {
                return
            }
            let target = e.target
            while (target && !(target instanceof HTMLAnchorElement)) {
                target = target.parentElement
            }
            if (target && target.hasAttribute('href')) {
                chrome.tabs.create({ url: target.getAttribute('href') })
                e.preventDefault()
                window.close()
            }
        })
    }

    function renderBody(data, tab, actions) {
        if (data.settings.previewNewDesign) {
            if (!document.documentElement.classList.contains('preview')) {
                document.documentElement.classList.add('preview')
            }
        }
        else {
            if (document.documentElement.classList.contains('preview')) {
                document.documentElement.classList.remove('preview')
            }
        }
        sync(document.body, (m(Body$2, { data: data, tab: tab, actions: actions })))
    }
    async function start() {
        const connector = connect()
        window.addEventListener('unload', () => connector.disconnect())
        const [data, tab] = await Promise.all([
            connector.getData(),
            connector.getActiveTabInfo(),
        ])
        renderBody(data, tab, connector)
        connector.subscribeToChanges((data) => renderBody(data, tab, connector))
    }
    addEventListener('load', start)
    document.documentElement.classList.toggle('mobile', isMobile())
    document.documentElement.classList.toggle('firefox', isFirefox())
    document.documentElement.classList.toggle('built-in-borders', popupHasBuiltInBorders())
    document.documentElement.classList.toggle('built-in-horizontal-borders', popupHasBuiltInHorizontalBorders())
    if (isFirefox()) {
        fixNotClosingPopupOnNavigation()
    }
    {
        chrome.runtime.onMessage.addListener(({ type }) => {
            if (type === 'css-update') {
                document.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
                    const url = link.href
                    link.disabled = true
                    const newLink = document.createElement('link')
                    newLink.rel = 'stylesheet'
                    newLink.href = url.replace(/\?.*$/, `?nocache=${Date.now()}`)
                    link.parentElement.insertBefore(newLink, link)
                    link.remove()
                })
            }
            if (type === 'ui-update') {
                location.reload()
            }
        })
    }

}())
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL25vZGVfbW9kdWxlcy9tYWxldmljL2luZGV4Lm1qcyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy9tYWxldmljL2RvbS5tanMiLCIuLi8uLi8uLi9zcmMvdWkvY29ubmVjdC9jb25uZWN0b3IudHMiLCIuLi8uLi8uLi9zcmMvdXRpbHMvaXB2Ni50cyIsIi4uLy4uLy4uL3NyYy91dGlscy91cmwudHMiLCIuLi8uLi8uLi9zcmMvdWkvY29ubmVjdC9tb2NrLnRzIiwiLi4vLi4vLi4vc3JjL3VpL2Nvbm5lY3QvaW5kZXgudHMiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvbWFsZXZpYy9mb3Jtcy5tanMiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvbWFsZXZpYy9zdGF0ZS5tanMiLCIuLi8uLi8uLi9zcmMvdXRpbHMvcGxhdGZvcm0udHMiLCIuLi8uLi8uLi9zcmMvdWkvdXRpbHMudHMiLCIuLi8uLi8uLi9zcmMvdWkvY29udHJvbHMvdXRpbHMudHMiLCIuLi8uLi8uLi9zcmMvdWkvY29udHJvbHMvYnV0dG9uL2luZGV4LnRzeCIsIi4uLy4uLy4uL3NyYy91aS9jb250cm9scy9jaGVja2JveC9pbmRleC50c3giLCIuLi8uLi8uLi9zcmMvdXRpbHMvY29sb3IudHMiLCIuLi8uLi8uLi9zcmMvdWkvY29udHJvbHMvdGV4dGJveC9pbmRleC50c3giLCIuLi8uLi8uLi9zcmMvdXRpbHMvbWF0aC50cyIsIi4uLy4uLy4uL3NyYy91aS9jb250cm9scy9jb2xvci1waWNrZXIvaHNiLXBpY2tlci50c3giLCIuLi8uLi8uLi9zcmMvdWkvY29udHJvbHMvY29sb3ItcGlja2VyL2luZGV4LnRzeCIsIi4uLy4uLy4uL3NyYy91aS9jb250cm9scy9kcm9wZG93bi9pbmRleC50c3giLCIuLi8uLi8uLi9zcmMvdWkvY29udHJvbHMvY29sb3ItZHJvcGRvd24vaW5kZXgudHN4IiwiLi4vLi4vLi4vc3JjL3VpL2NvbnRyb2xzL292ZXJsYXkvaW5kZXgudHMiLCIuLi8uLi8uLi9zcmMvdWkvY29udHJvbHMvbWVzc2FnZS1ib3gvaW5kZXgudHN4IiwiLi4vLi4vLi4vc3JjL3VpL2NvbnRyb2xzL211bHRpLXN3aXRjaC9pbmRleC50c3giLCIuLi8uLi8uLi9zcmMvdWkvY29udHJvbHMvbmF2LWJ1dHRvbi9pbmRleC50c3giLCIuLi8uLi8uLi9zcmMvdWkvY29udHJvbHMvcmVzZXQtYnV0dG9uL2luZGV4LnRzeCIsIi4uLy4uLy4uL3NyYy91aS9jb250cm9scy92aXJ0dWFsLXNjcm9sbC9pbmRleC50c3giLCIuLi8uLi8uLi9zcmMvdWkvY29udHJvbHMvc2VsZWN0L2luZGV4LnRzeCIsIi4uLy4uLy4uL3NyYy91aS9jb250cm9scy9zaG9ydGN1dC9pbmRleC50c3giLCIuLi8uLi8uLi9zcmMvaW5qZWN0L3V0aWxzL3Rocm90dGxlLnRzIiwiLi4vLi4vLi4vc3JjL3VpL2NvbnRyb2xzL3NsaWRlci9pbmRleC50c3giLCIuLi8uLi8uLi9zcmMvdWkvY29udHJvbHMvdGFiLXBhbmVsL3RhYi50c3giLCIuLi8uLi8uLi9zcmMvdWkvY29udHJvbHMvdGFiLXBhbmVsL2luZGV4LnRzeCIsIi4uLy4uLy4uL3NyYy91aS9jb250cm9scy90ZXh0LWxpc3QvaW5kZXgudHN4IiwiLi4vLi4vLi4vc3JjL3V0aWxzL2xvY2FsZXMudHMiLCIuLi8uLi8uLi9zcmMvdXRpbHMvdGltZS50cyIsIi4uLy4uLy4uL3NyYy91aS9jb250cm9scy90aW1lLXJhbmdlLXBpY2tlci9pbmRleC50c3giLCIuLi8uLi8uLi9zcmMvdWkvY29udHJvbHMvdG9nZ2xlL2luZGV4LnRzeCIsIi4uLy4uLy4uL3NyYy91aS9jb250cm9scy91cGRvd24vdHJhY2sudHN4IiwiLi4vLi4vLi4vc3JjL3VpL2NvbnRyb2xzL3VwZG93bi9pbmRleC50c3giLCIuLi8uLi8uLi9zcmMvdWkvcG9wdXAvY29tcG9uZW50cy9jdXN0b20tc2V0dGluZ3MtdG9nZ2xlL2luZGV4LnRzeCIsIi4uLy4uLy4uL3NyYy91aS9wb3B1cC9jb21wb25lbnRzL2ZpbHRlci1zZXR0aW5ncy9tb2RlLXRvZ2dsZS50c3giLCIuLi8uLi8uLi9zcmMvdWkvcG9wdXAvY29tcG9uZW50cy9maWx0ZXItc2V0dGluZ3MvaW5kZXgudHN4IiwiLi4vLi4vLi4vc3JjL3VpL3BvcHVwL21haW4tcGFnZS9zdW4tbW9vbi1pY29uLnRzeCIsIi4uLy4uLy4uL3NyYy91aS9wb3B1cC9tYWluLXBhZ2Uvc3lzdGVtLWljb24udHN4IiwiLi4vLi4vLi4vc3JjL3VpL3BvcHVwL21haW4tcGFnZS93YXRjaC1pY29uLnRzeCIsIi4uLy4uLy4uL3NyYy91aS9wb3B1cC9jb21wb25lbnRzL3NpdGUtdG9nZ2xlL2NoZWNrbWFyay1pY29uLnRzeCIsIi4uLy4uLy4uL3NyYy91aS9wb3B1cC9jb21wb25lbnRzL3NpdGUtdG9nZ2xlL2luZGV4LnRzeCIsIi4uLy4uLy4uL3NyYy91aS9wb3B1cC9jb21wb25lbnRzL2hlYWRlci9tb3JlLXRvZ2dsZS1zZXR0aW5ncy50c3giLCIuLi8uLi8uLi9zcmMvdWkvcG9wdXAvY29tcG9uZW50cy9oZWFkZXIvaW5kZXgudHN4IiwiLi4vLi4vLi4vc3JjL3VpL3BvcHVwL2NvbXBvbmVudHMvbG9hZGVyL2luZGV4LnRzeCIsIi4uLy4uLy4uL3NyYy91dGlscy9saW5rcy50cyIsIi4uLy4uLy4uL3NyYy91aS9wb3B1cC9hdXRvbWF0aW9uLXBhZ2UvaW5kZXgudHN4IiwiLi4vLi4vLi4vc3JjL3VpL3BvcHVwL2NvbnRyb2wtZ3JvdXAvaW5kZXgudHN4IiwiLi4vLi4vLi4vc3JjL3VpL3BvcHVwL21haW4tcGFnZS9hcHAtc3dpdGNoLnRzeCIsIi4uLy4uLy4uL3NyYy91aS9wb3B1cC9tYWluLXBhZ2UvaGVscC50c3giLCIuLi8uLi8uLi9zcmMvdWkvcG9wdXAvbWFpbi1wYWdlL3NpdGUtdG9nZ2xlLnRzeCIsIi4uLy4uLy4uL3NyYy91aS9wb3B1cC90aGVtZS9jb250cm9scy90aGVtZS1jb250cm9sLnRzeCIsIi4uLy4uLy4uL3NyYy91aS9wb3B1cC90aGVtZS9jb250cm9scy9iYWNrZ3JvdW5kLWNvbG9yLnRzeCIsIi4uLy4uLy4uL3NyYy91aS9wb3B1cC90aGVtZS9jb250cm9scy9mb3JtYXQudHMiLCIuLi8uLi8uLi9zcmMvdWkvcG9wdXAvdGhlbWUvY29udHJvbHMvYnJpZ2h0bmVzcy50c3giLCIuLi8uLi8uLi9zcmMvdWkvcG9wdXAvdGhlbWUvY29udHJvbHMvY29udHJhc3QudHN4IiwiLi4vLi4vLi4vc3JjL3VpL3BvcHVwL3RoZW1lL2NvbnRyb2xzL2ZvbnQtcGlja2VyLnRzeCIsIi4uLy4uLy4uL3NyYy91aS9wb3B1cC90aGVtZS9jb250cm9scy9ncmF5c2NhbGUudHN4IiwiLi4vLi4vLi4vc3JjL2dlbmVyYXRvcnMvdGhlbWUtZW5naW5lcy50cyIsIi4uLy4uLy4uL3NyYy91aS9wb3B1cC90aGVtZS9jb250cm9scy9tb2RlLnRzeCIsIi4uLy4uLy4uL3NyYy9kZWZhdWx0cy50cyIsIi4uLy4uLy4uL3NyYy91aS9wb3B1cC90aGVtZS9jb250cm9scy9yZXNldC1idXR0b24udHN4IiwiLi4vLi4vLi4vc3JjL3VpL3BvcHVwL3RoZW1lL2NvbnRyb2xzL3NjaGVtZS50c3giLCIuLi8uLi8uLi9zcmMvdWkvcG9wdXAvdGhlbWUvY29udHJvbHMvc2Nyb2xsYmFyLnRzeCIsIi4uLy4uLy4uL3NyYy91aS9wb3B1cC90aGVtZS9jb250cm9scy9zZWxlY3Rpb24udHN4IiwiLi4vLi4vLi4vc3JjL3VpL3BvcHVwL3RoZW1lL2NvbnRyb2xzL3NlcGlhLnRzeCIsIi4uLy4uLy4uL3NyYy91aS9wb3B1cC90aGVtZS9jb250cm9scy9zdHlsZS1zeXN0ZW0tY29udHJvbHMudHN4IiwiLi4vLi4vLi4vc3JjL3VpL3BvcHVwL3RoZW1lL2NvbnRyb2xzL3RleHQtY29sb3IudHN4IiwiLi4vLi4vLi4vc3JjL3VpL3BvcHVwL3RoZW1lL2NvbnRyb2xzL3RleHQtc3Ryb2tlLnRzeCIsIi4uLy4uLy4uL3NyYy91aS9wb3B1cC90aGVtZS9jb250cm9scy91c2UtZm9udC50c3giLCIuLi8uLi8uLi9zcmMvdXRpbHMvdWlkLnRzIiwiLi4vLi4vLi4vc3JjL3VpL3BvcHVwL3RoZW1lL3ByZXNldC1waWNrZXIvaW5kZXgudHN4IiwiLi4vLi4vLi4vc3JjL3VpL3BvcHVwL3RoZW1lL3V0aWxzLnRzIiwiLi4vLi4vLi4vc3JjL3VpL3BvcHVwL21haW4tcGFnZS90aGVtZS1ncm91cC50c3giLCIuLi8uLi8uLi9zcmMvdWkvcG9wdXAvbWFpbi1wYWdlL2luZGV4LnRzeCIsIi4uLy4uLy4uL3NyYy91aS9wb3B1cC9wYWdlLXZpZXdlci9pbmRleC50c3giLCIuLi8uLi8uLi9zcmMvdWkvcG9wdXAvc2V0dGluZ3MtcGFnZS9hdXRvbWF0aW9uLWJ1dHRvbi50c3giLCIuLi8uLi8uLi9zcmMvdWkvcG9wdXAvc2V0dGluZ3MtcGFnZS9kZXZ0b29scy50c3giLCIuLi8uLi8uLi9zcmMvdWkvcG9wdXAvc2V0dGluZ3MtcGFnZS9tYW5nZS1zZXR0aW5ncy1idXR0b24udHN4IiwiLi4vLi4vLi4vc3JjL3VpL3BvcHVwL3NldHRpbmdzLXBhZ2Uvc2l0ZS1saXN0LWJ1dHRvbi50c3giLCIuLi8uLi8uLi9zcmMvdWkvcG9wdXAvY2hlY2stYnV0dG9uL2luZGV4LnRzeCIsIi4uLy4uLy4uL3NyYy91aS9wb3B1cC9zZXR0aW5ncy1wYWdlL2VuYWJsZWQtYnktZGVmYXVsdC50c3giLCIuLi8uLi8uLi9zcmMvdWkvcG9wdXAvc2V0dGluZ3MtcGFnZS9pbmRleC50c3giLCIuLi8uLi8uLi9zcmMvdWkvcG9wdXAvc2l0ZS1saXN0LXBhZ2Uvc2l0ZS1saXN0LnRzeCIsIi4uLy4uLy4uL3NyYy91aS9wb3B1cC9zaXRlLWxpc3QtcGFnZS9pbmRleC50c3giLCIuLi8uLi8uLi9zcmMvdWkvcG9wdXAvdGhlbWUvcGFnZS9jb2xsYXBzaWJsZS1wYW5lbC50c3giLCIuLi8uLi8uLi9zcmMvdWkvcG9wdXAvdGhlbWUvcGFnZS9pbmRleC50c3giLCIuLi8uLi8uLi9zcmMvdWkvcG9wdXAvbWFuYWdlLXNldHRpbmdzLXBhZ2UvcmVzZXQtc2V0dGluZ3MtYnV0dG9uLnRzeCIsIi4uLy4uLy4uL3NyYy91aS9wb3B1cC9tYW5hZ2Utc2V0dGluZ3MtcGFnZS9pbXBvcnQtc2V0dGluZ3MudHN4IiwiLi4vLi4vLi4vc3JjL3VpL3BvcHVwL21hbmFnZS1zZXR0aW5ncy1wYWdlL2V4cG9ydC1zZXR0aW5ncy50c3giLCIuLi8uLi8uLi9zcmMvdWkvcG9wdXAvbWFuYWdlLXNldHRpbmdzLXBhZ2Uvc3luYy1zZXR0aW5ncy50c3giLCIuLi8uLi8uLi9zcmMvdWkvcG9wdXAvbWFuYWdlLXNldHRpbmdzLXBhZ2UvZXhwb3J0LXRoZW1lLnRzeCIsIi4uLy4uLy4uL3NyYy91aS9wb3B1cC9tYW5hZ2Utc2V0dGluZ3MtcGFnZS9zeW5jLWNvbmZpZy50c3giLCIuLi8uLi8uLi9zcmMvdWkvcG9wdXAvbWFuYWdlLXNldHRpbmdzLXBhZ2UvaW5kZXgudHN4IiwiLi4vLi4vLi4vc3JjL3VpL3BvcHVwL2JvZHkvaW5kZXgudHN4IiwiLi4vLi4vLi4vc3JjL3VpL3BvcHVwL2NvbXBvbmVudHMvZW5naW5lLXN3aXRjaC9pbmRleC50c3giLCIuLi8uLi8uLi9zcmMvdWkvcG9wdXAvY29tcG9uZW50cy9mb250LXNldHRpbmdzL2luZGV4LnRzeCIsIi4uLy4uLy4uL3NyYy91aS9wb3B1cC91dGlscy9tYXJrZG93bi50c3giLCIuLi8uLi8uLi9zcmMvdWkvcG9wdXAvY29tcG9uZW50cy9tb3JlLXNldHRpbmdzL2luZGV4LnRzeCIsIi4uLy4uLy4uL3NyYy91aS9wb3B1cC9jb21wb25lbnRzL25ld3MvaW5kZXgudHN4IiwiLi4vLi4vLi4vc3JjL3VpL3BvcHVwL2NvbXBvbmVudHMvc2l0ZS1saXN0LXNldHRpbmdzL2luZGV4LnRzeCIsIi4uLy4uLy4uL3NyYy91aS9wb3B1cC9jb21wb25lbnRzL2JvZHkudHN4IiwiLi4vLi4vLi4vc3JjL3VpL3BvcHVwL3V0aWxzL2lzc3Vlcy50cyIsIi4uLy4uLy4uL3NyYy91aS9wb3B1cC9pbmRleC50c3giXSwic291cmNlc0NvbnRlbnQiOlsiLyogbWFsZXZpY0AwLjE4LjYgLSBKdWwgMTUsIDIwMjAgKi9cbmZ1bmN0aW9uIG0odGFnT3JDb21wb25lbnQsIHByb3BzLCAuLi5jaGlsZHJlbikge1xuICAgIHByb3BzID0gcHJvcHMgfHwge307XG4gICAgaWYgKHR5cGVvZiB0YWdPckNvbXBvbmVudCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgY29uc3QgdGFnID0gdGFnT3JDb21wb25lbnQ7XG4gICAgICAgIHJldHVybiB7IHR5cGU6IHRhZywgcHJvcHMsIGNoaWxkcmVuIH07XG4gICAgfVxuICAgIGlmICh0eXBlb2YgdGFnT3JDb21wb25lbnQgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgY29uc3QgY29tcG9uZW50ID0gdGFnT3JDb21wb25lbnQ7XG4gICAgICAgIHJldHVybiB7IHR5cGU6IGNvbXBvbmVudCwgcHJvcHMsIGNoaWxkcmVuIH07XG4gICAgfVxuICAgIHRocm93IG5ldyBFcnJvcignVW5zdXBwb3J0ZWQgc3BlYyB0eXBlJyk7XG59XG5cbmV4cG9ydCB7IG0gfTtcbiIsIi8qIG1hbGV2aWNAMC4xOC42IC0gSnVsIDE1LCAyMDIwICovXG5mdW5jdGlvbiBjcmVhdGVQbHVnaW5zU3RvcmUoKSB7XG4gICAgY29uc3QgcGx1Z2lucyA9IFtdO1xuICAgIHJldHVybiB7XG4gICAgICAgIGFkZChwbHVnaW4pIHtcbiAgICAgICAgICAgIHBsdWdpbnMucHVzaChwbHVnaW4pO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgIH0sXG4gICAgICAgIGFwcGx5KHByb3BzKSB7XG4gICAgICAgICAgICBsZXQgcmVzdWx0O1xuICAgICAgICAgICAgbGV0IHBsdWdpbjtcbiAgICAgICAgICAgIGNvbnN0IHVzZWRQbHVnaW5zID0gbmV3IFNldCgpO1xuICAgICAgICAgICAgZm9yIChsZXQgaSA9IHBsdWdpbnMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgICAgICAgICBwbHVnaW4gPSBwbHVnaW5zW2ldO1xuICAgICAgICAgICAgICAgIGlmICh1c2VkUGx1Z2lucy5oYXMocGx1Z2luKSkge1xuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmVzdWx0ID0gcGx1Z2luKHByb3BzKTtcbiAgICAgICAgICAgICAgICBpZiAocmVzdWx0ICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdXNlZFBsdWdpbnMuYWRkKHBsdWdpbik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfSxcbiAgICAgICAgZGVsZXRlKHBsdWdpbikge1xuICAgICAgICAgICAgZm9yIChsZXQgaSA9IHBsdWdpbnMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgICAgICAgICBpZiAocGx1Z2luc1tpXSA9PT0gcGx1Z2luKSB7XG4gICAgICAgICAgICAgICAgICAgIHBsdWdpbnMuc3BsaWNlKGksIDEpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgfSxcbiAgICAgICAgZW1wdHkoKSB7XG4gICAgICAgICAgICByZXR1cm4gcGx1Z2lucy5sZW5ndGggPT09IDA7XG4gICAgICAgIH0sXG4gICAgfTtcbn1cbmZ1bmN0aW9uIGl0ZXJhdGVDb21wb25lbnRQbHVnaW5zKHR5cGUsIHBhaXJzLCBpdGVyYXRvcikge1xuICAgIHBhaXJzXG4gICAgICAgIC5maWx0ZXIoKFtrZXldKSA9PiB0eXBlW2tleV0pXG4gICAgICAgIC5mb3JFYWNoKChba2V5LCBwbHVnaW5zXSkgPT4ge1xuICAgICAgICByZXR1cm4gdHlwZVtrZXldLmZvckVhY2goKHBsdWdpbikgPT4gaXRlcmF0b3IocGx1Z2lucywgcGx1Z2luKSk7XG4gICAgfSk7XG59XG5mdW5jdGlvbiBhZGRDb21wb25lbnRQbHVnaW5zKHR5cGUsIHBhaXJzKSB7XG4gICAgaXRlcmF0ZUNvbXBvbmVudFBsdWdpbnModHlwZSwgcGFpcnMsIChwbHVnaW5zLCBwbHVnaW4pID0+IHBsdWdpbnMuYWRkKHBsdWdpbikpO1xufVxuZnVuY3Rpb24gZGVsZXRlQ29tcG9uZW50UGx1Z2lucyh0eXBlLCBwYWlycykge1xuICAgIGl0ZXJhdGVDb21wb25lbnRQbHVnaW5zKHR5cGUsIHBhaXJzLCAocGx1Z2lucywgcGx1Z2luKSA9PiBwbHVnaW5zLmRlbGV0ZShwbHVnaW4pKTtcbn1cbmZ1bmN0aW9uIGNyZWF0ZVBsdWdpbnNBUEkoa2V5KSB7XG4gICAgY29uc3QgYXBpID0ge1xuICAgICAgICBhZGQodHlwZSwgcGx1Z2luKSB7XG4gICAgICAgICAgICBpZiAoIXR5cGVba2V5XSkge1xuICAgICAgICAgICAgICAgIHR5cGVba2V5XSA9IFtdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdHlwZVtrZXldLnB1c2gocGx1Z2luKTtcbiAgICAgICAgICAgIHJldHVybiBhcGk7XG4gICAgICAgIH0sXG4gICAgfTtcbiAgICByZXR1cm4gYXBpO1xufVxuXG5jb25zdCBYSFRNTF9OUyA9ICdodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hodG1sJztcbmNvbnN0IFNWR19OUyA9ICdodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Zyc7XG5jb25zdCBQTFVHSU5TX0NSRUFURV9FTEVNRU5UID0gU3ltYm9sKCk7XG5jb25zdCBwbHVnaW5zQ3JlYXRlRWxlbWVudCA9IGNyZWF0ZVBsdWdpbnNTdG9yZSgpO1xuZnVuY3Rpb24gY3JlYXRlRWxlbWVudChzcGVjLCBwYXJlbnQpIHtcbiAgICBjb25zdCByZXN1bHQgPSBwbHVnaW5zQ3JlYXRlRWxlbWVudC5hcHBseSh7IHNwZWMsIHBhcmVudCB9KTtcbiAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIGNvbnN0IHRhZyA9IHNwZWMudHlwZTtcbiAgICBpZiAodGFnID09PSAnc3ZnJykge1xuICAgICAgICByZXR1cm4gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKFNWR19OUywgJ3N2ZycpO1xuICAgIH1cbiAgICBjb25zdCBuYW1lc3BhY2UgPSBwYXJlbnQubmFtZXNwYWNlVVJJO1xuICAgIGlmIChuYW1lc3BhY2UgPT09IFhIVE1MX05TIHx8IG5hbWVzcGFjZSA9PSBudWxsKSB7XG4gICAgICAgIHJldHVybiBkb2N1bWVudC5jcmVhdGVFbGVtZW50KHRhZyk7XG4gICAgfVxuICAgIHJldHVybiBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMobmFtZXNwYWNlLCB0YWcpO1xufVxuXG5mdW5jdGlvbiBjbGFzc2VzKC4uLmFyZ3MpIHtcbiAgICBjb25zdCBjbGFzc2VzID0gW107XG4gICAgYXJncy5maWx0ZXIoKGMpID0+IEJvb2xlYW4oYykpLmZvckVhY2goKGMpID0+IHtcbiAgICAgICAgaWYgKHR5cGVvZiBjID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgY2xhc3Nlcy5wdXNoKGMpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHR5cGVvZiBjID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgY2xhc3Nlcy5wdXNoKC4uLk9iamVjdC5rZXlzKGMpLmZpbHRlcigoa2V5KSA9PiBCb29sZWFuKGNba2V5XSkpKTtcbiAgICAgICAgfVxuICAgIH0pO1xuICAgIHJldHVybiBjbGFzc2VzLmpvaW4oJyAnKTtcbn1cbmZ1bmN0aW9uIHNldElubGluZUNTU1Byb3BlcnR5VmFsdWUoZWxlbWVudCwgcHJvcCwgJHZhbHVlKSB7XG4gICAgaWYgKCR2YWx1ZSAhPSBudWxsICYmICR2YWx1ZSAhPT0gJycpIHtcbiAgICAgICAgbGV0IHZhbHVlID0gU3RyaW5nKCR2YWx1ZSk7XG4gICAgICAgIGxldCBpbXBvcnRhbnQgPSAnJztcbiAgICAgICAgaWYgKHZhbHVlLmVuZHNXaXRoKCchaW1wb3J0YW50JykpIHtcbiAgICAgICAgICAgIHZhbHVlID0gdmFsdWUuc3Vic3RyaW5nKDAsIHZhbHVlLmxlbmd0aCAtIDEwKTtcbiAgICAgICAgICAgIGltcG9ydGFudCA9ICdpbXBvcnRhbnQnO1xuICAgICAgICB9XG4gICAgICAgIGVsZW1lbnQuc3R5bGUuc2V0UHJvcGVydHkocHJvcCwgdmFsdWUsIGltcG9ydGFudCk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICBlbGVtZW50LnN0eWxlLnJlbW92ZVByb3BlcnR5KHByb3ApO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gaXNPYmplY3QodmFsdWUpIHtcbiAgICByZXR1cm4gdmFsdWUgIT0gbnVsbCAmJiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnO1xufVxuXG5jb25zdCBldmVudExpc3RlbmVycyA9IG5ldyBXZWFrTWFwKCk7XG5mdW5jdGlvbiBhZGRFdmVudExpc3RlbmVyKGVsZW1lbnQsIGV2ZW50LCBsaXN0ZW5lcikge1xuICAgIGxldCBsaXN0ZW5lcnM7XG4gICAgaWYgKGV2ZW50TGlzdGVuZXJzLmhhcyhlbGVtZW50KSkge1xuICAgICAgICBsaXN0ZW5lcnMgPSBldmVudExpc3RlbmVycy5nZXQoZWxlbWVudCk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICBsaXN0ZW5lcnMgPSBuZXcgTWFwKCk7XG4gICAgICAgIGV2ZW50TGlzdGVuZXJzLnNldChlbGVtZW50LCBsaXN0ZW5lcnMpO1xuICAgIH1cbiAgICBpZiAobGlzdGVuZXJzLmdldChldmVudCkgIT09IGxpc3RlbmVyKSB7XG4gICAgICAgIGlmIChsaXN0ZW5lcnMuaGFzKGV2ZW50KSkge1xuICAgICAgICAgICAgZWxlbWVudC5yZW1vdmVFdmVudExpc3RlbmVyKGV2ZW50LCBsaXN0ZW5lcnMuZ2V0KGV2ZW50KSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKGV2ZW50LCBsaXN0ZW5lcik7XG4gICAgICAgIGxpc3RlbmVycy5zZXQoZXZlbnQsIGxpc3RlbmVyKTtcbiAgICB9XG59XG5mdW5jdGlvbiByZW1vdmVFdmVudExpc3RlbmVyKGVsZW1lbnQsIGV2ZW50KSB7XG4gICAgaWYgKCFldmVudExpc3RlbmVycy5oYXMoZWxlbWVudCkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBsaXN0ZW5lcnMgPSBldmVudExpc3RlbmVycy5nZXQoZWxlbWVudCk7XG4gICAgZWxlbWVudC5yZW1vdmVFdmVudExpc3RlbmVyKGV2ZW50LCBsaXN0ZW5lcnMuZ2V0KGV2ZW50KSk7XG4gICAgbGlzdGVuZXJzLmRlbGV0ZShldmVudCk7XG59XG5cbmZ1bmN0aW9uIHNldENsYXNzT2JqZWN0KGVsZW1lbnQsIGNsYXNzT2JqKSB7XG4gICAgY29uc3QgY2xzID0gQXJyYXkuaXNBcnJheShjbGFzc09iailcbiAgICAgICAgPyBjbGFzc2VzKC4uLmNsYXNzT2JqKVxuICAgICAgICA6IGNsYXNzZXMoY2xhc3NPYmopO1xuICAgIGlmIChjbHMpIHtcbiAgICAgICAgZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2NsYXNzJywgY2xzKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIGVsZW1lbnQucmVtb3ZlQXR0cmlidXRlKCdjbGFzcycpO1xuICAgIH1cbn1cbmZ1bmN0aW9uIG1lcmdlVmFsdWVzKG9iaiwgb2xkKSB7XG4gICAgY29uc3QgdmFsdWVzID0gbmV3IE1hcCgpO1xuICAgIGNvbnN0IG5ld1Byb3BzID0gbmV3IFNldChPYmplY3Qua2V5cyhvYmopKTtcbiAgICBjb25zdCBvbGRQcm9wcyA9IE9iamVjdC5rZXlzKG9sZCk7XG4gICAgb2xkUHJvcHNcbiAgICAgICAgLmZpbHRlcigocHJvcCkgPT4gIW5ld1Byb3BzLmhhcyhwcm9wKSlcbiAgICAgICAgLmZvckVhY2goKHByb3ApID0+IHZhbHVlcy5zZXQocHJvcCwgbnVsbCkpO1xuICAgIG5ld1Byb3BzLmZvckVhY2goKHByb3ApID0+IHZhbHVlcy5zZXQocHJvcCwgb2JqW3Byb3BdKSk7XG4gICAgcmV0dXJuIHZhbHVlcztcbn1cbmZ1bmN0aW9uIHNldFN0eWxlT2JqZWN0KGVsZW1lbnQsIHN0eWxlT2JqLCBwcmV2KSB7XG4gICAgbGV0IHByZXZPYmo7XG4gICAgaWYgKGlzT2JqZWN0KHByZXYpKSB7XG4gICAgICAgIHByZXZPYmogPSBwcmV2O1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgcHJldk9iaiA9IHt9O1xuICAgICAgICBlbGVtZW50LnJlbW92ZUF0dHJpYnV0ZSgnc3R5bGUnKTtcbiAgICB9XG4gICAgY29uc3QgZGVjbGFyYXRpb25zID0gbWVyZ2VWYWx1ZXMoc3R5bGVPYmosIHByZXZPYmopO1xuICAgIGRlY2xhcmF0aW9ucy5mb3JFYWNoKCgkdmFsdWUsIHByb3ApID0+IHNldElubGluZUNTU1Byb3BlcnR5VmFsdWUoZWxlbWVudCwgcHJvcCwgJHZhbHVlKSk7XG59XG5mdW5jdGlvbiBzZXRFdmVudExpc3RlbmVyKGVsZW1lbnQsIGV2ZW50LCBsaXN0ZW5lcikge1xuICAgIGlmICh0eXBlb2YgbGlzdGVuZXIgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgYWRkRXZlbnRMaXN0ZW5lcihlbGVtZW50LCBldmVudCwgbGlzdGVuZXIpO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgcmVtb3ZlRXZlbnRMaXN0ZW5lcihlbGVtZW50LCBldmVudCk7XG4gICAgfVxufVxuY29uc3Qgc3BlY2lhbEF0dHJzID0gbmV3IFNldChbXG4gICAgJ2tleScsXG4gICAgJ29uY3JlYXRlJyxcbiAgICAnb251cGRhdGUnLFxuICAgICdvbnJlbmRlcicsXG4gICAgJ29ucmVtb3ZlJyxcbl0pO1xuY29uc3QgUExVR0lOU19TRVRfQVRUUklCVVRFID0gU3ltYm9sKCk7XG5jb25zdCBwbHVnaW5zU2V0QXR0cmlidXRlID0gY3JlYXRlUGx1Z2luc1N0b3JlKCk7XG5mdW5jdGlvbiBnZXRQcm9wZXJ0eVZhbHVlKG9iaiwgcHJvcCkge1xuICAgIHJldHVybiBvYmogJiYgb2JqLmhhc093blByb3BlcnR5KHByb3ApID8gb2JqW3Byb3BdIDogbnVsbDtcbn1cbmZ1bmN0aW9uIHN5bmNBdHRycyhlbGVtZW50LCBhdHRycywgcHJldikge1xuICAgIGNvbnN0IHZhbHVlcyA9IG1lcmdlVmFsdWVzKGF0dHJzLCBwcmV2IHx8IHt9KTtcbiAgICB2YWx1ZXMuZm9yRWFjaCgodmFsdWUsIGF0dHIpID0+IHtcbiAgICAgICAgaWYgKCFwbHVnaW5zU2V0QXR0cmlidXRlLmVtcHR5KCkpIHtcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IHBsdWdpbnNTZXRBdHRyaWJ1dGUuYXBwbHkoe1xuICAgICAgICAgICAgICAgIGVsZW1lbnQsXG4gICAgICAgICAgICAgICAgYXR0cixcbiAgICAgICAgICAgICAgICB2YWx1ZSxcbiAgICAgICAgICAgICAgICBnZXQgcHJldigpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGdldFByb3BlcnR5VmFsdWUocHJldiwgYXR0cik7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgaWYgKHJlc3VsdCAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChhdHRyID09PSAnY2xhc3MnICYmIGlzT2JqZWN0KHZhbHVlKSkge1xuICAgICAgICAgICAgc2V0Q2xhc3NPYmplY3QoZWxlbWVudCwgdmFsdWUpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGF0dHIgPT09ICdzdHlsZScgJiYgaXNPYmplY3QodmFsdWUpKSB7XG4gICAgICAgICAgICBjb25zdCBwcmV2VmFsdWUgPSBnZXRQcm9wZXJ0eVZhbHVlKHByZXYsIGF0dHIpO1xuICAgICAgICAgICAgc2V0U3R5bGVPYmplY3QoZWxlbWVudCwgdmFsdWUsIHByZXZWYWx1ZSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoYXR0ci5zdGFydHNXaXRoKCdvbicpKSB7XG4gICAgICAgICAgICBjb25zdCBldmVudCA9IGF0dHIuc3Vic3RyaW5nKDIpO1xuICAgICAgICAgICAgc2V0RXZlbnRMaXN0ZW5lcihlbGVtZW50LCBldmVudCwgdmFsdWUpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHNwZWNpYWxBdHRycy5oYXMoYXR0cikpIDtcbiAgICAgICAgZWxzZSBpZiAodmFsdWUgPT0gbnVsbCB8fCB2YWx1ZSA9PT0gZmFsc2UpIHtcbiAgICAgICAgICAgIGVsZW1lbnQucmVtb3ZlQXR0cmlidXRlKGF0dHIpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgZWxlbWVudC5zZXRBdHRyaWJ1dGUoYXR0ciwgdmFsdWUgPT09IHRydWUgPyAnJyA6IFN0cmluZyh2YWx1ZSkpO1xuICAgICAgICB9XG4gICAgfSk7XG59XG5cbmNsYXNzIExpbmtlZExpc3Qge1xuICAgIGNvbnN0cnVjdG9yKC4uLml0ZW1zKSB7XG4gICAgICAgIHRoaXMubmV4dHMgPSBuZXcgV2Vha01hcCgpO1xuICAgICAgICB0aGlzLnByZXZzID0gbmV3IFdlYWtNYXAoKTtcbiAgICAgICAgdGhpcy5maXJzdCA9IG51bGw7XG4gICAgICAgIHRoaXMubGFzdCA9IG51bGw7XG4gICAgICAgIGl0ZW1zLmZvckVhY2goKGl0ZW0pID0+IHRoaXMucHVzaChpdGVtKSk7XG4gICAgfVxuICAgIGVtcHR5KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5maXJzdCA9PSBudWxsO1xuICAgIH1cbiAgICBwdXNoKGl0ZW0pIHtcbiAgICAgICAgaWYgKHRoaXMuZW1wdHkoKSkge1xuICAgICAgICAgICAgdGhpcy5maXJzdCA9IGl0ZW07XG4gICAgICAgICAgICB0aGlzLmxhc3QgPSBpdGVtO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5uZXh0cy5zZXQodGhpcy5sYXN0LCBpdGVtKTtcbiAgICAgICAgICAgIHRoaXMucHJldnMuc2V0KGl0ZW0sIHRoaXMubGFzdCk7XG4gICAgICAgICAgICB0aGlzLmxhc3QgPSBpdGVtO1xuICAgICAgICB9XG4gICAgfVxuICAgIGluc2VydEJlZm9yZShuZXdJdGVtLCByZWZJdGVtKSB7XG4gICAgICAgIGNvbnN0IHByZXYgPSB0aGlzLmJlZm9yZShyZWZJdGVtKTtcbiAgICAgICAgdGhpcy5wcmV2cy5zZXQobmV3SXRlbSwgcHJldik7XG4gICAgICAgIHRoaXMubmV4dHMuc2V0KG5ld0l0ZW0sIHJlZkl0ZW0pO1xuICAgICAgICB0aGlzLnByZXZzLnNldChyZWZJdGVtLCBuZXdJdGVtKTtcbiAgICAgICAgcHJldiAmJiB0aGlzLm5leHRzLnNldChwcmV2LCBuZXdJdGVtKTtcbiAgICAgICAgcmVmSXRlbSA9PT0gdGhpcy5maXJzdCAmJiAodGhpcy5maXJzdCA9IG5ld0l0ZW0pO1xuICAgIH1cbiAgICBkZWxldGUoaXRlbSkge1xuICAgICAgICBjb25zdCBwcmV2ID0gdGhpcy5iZWZvcmUoaXRlbSk7XG4gICAgICAgIGNvbnN0IG5leHQgPSB0aGlzLmFmdGVyKGl0ZW0pO1xuICAgICAgICBwcmV2ICYmIHRoaXMubmV4dHMuc2V0KHByZXYsIG5leHQpO1xuICAgICAgICBuZXh0ICYmIHRoaXMucHJldnMuc2V0KG5leHQsIHByZXYpO1xuICAgICAgICBpdGVtID09PSB0aGlzLmZpcnN0ICYmICh0aGlzLmZpcnN0ID0gbmV4dCk7XG4gICAgICAgIGl0ZW0gPT09IHRoaXMubGFzdCAmJiAodGhpcy5sYXN0ID0gcHJldik7XG4gICAgfVxuICAgIGJlZm9yZShpdGVtKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnByZXZzLmdldChpdGVtKSB8fCBudWxsO1xuICAgIH1cbiAgICBhZnRlcihpdGVtKSB7XG4gICAgICAgIHJldHVybiB0aGlzLm5leHRzLmdldChpdGVtKSB8fCBudWxsO1xuICAgIH1cbiAgICBsb29wKGl0ZXJhdG9yKSB7XG4gICAgICAgIGlmICh0aGlzLmVtcHR5KCkpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBsZXQgY3VycmVudCA9IHRoaXMuZmlyc3Q7XG4gICAgICAgIGRvIHtcbiAgICAgICAgICAgIGlmIChpdGVyYXRvcihjdXJyZW50KSkge1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IHdoaWxlICgoY3VycmVudCA9IHRoaXMuYWZ0ZXIoY3VycmVudCkpKTtcbiAgICB9XG4gICAgY29weSgpIHtcbiAgICAgICAgY29uc3QgbGlzdCA9IG5ldyBMaW5rZWRMaXN0KCk7XG4gICAgICAgIHRoaXMubG9vcCgoaXRlbSkgPT4ge1xuICAgICAgICAgICAgbGlzdC5wdXNoKGl0ZW0pO1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIGxpc3Q7XG4gICAgfVxuICAgIGZvckVhY2goaXRlcmF0b3IpIHtcbiAgICAgICAgdGhpcy5sb29wKChpdGVtKSA9PiB7XG4gICAgICAgICAgICBpdGVyYXRvcihpdGVtKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIGZpbmQoaXRlcmF0b3IpIHtcbiAgICAgICAgbGV0IHJlc3VsdCA9IG51bGw7XG4gICAgICAgIHRoaXMubG9vcCgoaXRlbSkgPT4ge1xuICAgICAgICAgICAgaWYgKGl0ZXJhdG9yKGl0ZW0pKSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0ID0gaXRlbTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIG1hcChpdGVyYXRvcikge1xuICAgICAgICBjb25zdCByZXN1bHRzID0gW107XG4gICAgICAgIHRoaXMubG9vcCgoaXRlbSkgPT4ge1xuICAgICAgICAgICAgcmVzdWx0cy5wdXNoKGl0ZXJhdG9yKGl0ZW0pKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiByZXN1bHRzO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gbWF0Y2hDaGlsZHJlbih2bm9kZSwgb2xkKSB7XG4gICAgY29uc3Qgb2xkQ2hpbGRyZW4gPSBvbGQuY2hpbGRyZW4oKTtcbiAgICBjb25zdCBvbGRDaGlsZHJlbkJ5S2V5ID0gbmV3IE1hcCgpO1xuICAgIGNvbnN0IG9sZENoaWxkcmVuV2l0aG91dEtleSA9IFtdO1xuICAgIG9sZENoaWxkcmVuLmZvckVhY2goKHYpID0+IHtcbiAgICAgICAgY29uc3Qga2V5ID0gdi5rZXkoKTtcbiAgICAgICAgaWYgKGtleSA9PSBudWxsKSB7XG4gICAgICAgICAgICBvbGRDaGlsZHJlbldpdGhvdXRLZXkucHVzaCh2KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIG9sZENoaWxkcmVuQnlLZXkuc2V0KGtleSwgdik7XG4gICAgICAgIH1cbiAgICB9KTtcbiAgICBjb25zdCBjaGlsZHJlbiA9IHZub2RlLmNoaWxkcmVuKCk7XG4gICAgY29uc3QgbWF0Y2hlcyA9IFtdO1xuICAgIGNvbnN0IHVubWF0Y2hlZCA9IG5ldyBTZXQob2xkQ2hpbGRyZW4pO1xuICAgIGNvbnN0IGtleXMgPSBuZXcgU2V0KCk7XG4gICAgY2hpbGRyZW4uZm9yRWFjaCgodikgPT4ge1xuICAgICAgICBsZXQgbWF0Y2ggPSBudWxsO1xuICAgICAgICBsZXQgZ3Vlc3MgPSBudWxsO1xuICAgICAgICBjb25zdCBrZXkgPSB2LmtleSgpO1xuICAgICAgICBpZiAoa2V5ICE9IG51bGwpIHtcbiAgICAgICAgICAgIGlmIChrZXlzLmhhcyhrZXkpKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdEdXBsaWNhdGUga2V5Jyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBrZXlzLmFkZChrZXkpO1xuICAgICAgICAgICAgaWYgKG9sZENoaWxkcmVuQnlLZXkuaGFzKGtleSkpIHtcbiAgICAgICAgICAgICAgICBndWVzcyA9IG9sZENoaWxkcmVuQnlLZXkuZ2V0KGtleSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAob2xkQ2hpbGRyZW5XaXRob3V0S2V5Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGd1ZXNzID0gb2xkQ2hpbGRyZW5XaXRob3V0S2V5LnNoaWZ0KCk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHYubWF0Y2hlcyhndWVzcykpIHtcbiAgICAgICAgICAgIG1hdGNoID0gZ3Vlc3M7XG4gICAgICAgIH1cbiAgICAgICAgbWF0Y2hlcy5wdXNoKFt2LCBtYXRjaF0pO1xuICAgICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgICAgIHVubWF0Y2hlZC5kZWxldGUobWF0Y2gpO1xuICAgICAgICB9XG4gICAgfSk7XG4gICAgcmV0dXJuIHsgbWF0Y2hlcywgdW5tYXRjaGVkIH07XG59XG5cbmZ1bmN0aW9uIGV4ZWN1dGUodm5vZGUsIG9sZCwgdmRvbSkge1xuICAgIGNvbnN0IGRpZE1hdGNoID0gdm5vZGUgJiYgb2xkICYmIHZub2RlLm1hdGNoZXMob2xkKTtcbiAgICBpZiAoZGlkTWF0Y2ggJiYgdm5vZGUucGFyZW50KCkgPT09IG9sZC5wYXJlbnQoKSkge1xuICAgICAgICB2ZG9tLnJlcGxhY2VWTm9kZShvbGQsIHZub2RlKTtcbiAgICB9XG4gICAgZWxzZSBpZiAodm5vZGUpIHtcbiAgICAgICAgdmRvbS5hZGRWTm9kZSh2bm9kZSk7XG4gICAgfVxuICAgIGNvbnN0IGNvbnRleHQgPSB2ZG9tLmdldFZOb2RlQ29udGV4dCh2bm9kZSk7XG4gICAgY29uc3Qgb2xkQ29udGV4dCA9IHZkb20uZ2V0Vk5vZGVDb250ZXh0KG9sZCk7XG4gICAgaWYgKG9sZCAmJiAhZGlkTWF0Y2gpIHtcbiAgICAgICAgb2xkLmRldGFjaChvbGRDb250ZXh0KTtcbiAgICAgICAgb2xkLmNoaWxkcmVuKCkuZm9yRWFjaCgodikgPT4gZXhlY3V0ZShudWxsLCB2LCB2ZG9tKSk7XG4gICAgICAgIG9sZC5kZXRhY2hlZChvbGRDb250ZXh0KTtcbiAgICB9XG4gICAgaWYgKHZub2RlICYmICFkaWRNYXRjaCkge1xuICAgICAgICB2bm9kZS5hdHRhY2goY29udGV4dCk7XG4gICAgICAgIHZub2RlLmNoaWxkcmVuKCkuZm9yRWFjaCgodikgPT4gZXhlY3V0ZSh2LCBudWxsLCB2ZG9tKSk7XG4gICAgICAgIHZub2RlLmF0dGFjaGVkKGNvbnRleHQpO1xuICAgIH1cbiAgICBpZiAoZGlkTWF0Y2gpIHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gdm5vZGUudXBkYXRlKG9sZCwgY29udGV4dCk7XG4gICAgICAgIGlmIChyZXN1bHQgIT09IHZkb20uTEVBVkUpIHtcbiAgICAgICAgICAgIGNvbnN0IHsgbWF0Y2hlcywgdW5tYXRjaGVkIH0gPSBtYXRjaENoaWxkcmVuKHZub2RlLCBvbGQpO1xuICAgICAgICAgICAgdW5tYXRjaGVkLmZvckVhY2goKHYpID0+IGV4ZWN1dGUobnVsbCwgdiwgdmRvbSkpO1xuICAgICAgICAgICAgbWF0Y2hlcy5mb3JFYWNoKChbdiwgb10pID0+IGV4ZWN1dGUodiwgbywgdmRvbSkpO1xuICAgICAgICAgICAgdm5vZGUudXBkYXRlZChjb250ZXh0KTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuZnVuY3Rpb24gaXNTcGVjKHgpIHtcbiAgICByZXR1cm4gaXNPYmplY3QoeCkgJiYgeC50eXBlICE9IG51bGwgJiYgeC5ub2RlVHlwZSA9PSBudWxsO1xufVxuZnVuY3Rpb24gaXNOb2RlU3BlYyh4KSB7XG4gICAgcmV0dXJuIGlzU3BlYyh4KSAmJiB0eXBlb2YgeC50eXBlID09PSAnc3RyaW5nJztcbn1cbmZ1bmN0aW9uIGlzQ29tcG9uZW50U3BlYyh4KSB7XG4gICAgcmV0dXJuIGlzU3BlYyh4KSAmJiB0eXBlb2YgeC50eXBlID09PSAnZnVuY3Rpb24nO1xufVxuXG5jbGFzcyBWTm9kZUJhc2Uge1xuICAgIGNvbnN0cnVjdG9yKHBhcmVudCkge1xuICAgICAgICB0aGlzLnBhcmVudFZOb2RlID0gcGFyZW50O1xuICAgIH1cbiAgICBrZXkoKSB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICBwYXJlbnQodm5vZGUpIHtcbiAgICAgICAgaWYgKHZub2RlKSB7XG4gICAgICAgICAgICB0aGlzLnBhcmVudFZOb2RlID0gdm5vZGU7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMucGFyZW50Vk5vZGU7XG4gICAgfVxuICAgIGNoaWxkcmVuKCkge1xuICAgICAgICByZXR1cm4gW107XG4gICAgfVxuICAgIGF0dGFjaChjb250ZXh0KSB7IH1cbiAgICBkZXRhY2goY29udGV4dCkgeyB9XG4gICAgdXBkYXRlKG9sZCwgY29udGV4dCkge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgYXR0YWNoZWQoY29udGV4dCkgeyB9XG4gICAgZGV0YWNoZWQoY29udGV4dCkgeyB9XG4gICAgdXBkYXRlZChjb250ZXh0KSB7IH1cbn1cbmZ1bmN0aW9uIG5vZGVNYXRjaGVzU3BlYyhub2RlLCBzcGVjKSB7XG4gICAgcmV0dXJuIG5vZGUgaW5zdGFuY2VvZiBFbGVtZW50ICYmIHNwZWMudHlwZSA9PT0gbm9kZS50YWdOYW1lLnRvTG93ZXJDYXNlKCk7XG59XG5jb25zdCByZWZpbmVkRWxlbWVudHMgPSBuZXcgV2Vha01hcCgpO1xuZnVuY3Rpb24gbWFya0VsZW1lbnRBc1JlZmluZWQoZWxlbWVudCwgdmRvbSkge1xuICAgIGxldCByZWZpbmVkO1xuICAgIGlmIChyZWZpbmVkRWxlbWVudHMuaGFzKHZkb20pKSB7XG4gICAgICAgIHJlZmluZWQgPSByZWZpbmVkRWxlbWVudHMuZ2V0KHZkb20pO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgcmVmaW5lZCA9IG5ldyBXZWFrU2V0KCk7XG4gICAgICAgIHJlZmluZWRFbGVtZW50cy5zZXQodmRvbSwgcmVmaW5lZCk7XG4gICAgfVxuICAgIHJlZmluZWQuYWRkKGVsZW1lbnQpO1xufVxuZnVuY3Rpb24gaXNFbGVtZW50UmVmaW5lZChlbGVtZW50LCB2ZG9tKSB7XG4gICAgcmV0dXJuIHJlZmluZWRFbGVtZW50cy5oYXModmRvbSkgJiYgcmVmaW5lZEVsZW1lbnRzLmdldCh2ZG9tKS5oYXMoZWxlbWVudCk7XG59XG5jbGFzcyBFbGVtZW50Vk5vZGUgZXh0ZW5kcyBWTm9kZUJhc2Uge1xuICAgIGNvbnN0cnVjdG9yKHNwZWMsIHBhcmVudCkge1xuICAgICAgICBzdXBlcihwYXJlbnQpO1xuICAgICAgICB0aGlzLnNwZWMgPSBzcGVjO1xuICAgIH1cbiAgICBtYXRjaGVzKG90aGVyKSB7XG4gICAgICAgIHJldHVybiAob3RoZXIgaW5zdGFuY2VvZiBFbGVtZW50Vk5vZGUgJiYgdGhpcy5zcGVjLnR5cGUgPT09IG90aGVyLnNwZWMudHlwZSk7XG4gICAgfVxuICAgIGtleSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc3BlYy5wcm9wcy5rZXk7XG4gICAgfVxuICAgIGNoaWxkcmVuKCkge1xuICAgICAgICByZXR1cm4gW3RoaXMuY2hpbGRdO1xuICAgIH1cbiAgICBnZXRFeGlzdGluZ0VsZW1lbnQoY29udGV4dCkge1xuICAgICAgICBjb25zdCBwYXJlbnQgPSBjb250ZXh0LnBhcmVudDtcbiAgICAgICAgY29uc3QgZXhpc3RpbmcgPSBjb250ZXh0Lm5vZGU7XG4gICAgICAgIGxldCBlbGVtZW50O1xuICAgICAgICBpZiAobm9kZU1hdGNoZXNTcGVjKGV4aXN0aW5nLCB0aGlzLnNwZWMpKSB7XG4gICAgICAgICAgICBlbGVtZW50ID0gZXhpc3Rpbmc7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoIWlzRWxlbWVudFJlZmluZWQocGFyZW50LCBjb250ZXh0LnZkb20pICYmXG4gICAgICAgICAgICBjb250ZXh0LnZkb20uaXNET01Ob2RlQ2FwdHVyZWQocGFyZW50KSkge1xuICAgICAgICAgICAgY29uc3Qgc2libGluZyA9IGNvbnRleHQuc2libGluZztcbiAgICAgICAgICAgIGNvbnN0IGd1ZXNzID0gc2libGluZ1xuICAgICAgICAgICAgICAgID8gc2libGluZy5uZXh0RWxlbWVudFNpYmxpbmdcbiAgICAgICAgICAgICAgICA6IHBhcmVudC5maXJzdEVsZW1lbnRDaGlsZDtcbiAgICAgICAgICAgIGlmIChndWVzcyAmJiAhY29udGV4dC52ZG9tLmlzRE9NTm9kZUNhcHR1cmVkKGd1ZXNzKSkge1xuICAgICAgICAgICAgICAgIGlmIChub2RlTWF0Y2hlc1NwZWMoZ3Vlc3MsIHRoaXMuc3BlYykpIHtcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudCA9IGd1ZXNzO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcGFyZW50LnJlbW92ZUNoaWxkKGd1ZXNzKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGVsZW1lbnQ7XG4gICAgfVxuICAgIGF0dGFjaChjb250ZXh0KSB7XG4gICAgICAgIGxldCBlbGVtZW50O1xuICAgICAgICBjb25zdCBleGlzdGluZyA9IHRoaXMuZ2V0RXhpc3RpbmdFbGVtZW50KGNvbnRleHQpO1xuICAgICAgICBpZiAoZXhpc3RpbmcpIHtcbiAgICAgICAgICAgIGVsZW1lbnQgPSBleGlzdGluZztcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGVsZW1lbnQgPSBjcmVhdGVFbGVtZW50KHRoaXMuc3BlYywgY29udGV4dC5wYXJlbnQpO1xuICAgICAgICAgICAgbWFya0VsZW1lbnRBc1JlZmluZWQoZWxlbWVudCwgY29udGV4dC52ZG9tKTtcbiAgICAgICAgfVxuICAgICAgICBzeW5jQXR0cnMoZWxlbWVudCwgdGhpcy5zcGVjLnByb3BzLCBudWxsKTtcbiAgICAgICAgdGhpcy5jaGlsZCA9IGNyZWF0ZURPTVZOb2RlKGVsZW1lbnQsIHRoaXMuc3BlYy5jaGlsZHJlbiwgdGhpcywgZmFsc2UpO1xuICAgIH1cbiAgICB1cGRhdGUocHJldiwgY29udGV4dCkge1xuICAgICAgICBjb25zdCBwcmV2Q29udGV4dCA9IGNvbnRleHQudmRvbS5nZXRWTm9kZUNvbnRleHQocHJldik7XG4gICAgICAgIGNvbnN0IGVsZW1lbnQgPSBwcmV2Q29udGV4dC5ub2RlO1xuICAgICAgICBzeW5jQXR0cnMoZWxlbWVudCwgdGhpcy5zcGVjLnByb3BzLCBwcmV2LnNwZWMucHJvcHMpO1xuICAgICAgICB0aGlzLmNoaWxkID0gY3JlYXRlRE9NVk5vZGUoZWxlbWVudCwgdGhpcy5zcGVjLmNoaWxkcmVuLCB0aGlzLCBmYWxzZSk7XG4gICAgfVxuICAgIGF0dGFjaGVkKGNvbnRleHQpIHtcbiAgICAgICAgY29uc3QgeyBvbmNyZWF0ZSwgb25yZW5kZXIgfSA9IHRoaXMuc3BlYy5wcm9wcztcbiAgICAgICAgaWYgKG9uY3JlYXRlKSB7XG4gICAgICAgICAgICBvbmNyZWF0ZShjb250ZXh0Lm5vZGUpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChvbnJlbmRlcikge1xuICAgICAgICAgICAgb25yZW5kZXIoY29udGV4dC5ub2RlKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBkZXRhY2hlZChjb250ZXh0KSB7XG4gICAgICAgIGNvbnN0IHsgb25yZW1vdmUgfSA9IHRoaXMuc3BlYy5wcm9wcztcbiAgICAgICAgaWYgKG9ucmVtb3ZlKSB7XG4gICAgICAgICAgICBvbnJlbW92ZShjb250ZXh0Lm5vZGUpO1xuICAgICAgICB9XG4gICAgfVxuICAgIHVwZGF0ZWQoY29udGV4dCkge1xuICAgICAgICBjb25zdCB7IG9udXBkYXRlLCBvbnJlbmRlciB9ID0gdGhpcy5zcGVjLnByb3BzO1xuICAgICAgICBpZiAob251cGRhdGUpIHtcbiAgICAgICAgICAgIG9udXBkYXRlKGNvbnRleHQubm9kZSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG9ucmVuZGVyKSB7XG4gICAgICAgICAgICBvbnJlbmRlcihjb250ZXh0Lm5vZGUpO1xuICAgICAgICB9XG4gICAgfVxufVxuY29uc3Qgc3ltYm9scyA9IHtcbiAgICBDUkVBVEVEOiBTeW1ib2woKSxcbiAgICBSRU1PVkVEOiBTeW1ib2woKSxcbiAgICBVUERBVEVEOiBTeW1ib2woKSxcbiAgICBSRU5ERVJFRDogU3ltYm9sKCksXG4gICAgQUNUSVZFOiBTeW1ib2woKSxcbiAgICBERUZBVUxUU19BU1NJR05FRDogU3ltYm9sKCksXG59O1xuY29uc3QgZG9tUGx1Z2lucyA9IFtcbiAgICBbUExVR0lOU19DUkVBVEVfRUxFTUVOVCwgcGx1Z2luc0NyZWF0ZUVsZW1lbnRdLFxuICAgIFtQTFVHSU5TX1NFVF9BVFRSSUJVVEUsIHBsdWdpbnNTZXRBdHRyaWJ1dGVdLFxuXTtcbmNsYXNzIENvbXBvbmVudFZOb2RlIGV4dGVuZHMgVk5vZGVCYXNlIHtcbiAgICBjb25zdHJ1Y3RvcihzcGVjLCBwYXJlbnQpIHtcbiAgICAgICAgc3VwZXIocGFyZW50KTtcbiAgICAgICAgdGhpcy5sb2NrID0gZmFsc2U7XG4gICAgICAgIHRoaXMuc3BlYyA9IHNwZWM7XG4gICAgICAgIHRoaXMucHJldiA9IG51bGw7XG4gICAgICAgIHRoaXMuc3RvcmUgPSB7fTtcbiAgICAgICAgdGhpcy5zdG9yZVtzeW1ib2xzLkFDVElWRV0gPSB0aGlzO1xuICAgIH1cbiAgICBtYXRjaGVzKG90aGVyKSB7XG4gICAgICAgIHJldHVybiAob3RoZXIgaW5zdGFuY2VvZiBDb21wb25lbnRWTm9kZSAmJlxuICAgICAgICAgICAgdGhpcy5zcGVjLnR5cGUgPT09IG90aGVyLnNwZWMudHlwZSk7XG4gICAgfVxuICAgIGtleSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc3BlYy5wcm9wcy5rZXk7XG4gICAgfVxuICAgIGNoaWxkcmVuKCkge1xuICAgICAgICByZXR1cm4gW3RoaXMuY2hpbGRdO1xuICAgIH1cbiAgICBjcmVhdGVDb250ZXh0KGNvbnRleHQpIHtcbiAgICAgICAgY29uc3QgeyBwYXJlbnQgfSA9IGNvbnRleHQ7XG4gICAgICAgIGNvbnN0IHsgc3BlYywgcHJldiwgc3RvcmUgfSA9IHRoaXM7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBzcGVjLFxuICAgICAgICAgICAgcHJldixcbiAgICAgICAgICAgIHN0b3JlLFxuICAgICAgICAgICAgZ2V0IG5vZGUoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNvbnRleHQubm9kZTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBnZXQgbm9kZXMoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNvbnRleHQubm9kZXM7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgcGFyZW50LFxuICAgICAgICAgICAgb25DcmVhdGU6IChmbikgPT4gKHN0b3JlW3N5bWJvbHMuQ1JFQVRFRF0gPSBmbiksXG4gICAgICAgICAgICBvblVwZGF0ZTogKGZuKSA9PiAoc3RvcmVbc3ltYm9scy5VUERBVEVEXSA9IGZuKSxcbiAgICAgICAgICAgIG9uUmVtb3ZlOiAoZm4pID0+IChzdG9yZVtzeW1ib2xzLlJFTU9WRURdID0gZm4pLFxuICAgICAgICAgICAgb25SZW5kZXI6IChmbikgPT4gKHN0b3JlW3N5bWJvbHMuUkVOREVSRURdID0gZm4pLFxuICAgICAgICAgICAgcmVmcmVzaDogKCkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGFjdGl2ZVZOb2RlID0gc3RvcmVbc3ltYm9scy5BQ1RJVkVdO1xuICAgICAgICAgICAgICAgIGFjdGl2ZVZOb2RlLnJlZnJlc2goY29udGV4dCk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgbGVhdmU6ICgpID0+IGNvbnRleHQudmRvbS5MRUFWRSxcbiAgICAgICAgICAgIGdldFN0b3JlOiAoZGVmYXVsdHMpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZGVmYXVsdHMgJiYgIXN0b3JlW3N5bWJvbHMuREVGQVVMVFNfQVNTSUdORURdKSB7XG4gICAgICAgICAgICAgICAgICAgIE9iamVjdC5lbnRyaWVzKGRlZmF1bHRzKS5mb3JFYWNoKChbcHJvcCwgdmFsdWVdKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdG9yZVtwcm9wXSA9IHZhbHVlO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgc3RvcmVbc3ltYm9scy5ERUZBVUxUU19BU1NJR05FRF0gPSB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gc3RvcmU7XG4gICAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgIH1cbiAgICB1bmJveChjb250ZXh0KSB7XG4gICAgICAgIGNvbnN0IENvbXBvbmVudCA9IHRoaXMuc3BlYy50eXBlO1xuICAgICAgICBjb25zdCBwcm9wcyA9IHRoaXMuc3BlYy5wcm9wcztcbiAgICAgICAgY29uc3QgY2hpbGRyZW4gPSB0aGlzLnNwZWMuY2hpbGRyZW47XG4gICAgICAgIHRoaXMubG9jayA9IHRydWU7XG4gICAgICAgIGNvbnN0IHByZXZDb250ZXh0ID0gQ29tcG9uZW50Vk5vZGUuY29udGV4dDtcbiAgICAgICAgQ29tcG9uZW50Vk5vZGUuY29udGV4dCA9IHRoaXMuY3JlYXRlQ29udGV4dChjb250ZXh0KTtcbiAgICAgICAgbGV0IHVuYm94ZWQgPSBudWxsO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgdW5ib3hlZCA9IENvbXBvbmVudChwcm9wcywgLi4uY2hpbGRyZW4pO1xuICAgICAgICB9XG4gICAgICAgIGZpbmFsbHkge1xuICAgICAgICAgICAgQ29tcG9uZW50Vk5vZGUuY29udGV4dCA9IHByZXZDb250ZXh0O1xuICAgICAgICAgICAgdGhpcy5sb2NrID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHVuYm94ZWQ7XG4gICAgfVxuICAgIHJlZnJlc2goY29udGV4dCkge1xuICAgICAgICBpZiAodGhpcy5sb2NrKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0NhbGxpbmcgcmVmcmVzaCBkdXJpbmcgdW5ib3hpbmcgY2F1c2VzIGluZmluaXRlIGxvb3AnKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnByZXYgPSB0aGlzLnNwZWM7XG4gICAgICAgIGNvbnN0IGxhdGVzdENvbnRleHQgPSBjb250ZXh0LnZkb20uZ2V0Vk5vZGVDb250ZXh0KHRoaXMpO1xuICAgICAgICBjb25zdCB1bmJveGVkID0gdGhpcy51bmJveChsYXRlc3RDb250ZXh0KTtcbiAgICAgICAgaWYgKHVuYm94ZWQgPT09IGNvbnRleHQudmRvbS5MRUFWRSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHByZXZDaGlsZCA9IHRoaXMuY2hpbGQ7XG4gICAgICAgIHRoaXMuY2hpbGQgPSBjcmVhdGVWTm9kZSh1bmJveGVkLCB0aGlzKTtcbiAgICAgICAgY29udGV4dC52ZG9tLmV4ZWN1dGUodGhpcy5jaGlsZCwgcHJldkNoaWxkKTtcbiAgICAgICAgdGhpcy51cGRhdGVkKGNvbnRleHQpO1xuICAgIH1cbiAgICBhZGRQbHVnaW5zKCkge1xuICAgICAgICBhZGRDb21wb25lbnRQbHVnaW5zKHRoaXMuc3BlYy50eXBlLCBkb21QbHVnaW5zKTtcbiAgICB9XG4gICAgZGVsZXRlUGx1Z2lucygpIHtcbiAgICAgICAgZGVsZXRlQ29tcG9uZW50UGx1Z2lucyh0aGlzLnNwZWMudHlwZSwgZG9tUGx1Z2lucyk7XG4gICAgfVxuICAgIGF0dGFjaChjb250ZXh0KSB7XG4gICAgICAgIHRoaXMuYWRkUGx1Z2lucygpO1xuICAgICAgICBjb25zdCB1bmJveGVkID0gdGhpcy51bmJveChjb250ZXh0KTtcbiAgICAgICAgY29uc3QgY2hpbGRTcGVjID0gdW5ib3hlZCA9PT0gY29udGV4dC52ZG9tLkxFQVZFID8gbnVsbCA6IHVuYm94ZWQ7XG4gICAgICAgIHRoaXMuY2hpbGQgPSBjcmVhdGVWTm9kZShjaGlsZFNwZWMsIHRoaXMpO1xuICAgIH1cbiAgICB1cGRhdGUocHJldiwgY29udGV4dCkge1xuICAgICAgICB0aGlzLnN0b3JlID0gcHJldi5zdG9yZTtcbiAgICAgICAgdGhpcy5wcmV2ID0gcHJldi5zcGVjO1xuICAgICAgICB0aGlzLnN0b3JlW3N5bWJvbHMuQUNUSVZFXSA9IHRoaXM7XG4gICAgICAgIGNvbnN0IHByZXZDb250ZXh0ID0gY29udGV4dC52ZG9tLmdldFZOb2RlQ29udGV4dChwcmV2KTtcbiAgICAgICAgdGhpcy5hZGRQbHVnaW5zKCk7XG4gICAgICAgIGNvbnN0IHVuYm94ZWQgPSB0aGlzLnVuYm94KHByZXZDb250ZXh0KTtcbiAgICAgICAgbGV0IHJlc3VsdCA9IG51bGw7XG4gICAgICAgIGlmICh1bmJveGVkID09PSBjb250ZXh0LnZkb20uTEVBVkUpIHtcbiAgICAgICAgICAgIHJlc3VsdCA9IHVuYm94ZWQ7XG4gICAgICAgICAgICB0aGlzLmNoaWxkID0gcHJldi5jaGlsZDtcbiAgICAgICAgICAgIGNvbnRleHQudmRvbS5hZG9wdFZOb2RlKHRoaXMuY2hpbGQsIHRoaXMpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5jaGlsZCA9IGNyZWF0ZVZOb2RlKHVuYm94ZWQsIHRoaXMpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIGhhbmRsZShldmVudCwgY29udGV4dCkge1xuICAgICAgICBjb25zdCBmbiA9IHRoaXMuc3RvcmVbZXZlbnRdO1xuICAgICAgICBpZiAoZm4pIHtcbiAgICAgICAgICAgIGNvbnN0IG5vZGVzID0gY29udGV4dC5ub2Rlcy5sZW5ndGggPT09IDAgPyBbbnVsbF0gOiBjb250ZXh0Lm5vZGVzO1xuICAgICAgICAgICAgZm4oLi4ubm9kZXMpO1xuICAgICAgICB9XG4gICAgfVxuICAgIGF0dGFjaGVkKGNvbnRleHQpIHtcbiAgICAgICAgdGhpcy5kZWxldGVQbHVnaW5zKCk7XG4gICAgICAgIHRoaXMuaGFuZGxlKHN5bWJvbHMuQ1JFQVRFRCwgY29udGV4dCk7XG4gICAgICAgIHRoaXMuaGFuZGxlKHN5bWJvbHMuUkVOREVSRUQsIGNvbnRleHQpO1xuICAgIH1cbiAgICBkZXRhY2hlZChjb250ZXh0KSB7XG4gICAgICAgIHRoaXMuaGFuZGxlKHN5bWJvbHMuUkVNT1ZFRCwgY29udGV4dCk7XG4gICAgfVxuICAgIHVwZGF0ZWQoY29udGV4dCkge1xuICAgICAgICB0aGlzLmRlbGV0ZVBsdWdpbnMoKTtcbiAgICAgICAgdGhpcy5oYW5kbGUoc3ltYm9scy5VUERBVEVELCBjb250ZXh0KTtcbiAgICAgICAgdGhpcy5oYW5kbGUoc3ltYm9scy5SRU5ERVJFRCwgY29udGV4dCk7XG4gICAgfVxufVxuQ29tcG9uZW50Vk5vZGUuY29udGV4dCA9IG51bGw7XG5mdW5jdGlvbiBnZXRDb21wb25lbnRDb250ZXh0KCkge1xuICAgIHJldHVybiBDb21wb25lbnRWTm9kZS5jb250ZXh0O1xufVxuY2xhc3MgVGV4dFZOb2RlIGV4dGVuZHMgVk5vZGVCYXNlIHtcbiAgICBjb25zdHJ1Y3Rvcih0ZXh0LCBwYXJlbnQpIHtcbiAgICAgICAgc3VwZXIocGFyZW50KTtcbiAgICAgICAgdGhpcy50ZXh0ID0gdGV4dDtcbiAgICB9XG4gICAgbWF0Y2hlcyhvdGhlcikge1xuICAgICAgICByZXR1cm4gb3RoZXIgaW5zdGFuY2VvZiBUZXh0Vk5vZGU7XG4gICAgfVxuICAgIGNoaWxkcmVuKCkge1xuICAgICAgICByZXR1cm4gW3RoaXMuY2hpbGRdO1xuICAgIH1cbiAgICBnZXRFeGlzdGluZ05vZGUoY29udGV4dCkge1xuICAgICAgICBjb25zdCB7IHBhcmVudCB9ID0gY29udGV4dDtcbiAgICAgICAgbGV0IG5vZGU7XG4gICAgICAgIGlmIChjb250ZXh0Lm5vZGUgaW5zdGFuY2VvZiBUZXh0KSB7XG4gICAgICAgICAgICBub2RlID0gY29udGV4dC5ub2RlO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKCFpc0VsZW1lbnRSZWZpbmVkKHBhcmVudCwgY29udGV4dC52ZG9tKSAmJlxuICAgICAgICAgICAgY29udGV4dC52ZG9tLmlzRE9NTm9kZUNhcHR1cmVkKHBhcmVudCkpIHtcbiAgICAgICAgICAgIGNvbnN0IHNpYmxpbmcgPSBjb250ZXh0LnNpYmxpbmc7XG4gICAgICAgICAgICBjb25zdCBndWVzcyA9IHNpYmxpbmcgPyBzaWJsaW5nLm5leHRTaWJsaW5nIDogcGFyZW50LmZpcnN0Q2hpbGQ7XG4gICAgICAgICAgICBpZiAoZ3Vlc3MgJiZcbiAgICAgICAgICAgICAgICAhY29udGV4dC52ZG9tLmlzRE9NTm9kZUNhcHR1cmVkKGd1ZXNzKSAmJlxuICAgICAgICAgICAgICAgIGd1ZXNzIGluc3RhbmNlb2YgVGV4dCkge1xuICAgICAgICAgICAgICAgIG5vZGUgPSBndWVzcztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbm9kZTtcbiAgICB9XG4gICAgYXR0YWNoKGNvbnRleHQpIHtcbiAgICAgICAgY29uc3QgZXhpc3RpbmcgPSB0aGlzLmdldEV4aXN0aW5nTm9kZShjb250ZXh0KTtcbiAgICAgICAgbGV0IG5vZGU7XG4gICAgICAgIGlmIChleGlzdGluZykge1xuICAgICAgICAgICAgbm9kZSA9IGV4aXN0aW5nO1xuICAgICAgICAgICAgbm9kZS50ZXh0Q29udGVudCA9IHRoaXMudGV4dDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIG5vZGUgPSBkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZSh0aGlzLnRleHQpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuY2hpbGQgPSBjcmVhdGVWTm9kZShub2RlLCB0aGlzKTtcbiAgICB9XG4gICAgdXBkYXRlKHByZXYsIGNvbnRleHQpIHtcbiAgICAgICAgY29uc3QgcHJldkNvbnRleHQgPSBjb250ZXh0LnZkb20uZ2V0Vk5vZGVDb250ZXh0KHByZXYpO1xuICAgICAgICBjb25zdCB7IG5vZGUgfSA9IHByZXZDb250ZXh0O1xuICAgICAgICBpZiAodGhpcy50ZXh0ICE9PSBwcmV2LnRleHQpIHtcbiAgICAgICAgICAgIG5vZGUudGV4dENvbnRlbnQgPSB0aGlzLnRleHQ7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5jaGlsZCA9IGNyZWF0ZVZOb2RlKG5vZGUsIHRoaXMpO1xuICAgIH1cbn1cbmNsYXNzIElubGluZUZ1bmN0aW9uVk5vZGUgZXh0ZW5kcyBWTm9kZUJhc2Uge1xuICAgIGNvbnN0cnVjdG9yKGZuLCBwYXJlbnQpIHtcbiAgICAgICAgc3VwZXIocGFyZW50KTtcbiAgICAgICAgdGhpcy5mbiA9IGZuO1xuICAgIH1cbiAgICBtYXRjaGVzKG90aGVyKSB7XG4gICAgICAgIHJldHVybiBvdGhlciBpbnN0YW5jZW9mIElubGluZUZ1bmN0aW9uVk5vZGU7XG4gICAgfVxuICAgIGNoaWxkcmVuKCkge1xuICAgICAgICByZXR1cm4gW3RoaXMuY2hpbGRdO1xuICAgIH1cbiAgICBjYWxsKGNvbnRleHQpIHtcbiAgICAgICAgY29uc3QgZm4gPSB0aGlzLmZuO1xuICAgICAgICBjb25zdCBpbmxpbmVGbkNvbnRleHQgPSB7XG4gICAgICAgICAgICBwYXJlbnQ6IGNvbnRleHQucGFyZW50LFxuICAgICAgICAgICAgZ2V0IG5vZGUoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNvbnRleHQubm9kZTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBnZXQgbm9kZXMoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNvbnRleHQubm9kZXM7XG4gICAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgICAgICBjb25zdCByZXN1bHQgPSBmbihpbmxpbmVGbkNvbnRleHQpO1xuICAgICAgICB0aGlzLmNoaWxkID0gY3JlYXRlVk5vZGUocmVzdWx0LCB0aGlzKTtcbiAgICB9XG4gICAgYXR0YWNoKGNvbnRleHQpIHtcbiAgICAgICAgdGhpcy5jYWxsKGNvbnRleHQpO1xuICAgIH1cbiAgICB1cGRhdGUocHJldiwgY29udGV4dCkge1xuICAgICAgICBjb25zdCBwcmV2Q29udGV4dCA9IGNvbnRleHQudmRvbS5nZXRWTm9kZUNvbnRleHQocHJldik7XG4gICAgICAgIHRoaXMuY2FsbChwcmV2Q29udGV4dCk7XG4gICAgfVxufVxuY2xhc3MgTnVsbFZOb2RlIGV4dGVuZHMgVk5vZGVCYXNlIHtcbiAgICBtYXRjaGVzKG90aGVyKSB7XG4gICAgICAgIHJldHVybiBvdGhlciBpbnN0YW5jZW9mIE51bGxWTm9kZTtcbiAgICB9XG59XG5jbGFzcyBET01WTm9kZSBleHRlbmRzIFZOb2RlQmFzZSB7XG4gICAgY29uc3RydWN0b3Iobm9kZSwgY2hpbGRTcGVjcywgcGFyZW50LCBpc05hdGl2ZSkge1xuICAgICAgICBzdXBlcihwYXJlbnQpO1xuICAgICAgICB0aGlzLm5vZGUgPSBub2RlO1xuICAgICAgICB0aGlzLmNoaWxkU3BlY3MgPSBjaGlsZFNwZWNzO1xuICAgICAgICB0aGlzLmlzTmF0aXZlID0gaXNOYXRpdmU7XG4gICAgfVxuICAgIG1hdGNoZXMob3RoZXIpIHtcbiAgICAgICAgcmV0dXJuIG90aGVyIGluc3RhbmNlb2YgRE9NVk5vZGUgJiYgdGhpcy5ub2RlID09PSBvdGhlci5ub2RlO1xuICAgIH1cbiAgICB3cmFwKCkge1xuICAgICAgICB0aGlzLmNoaWxkVk5vZGVzID0gdGhpcy5jaGlsZFNwZWNzLm1hcCgoc3BlYykgPT4gY3JlYXRlVk5vZGUoc3BlYywgdGhpcykpO1xuICAgIH1cbiAgICBpbnNlcnROb2RlKGNvbnRleHQpIHtcbiAgICAgICAgY29uc3QgeyBwYXJlbnQsIHNpYmxpbmcgfSA9IGNvbnRleHQ7XG4gICAgICAgIGNvbnN0IHNob3VsZEluc2VydCA9ICEocGFyZW50ID09PSB0aGlzLm5vZGUucGFyZW50RWxlbWVudCAmJlxuICAgICAgICAgICAgc2libGluZyA9PT0gdGhpcy5ub2RlLnByZXZpb3VzU2libGluZyk7XG4gICAgICAgIGlmIChzaG91bGRJbnNlcnQpIHtcbiAgICAgICAgICAgIGNvbnN0IHRhcmdldCA9IHNpYmxpbmcgPyBzaWJsaW5nLm5leHRTaWJsaW5nIDogcGFyZW50LmZpcnN0Q2hpbGQ7XG4gICAgICAgICAgICBwYXJlbnQuaW5zZXJ0QmVmb3JlKHRoaXMubm9kZSwgdGFyZ2V0KTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBhdHRhY2goY29udGV4dCkge1xuICAgICAgICB0aGlzLndyYXAoKTtcbiAgICAgICAgdGhpcy5pbnNlcnROb2RlKGNvbnRleHQpO1xuICAgIH1cbiAgICBkZXRhY2goY29udGV4dCkge1xuICAgICAgICBjb250ZXh0LnBhcmVudC5yZW1vdmVDaGlsZCh0aGlzLm5vZGUpO1xuICAgIH1cbiAgICB1cGRhdGUocHJldiwgY29udGV4dCkge1xuICAgICAgICB0aGlzLndyYXAoKTtcbiAgICAgICAgdGhpcy5pbnNlcnROb2RlKGNvbnRleHQpO1xuICAgIH1cbiAgICBjbGVhbnVwRE9NQ2hpbGRyZW4oY29udGV4dCkge1xuICAgICAgICBjb25zdCBlbGVtZW50ID0gdGhpcy5ub2RlO1xuICAgICAgICBmb3IgKGxldCBjdXJyZW50ID0gZWxlbWVudC5sYXN0Q2hpbGQ7IGN1cnJlbnQgIT0gbnVsbDspIHtcbiAgICAgICAgICAgIGlmIChjb250ZXh0LnZkb20uaXNET01Ob2RlQ2FwdHVyZWQoY3VycmVudCkpIHtcbiAgICAgICAgICAgICAgICBjdXJyZW50ID0gY3VycmVudC5wcmV2aW91c1NpYmxpbmc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zdCBwcmV2ID0gY3VycmVudC5wcmV2aW91c1NpYmxpbmc7XG4gICAgICAgICAgICAgICAgZWxlbWVudC5yZW1vdmVDaGlsZChjdXJyZW50KTtcbiAgICAgICAgICAgICAgICBjdXJyZW50ID0gcHJldjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICByZWZpbmUoY29udGV4dCkge1xuICAgICAgICBpZiAoIXRoaXMuaXNOYXRpdmUpIHtcbiAgICAgICAgICAgIHRoaXMuY2xlYW51cERPTUNoaWxkcmVuKGNvbnRleHQpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGVsZW1lbnQgPSB0aGlzLm5vZGU7XG4gICAgICAgIG1hcmtFbGVtZW50QXNSZWZpbmVkKGVsZW1lbnQsIGNvbnRleHQudmRvbSk7XG4gICAgfVxuICAgIGF0dGFjaGVkKGNvbnRleHQpIHtcbiAgICAgICAgY29uc3QgeyBub2RlIH0gPSB0aGlzO1xuICAgICAgICBpZiAobm9kZSBpbnN0YW5jZW9mIEVsZW1lbnQgJiZcbiAgICAgICAgICAgICFpc0VsZW1lbnRSZWZpbmVkKG5vZGUsIGNvbnRleHQudmRvbSkgJiZcbiAgICAgICAgICAgIGNvbnRleHQudmRvbS5pc0RPTU5vZGVDYXB0dXJlZChub2RlKSkge1xuICAgICAgICAgICAgdGhpcy5yZWZpbmUoY29udGV4dCk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgY2hpbGRyZW4oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmNoaWxkVk5vZGVzO1xuICAgIH1cbn1cbmZ1bmN0aW9uIGlzRE9NVk5vZGUodikge1xuICAgIHJldHVybiB2IGluc3RhbmNlb2YgRE9NVk5vZGU7XG59XG5mdW5jdGlvbiBjcmVhdGVET01WTm9kZShub2RlLCBjaGlsZFNwZWNzLCBwYXJlbnQsIGlzTmF0aXZlKSB7XG4gICAgcmV0dXJuIG5ldyBET01WTm9kZShub2RlLCBjaGlsZFNwZWNzLCBwYXJlbnQsIGlzTmF0aXZlKTtcbn1cbmNsYXNzIEFycmF5Vk5vZGUgZXh0ZW5kcyBWTm9kZUJhc2Uge1xuICAgIGNvbnN0cnVjdG9yKGl0ZW1zLCBrZXksIHBhcmVudCkge1xuICAgICAgICBzdXBlcihwYXJlbnQpO1xuICAgICAgICB0aGlzLml0ZW1zID0gaXRlbXM7XG4gICAgICAgIHRoaXMuaWQgPSBrZXk7XG4gICAgfVxuICAgIG1hdGNoZXMob3RoZXIpIHtcbiAgICAgICAgcmV0dXJuIG90aGVyIGluc3RhbmNlb2YgQXJyYXlWTm9kZTtcbiAgICB9XG4gICAga2V5KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5pZDtcbiAgICB9XG4gICAgY2hpbGRyZW4oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmNoaWxkVk5vZGVzO1xuICAgIH1cbiAgICB3cmFwKCkge1xuICAgICAgICB0aGlzLmNoaWxkVk5vZGVzID0gdGhpcy5pdGVtcy5tYXAoKHNwZWMpID0+IGNyZWF0ZVZOb2RlKHNwZWMsIHRoaXMpKTtcbiAgICB9XG4gICAgYXR0YWNoKCkge1xuICAgICAgICB0aGlzLndyYXAoKTtcbiAgICB9XG4gICAgdXBkYXRlKCkge1xuICAgICAgICB0aGlzLndyYXAoKTtcbiAgICB9XG59XG5mdW5jdGlvbiBjcmVhdGVWTm9kZShzcGVjLCBwYXJlbnQpIHtcbiAgICBpZiAoaXNOb2RlU3BlYyhzcGVjKSkge1xuICAgICAgICByZXR1cm4gbmV3IEVsZW1lbnRWTm9kZShzcGVjLCBwYXJlbnQpO1xuICAgIH1cbiAgICBpZiAoaXNDb21wb25lbnRTcGVjKHNwZWMpKSB7XG4gICAgICAgIGlmIChzcGVjLnR5cGUgPT09IEFycmF5KSB7XG4gICAgICAgICAgICByZXR1cm4gbmV3IEFycmF5Vk5vZGUoc3BlYy5jaGlsZHJlbiwgc3BlYy5wcm9wcy5rZXksIHBhcmVudCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5ldyBDb21wb25lbnRWTm9kZShzcGVjLCBwYXJlbnQpO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIHNwZWMgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHJldHVybiBuZXcgVGV4dFZOb2RlKHNwZWMsIHBhcmVudCk7XG4gICAgfVxuICAgIGlmIChzcGVjID09IG51bGwpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBOdWxsVk5vZGUocGFyZW50KTtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBzcGVjID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIHJldHVybiBuZXcgSW5saW5lRnVuY3Rpb25WTm9kZShzcGVjLCBwYXJlbnQpO1xuICAgIH1cbiAgICBpZiAoc3BlYyBpbnN0YW5jZW9mIE5vZGUpIHtcbiAgICAgICAgcmV0dXJuIGNyZWF0ZURPTVZOb2RlKHNwZWMsIFtdLCBwYXJlbnQsIHRydWUpO1xuICAgIH1cbiAgICBpZiAoQXJyYXkuaXNBcnJheShzcGVjKSkge1xuICAgICAgICByZXR1cm4gbmV3IEFycmF5Vk5vZGUoc3BlYywgbnVsbCwgcGFyZW50KTtcbiAgICB9XG4gICAgdGhyb3cgbmV3IEVycm9yKCdVbmFibGUgdG8gY3JlYXRlIHZpcnR1YWwgbm9kZSBmb3Igc3BlYycpO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVWRE9NKHJvb3ROb2RlKSB7XG4gICAgY29uc3QgY29udGV4dHMgPSBuZXcgV2Vha01hcCgpO1xuICAgIGNvbnN0IGh1YnMgPSBuZXcgV2Vha01hcCgpO1xuICAgIGNvbnN0IHBhcmVudE5vZGVzID0gbmV3IFdlYWtNYXAoKTtcbiAgICBjb25zdCBwYXNzaW5nTGlua3MgPSBuZXcgV2Vha01hcCgpO1xuICAgIGNvbnN0IGxpbmtlZFBhcmVudHMgPSBuZXcgV2Vha1NldCgpO1xuICAgIGNvbnN0IExFQVZFID0gU3ltYm9sKCk7XG4gICAgZnVuY3Rpb24gZXhlY3V0ZSQxKHZub2RlLCBvbGQpIHtcbiAgICAgICAgZXhlY3V0ZSh2bm9kZSwgb2xkLCB2ZG9tKTtcbiAgICB9XG4gICAgZnVuY3Rpb24gY3JlYXRWTm9kZUNvbnRleHQodm5vZGUpIHtcbiAgICAgICAgY29uc3QgcGFyZW50Tm9kZSA9IHBhcmVudE5vZGVzLmdldCh2bm9kZSk7XG4gICAgICAgIGNvbnRleHRzLnNldCh2bm9kZSwge1xuICAgICAgICAgICAgcGFyZW50OiBwYXJlbnROb2RlLFxuICAgICAgICAgICAgZ2V0IG5vZGUoKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgbGlua2VkID0gcGFzc2luZ0xpbmtzXG4gICAgICAgICAgICAgICAgICAgIC5nZXQodm5vZGUpXG4gICAgICAgICAgICAgICAgICAgIC5maW5kKChsaW5rKSA9PiBsaW5rLm5vZGUgIT0gbnVsbCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGxpbmtlZCA/IGxpbmtlZC5ub2RlIDogbnVsbDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBnZXQgbm9kZXMoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHBhc3NpbmdMaW5rc1xuICAgICAgICAgICAgICAgICAgICAuZ2V0KHZub2RlKVxuICAgICAgICAgICAgICAgICAgICAubWFwKChsaW5rKSA9PiBsaW5rLm5vZGUpXG4gICAgICAgICAgICAgICAgICAgIC5maWx0ZXIoKG5vZGUpID0+IG5vZGUpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGdldCBzaWJsaW5nKCkge1xuICAgICAgICAgICAgICAgIGlmIChwYXJlbnROb2RlID09PSByb290Tm9kZS5wYXJlbnRFbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBwYXNzaW5nTGlua3MuZ2V0KHZub2RlKS5maXJzdC5ub2RlLnByZXZpb3VzU2libGluZztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29uc3QgaHViID0gaHVicy5nZXQocGFyZW50Tm9kZSk7XG4gICAgICAgICAgICAgICAgbGV0IGN1cnJlbnQgPSBwYXNzaW5nTGlua3MuZ2V0KHZub2RlKS5maXJzdDtcbiAgICAgICAgICAgICAgICB3aGlsZSAoKGN1cnJlbnQgPSBodWIubGlua3MuYmVmb3JlKGN1cnJlbnQpKSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoY3VycmVudC5ub2RlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gY3VycmVudC5ub2RlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHZkb20sXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBmdW5jdGlvbiBjcmVhdGVSb290Vk5vZGVMaW5rcyh2bm9kZSkge1xuICAgICAgICBjb25zdCBwYXJlbnROb2RlID0gcm9vdE5vZGUucGFyZW50RWxlbWVudCB8fCBkb2N1bWVudC5jcmVhdGVEb2N1bWVudEZyYWdtZW50KCk7XG4gICAgICAgIGNvbnN0IG5vZGUgPSByb290Tm9kZTtcbiAgICAgICAgY29uc3QgbGlua3MgPSBuZXcgTGlua2VkTGlzdCh7XG4gICAgICAgICAgICBwYXJlbnROb2RlLFxuICAgICAgICAgICAgbm9kZSxcbiAgICAgICAgfSk7XG4gICAgICAgIHBhc3NpbmdMaW5rcy5zZXQodm5vZGUsIGxpbmtzLmNvcHkoKSk7XG4gICAgICAgIHBhcmVudE5vZGVzLnNldCh2bm9kZSwgcGFyZW50Tm9kZSk7XG4gICAgICAgIGh1YnMuc2V0KHBhcmVudE5vZGUsIHtcbiAgICAgICAgICAgIG5vZGU6IHBhcmVudE5vZGUsXG4gICAgICAgICAgICBsaW5rcyxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIGZ1bmN0aW9uIGNyZWF0ZVZOb2RlTGlua3Modm5vZGUpIHtcbiAgICAgICAgY29uc3QgcGFyZW50ID0gdm5vZGUucGFyZW50KCk7XG4gICAgICAgIGNvbnN0IGlzQnJhbmNoID0gbGlua2VkUGFyZW50cy5oYXMocGFyZW50KTtcbiAgICAgICAgY29uc3QgcGFyZW50Tm9kZSA9IGlzRE9NVk5vZGUocGFyZW50KVxuICAgICAgICAgICAgPyBwYXJlbnQubm9kZVxuICAgICAgICAgICAgOiBwYXJlbnROb2Rlcy5nZXQocGFyZW50KTtcbiAgICAgICAgcGFyZW50Tm9kZXMuc2V0KHZub2RlLCBwYXJlbnROb2RlKTtcbiAgICAgICAgY29uc3Qgdm5vZGVMaW5rcyA9IG5ldyBMaW5rZWRMaXN0KCk7XG4gICAgICAgIHBhc3NpbmdMaW5rcy5zZXQodm5vZGUsIHZub2RlTGlua3MpO1xuICAgICAgICBpZiAoaXNCcmFuY2gpIHtcbiAgICAgICAgICAgIGNvbnN0IG5ld0xpbmsgPSB7XG4gICAgICAgICAgICAgICAgcGFyZW50Tm9kZSxcbiAgICAgICAgICAgICAgICBub2RlOiBudWxsLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGxldCBjdXJyZW50ID0gdm5vZGU7XG4gICAgICAgICAgICBkbyB7XG4gICAgICAgICAgICAgICAgcGFzc2luZ0xpbmtzLmdldChjdXJyZW50KS5wdXNoKG5ld0xpbmspO1xuICAgICAgICAgICAgICAgIGN1cnJlbnQgPSBjdXJyZW50LnBhcmVudCgpO1xuICAgICAgICAgICAgfSB3aGlsZSAoY3VycmVudCAmJiAhaXNET01WTm9kZShjdXJyZW50KSk7XG4gICAgICAgICAgICBodWJzLmdldChwYXJlbnROb2RlKS5saW5rcy5wdXNoKG5ld0xpbmspO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgbGlua2VkUGFyZW50cy5hZGQocGFyZW50KTtcbiAgICAgICAgICAgIGNvbnN0IGxpbmtzID0gaXNET01WTm9kZShwYXJlbnQpXG4gICAgICAgICAgICAgICAgPyBodWJzLmdldChwYXJlbnROb2RlKS5saW5rc1xuICAgICAgICAgICAgICAgIDogcGFzc2luZ0xpbmtzLmdldChwYXJlbnQpO1xuICAgICAgICAgICAgbGlua3MuZm9yRWFjaCgobGluaykgPT4gdm5vZGVMaW5rcy5wdXNoKGxpbmspKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBmdW5jdGlvbiBjb25uZWN0RE9NVk5vZGUodm5vZGUpIHtcbiAgICAgICAgaWYgKGlzRE9NVk5vZGUodm5vZGUpKSB7XG4gICAgICAgICAgICBjb25zdCB7IG5vZGUgfSA9IHZub2RlO1xuICAgICAgICAgICAgaHVicy5zZXQobm9kZSwge1xuICAgICAgICAgICAgICAgIG5vZGUsXG4gICAgICAgICAgICAgICAgbGlua3M6IG5ldyBMaW5rZWRMaXN0KHtcbiAgICAgICAgICAgICAgICAgICAgcGFyZW50Tm9kZTogbm9kZSxcbiAgICAgICAgICAgICAgICAgICAgbm9kZTogbnVsbCxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcGFzc2luZ0xpbmtzLmdldCh2bm9kZSkuZm9yRWFjaCgobGluaykgPT4gKGxpbmsubm9kZSA9IG5vZGUpKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBmdW5jdGlvbiBhZGRWTm9kZSh2bm9kZSkge1xuICAgICAgICBjb25zdCBwYXJlbnQgPSB2bm9kZS5wYXJlbnQoKTtcbiAgICAgICAgaWYgKHBhcmVudCA9PSBudWxsKSB7XG4gICAgICAgICAgICBjcmVhdGVSb290Vk5vZGVMaW5rcyh2bm9kZSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBjcmVhdGVWTm9kZUxpbmtzKHZub2RlKTtcbiAgICAgICAgfVxuICAgICAgICBjb25uZWN0RE9NVk5vZGUodm5vZGUpO1xuICAgICAgICBjcmVhdFZOb2RlQ29udGV4dCh2bm9kZSk7XG4gICAgfVxuICAgIGZ1bmN0aW9uIGdldFZOb2RlQ29udGV4dCh2bm9kZSkge1xuICAgICAgICByZXR1cm4gY29udGV4dHMuZ2V0KHZub2RlKTtcbiAgICB9XG4gICAgZnVuY3Rpb24gZ2V0QW5jZXN0b3JzTGlua3Modm5vZGUpIHtcbiAgICAgICAgY29uc3QgcGFyZW50Tm9kZSA9IHBhcmVudE5vZGVzLmdldCh2bm9kZSk7XG4gICAgICAgIGNvbnN0IGh1YiA9IGh1YnMuZ2V0KHBhcmVudE5vZGUpO1xuICAgICAgICBjb25zdCBhbGxMaW5rcyA9IFtdO1xuICAgICAgICBsZXQgY3VycmVudCA9IHZub2RlO1xuICAgICAgICB3aGlsZSAoKGN1cnJlbnQgPSBjdXJyZW50LnBhcmVudCgpKSAmJiAhaXNET01WTm9kZShjdXJyZW50KSkge1xuICAgICAgICAgICAgYWxsTGlua3MucHVzaChwYXNzaW5nTGlua3MuZ2V0KGN1cnJlbnQpKTtcbiAgICAgICAgfVxuICAgICAgICBhbGxMaW5rcy5wdXNoKGh1Yi5saW5rcyk7XG4gICAgICAgIHJldHVybiBhbGxMaW5rcztcbiAgICB9XG4gICAgZnVuY3Rpb24gcmVwbGFjZVZOb2RlKG9sZCwgdm5vZGUpIHtcbiAgICAgICAgaWYgKHZub2RlLnBhcmVudCgpID09IG51bGwpIHtcbiAgICAgICAgICAgIGFkZFZOb2RlKHZub2RlKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBvbGRDb250ZXh0ID0gY29udGV4dHMuZ2V0KG9sZCk7XG4gICAgICAgIGNvbnN0IHsgcGFyZW50OiBwYXJlbnROb2RlIH0gPSBvbGRDb250ZXh0O1xuICAgICAgICBwYXJlbnROb2Rlcy5zZXQodm5vZGUsIHBhcmVudE5vZGUpO1xuICAgICAgICBjb25zdCBvbGRMaW5rcyA9IHBhc3NpbmdMaW5rcy5nZXQob2xkKTtcbiAgICAgICAgY29uc3QgbmV3TGluayA9IHtcbiAgICAgICAgICAgIHBhcmVudE5vZGUsXG4gICAgICAgICAgICBub2RlOiBudWxsLFxuICAgICAgICB9O1xuICAgICAgICBnZXRBbmNlc3RvcnNMaW5rcyh2bm9kZSkuZm9yRWFjaCgobGlua3MpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IG5leHRMaW5rID0gbGlua3MuYWZ0ZXIob2xkTGlua3MubGFzdCk7XG4gICAgICAgICAgICBvbGRMaW5rcy5mb3JFYWNoKChsaW5rKSA9PiBsaW5rcy5kZWxldGUobGluaykpO1xuICAgICAgICAgICAgaWYgKG5leHRMaW5rKSB7XG4gICAgICAgICAgICAgICAgbGlua3MuaW5zZXJ0QmVmb3JlKG5ld0xpbmssIG5leHRMaW5rKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGxpbmtzLnB1c2gobmV3TGluayk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBjb25zdCB2bm9kZUxpbmtzID0gbmV3IExpbmtlZExpc3QobmV3TGluayk7XG4gICAgICAgIHBhc3NpbmdMaW5rcy5zZXQodm5vZGUsIHZub2RlTGlua3MpO1xuICAgICAgICBjcmVhdFZOb2RlQ29udGV4dCh2bm9kZSk7XG4gICAgfVxuICAgIGZ1bmN0aW9uIGFkb3B0Vk5vZGUodm5vZGUsIHBhcmVudCkge1xuICAgICAgICBjb25zdCB2bm9kZUxpbmtzID0gcGFzc2luZ0xpbmtzLmdldCh2bm9kZSk7XG4gICAgICAgIGNvbnN0IHBhcmVudExpbmtzID0gcGFzc2luZ0xpbmtzLmdldChwYXJlbnQpLmNvcHkoKTtcbiAgICAgICAgdm5vZGUucGFyZW50KHBhcmVudCk7XG4gICAgICAgIGdldEFuY2VzdG9yc0xpbmtzKHZub2RlKS5mb3JFYWNoKChsaW5rcykgPT4ge1xuICAgICAgICAgICAgdm5vZGVMaW5rcy5mb3JFYWNoKChsaW5rKSA9PiBsaW5rcy5pbnNlcnRCZWZvcmUobGluaywgcGFyZW50TGlua3MuZmlyc3QpKTtcbiAgICAgICAgICAgIHBhcmVudExpbmtzLmZvckVhY2goKGxpbmspID0+IGxpbmtzLmRlbGV0ZShsaW5rKSk7XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBmdW5jdGlvbiBpc0RPTU5vZGVDYXB0dXJlZChub2RlKSB7XG4gICAgICAgIHJldHVybiBodWJzLmhhcyhub2RlKSAmJiBub2RlICE9PSByb290Tm9kZS5wYXJlbnRFbGVtZW50O1xuICAgIH1cbiAgICBjb25zdCB2ZG9tID0ge1xuICAgICAgICBleGVjdXRlOiBleGVjdXRlJDEsXG4gICAgICAgIGFkZFZOb2RlLFxuICAgICAgICBnZXRWTm9kZUNvbnRleHQsXG4gICAgICAgIHJlcGxhY2VWTm9kZSxcbiAgICAgICAgYWRvcHRWTm9kZSxcbiAgICAgICAgaXNET01Ob2RlQ2FwdHVyZWQsXG4gICAgICAgIExFQVZFLFxuICAgIH07XG4gICAgcmV0dXJuIHZkb207XG59XG5cbmNvbnN0IHJvb3RzID0gbmV3IFdlYWtNYXAoKTtcbmNvbnN0IHZkb21zID0gbmV3IFdlYWtNYXAoKTtcbmZ1bmN0aW9uIHJlYWxpemUobm9kZSwgdm5vZGUpIHtcbiAgICBjb25zdCBvbGQgPSByb290cy5nZXQobm9kZSkgfHwgbnVsbDtcbiAgICByb290cy5zZXQobm9kZSwgdm5vZGUpO1xuICAgIGxldCB2ZG9tO1xuICAgIGlmICh2ZG9tcy5oYXMobm9kZSkpIHtcbiAgICAgICAgdmRvbSA9IHZkb21zLmdldChub2RlKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHZkb20gPSBjcmVhdGVWRE9NKG5vZGUpO1xuICAgICAgICB2ZG9tcy5zZXQobm9kZSwgdmRvbSk7XG4gICAgfVxuICAgIHZkb20uZXhlY3V0ZSh2bm9kZSwgb2xkKTtcbiAgICByZXR1cm4gdmRvbS5nZXRWTm9kZUNvbnRleHQodm5vZGUpO1xufVxuZnVuY3Rpb24gcmVuZGVyKGVsZW1lbnQsIHNwZWMpIHtcbiAgICBjb25zdCB2bm9kZSA9IGNyZWF0ZURPTVZOb2RlKGVsZW1lbnQsIEFycmF5LmlzQXJyYXkoc3BlYykgPyBzcGVjIDogW3NwZWNdLCBudWxsLCBmYWxzZSk7XG4gICAgcmVhbGl6ZShlbGVtZW50LCB2bm9kZSk7XG4gICAgcmV0dXJuIGVsZW1lbnQ7XG59XG5mdW5jdGlvbiBzeW5jKG5vZGUsIHNwZWMpIHtcbiAgICBjb25zdCB2bm9kZSA9IGNyZWF0ZVZOb2RlKHNwZWMsIG51bGwpO1xuICAgIGNvbnN0IGNvbnRleHQgPSByZWFsaXplKG5vZGUsIHZub2RlKTtcbiAgICBjb25zdCB7IG5vZGVzIH0gPSBjb250ZXh0O1xuICAgIGlmIChub2Rlcy5sZW5ndGggIT09IDEgfHwgbm9kZXNbMF0gIT09IG5vZGUpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdTcGVjIGRvZXMgbm90IG1hdGNoIHRoZSBub2RlJyk7XG4gICAgfVxuICAgIHJldHVybiBub2Rlc1swXTtcbn1cbmZ1bmN0aW9uIHRlYXJkb3duKG5vZGUpIHtcbiAgICByb290cy5kZWxldGUobm9kZSk7XG4gICAgdmRvbXMuZGVsZXRlKG5vZGUpO1xufVxuXG5jb25zdCBwbHVnaW5zID0ge1xuICAgIGNyZWF0ZUVsZW1lbnQ6IGNyZWF0ZVBsdWdpbnNBUEkoUExVR0lOU19DUkVBVEVfRUxFTUVOVCksXG4gICAgc2V0QXR0cmlidXRlOiBjcmVhdGVQbHVnaW5zQVBJKFBMVUdJTlNfU0VUX0FUVFJJQlVURSksXG59O1xuXG5leHBvcnQgeyBnZXRDb21wb25lbnRDb250ZXh0IGFzIGdldENvbnRleHQsIHBsdWdpbnMsIHJlbmRlciwgc3luYywgdGVhcmRvd24gfTtcbiIsImltcG9ydCB7RXh0ZW5zaW9uRGF0YSwgRXh0ZW5zaW9uQWN0aW9ucywgRmlsdGVyQ29uZmlnLCBUYWJJbmZvLCBNZXNzYWdlLCBVc2VyU2V0dGluZ3N9IGZyb20gJy4uLy4uL2RlZmluaXRpb25zJztcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgQ29ubmVjdG9yIGltcGxlbWVudHMgRXh0ZW5zaW9uQWN0aW9ucyB7XG4gICAgcHJpdmF0ZSBwb3J0OiBjaHJvbWUucnVudGltZS5Qb3J0O1xuICAgIHByaXZhdGUgY291bnRlcjogbnVtYmVyO1xuXG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIHRoaXMuY291bnRlciA9IDA7XG4gICAgICAgIHRoaXMucG9ydCA9IGNocm9tZS5ydW50aW1lLmNvbm5lY3Qoe25hbWU6ICd1aSd9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGdldFJlcXVlc3RJZCgpIHtcbiAgICAgICAgcmV0dXJuICsrdGhpcy5jb3VudGVyO1xuICAgIH1cblxuICAgIHByaXZhdGUgc2VuZFJlcXVlc3Q8VD4ocmVxdWVzdDogTWVzc2FnZSwgZXhlY3V0b3I6IChyZXNwb25zZTogTWVzc2FnZSwgcmVzb2x2ZTogKGRhdGE/OiBUKSA9PiB2b2lkLCByZWplY3Q6IChlcnJvcjogRXJyb3IpID0+IHZvaWQpID0+IHZvaWQpIHtcbiAgICAgICAgY29uc3QgaWQgPSB0aGlzLmdldFJlcXVlc3RJZCgpO1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2U8VD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgbGlzdGVuZXIgPSAoe2lkOiByZXNwb25zZUlkLCAuLi5yZXNwb25zZX06IE1lc3NhZ2UpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAocmVzcG9uc2VJZCA9PT0gaWQpIHtcbiAgICAgICAgICAgICAgICAgICAgZXhlY3V0b3IocmVzcG9uc2UsIHJlc29sdmUsIHJlamVjdCk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMucG9ydC5vbk1lc3NhZ2UucmVtb3ZlTGlzdGVuZXIobGlzdGVuZXIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICB0aGlzLnBvcnQub25NZXNzYWdlLmFkZExpc3RlbmVyKGxpc3RlbmVyKTtcbiAgICAgICAgICAgIHRoaXMucG9ydC5wb3N0TWVzc2FnZSh7Li4ucmVxdWVzdCwgaWR9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgZ2V0RGF0YSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2VuZFJlcXVlc3Q8RXh0ZW5zaW9uRGF0YT4oe3R5cGU6ICdnZXQtZGF0YSd9LCAoe2RhdGF9LCByZXNvbHZlKSA9PiByZXNvbHZlKGRhdGEpKTtcbiAgICB9XG5cbiAgICBnZXRBY3RpdmVUYWJJbmZvKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5zZW5kUmVxdWVzdDxUYWJJbmZvPih7dHlwZTogJ2dldC1hY3RpdmUtdGFiLWluZm8nfSwgKHtkYXRhfSwgcmVzb2x2ZSkgPT4gcmVzb2x2ZShkYXRhKSk7XG4gICAgfVxuXG4gICAgc3Vic2NyaWJlVG9DaGFuZ2VzKGNhbGxiYWNrOiAoZGF0YTogRXh0ZW5zaW9uRGF0YSkgPT4gdm9pZCkge1xuICAgICAgICBjb25zdCBpZCA9IHRoaXMuZ2V0UmVxdWVzdElkKCk7XG4gICAgICAgIHRoaXMucG9ydC5vbk1lc3NhZ2UuYWRkTGlzdGVuZXIoKHtpZDogcmVzcG9uc2VJZCwgZGF0YX06IE1lc3NhZ2UpID0+IHtcbiAgICAgICAgICAgIGlmIChyZXNwb25zZUlkID09PSBpZCkge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKGRhdGEpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5wb3J0LnBvc3RNZXNzYWdlKHt0eXBlOiAnc3Vic2NyaWJlLXRvLWNoYW5nZXMnLCBpZH0pO1xuICAgIH1cblxuICAgIGVuYWJsZSgpIHtcbiAgICAgICAgdGhpcy5wb3J0LnBvc3RNZXNzYWdlKHt0eXBlOiAnZW5hYmxlJ30pO1xuICAgIH1cblxuICAgIGRpc2FibGUoKSB7XG4gICAgICAgIHRoaXMucG9ydC5wb3N0TWVzc2FnZSh7dHlwZTogJ2Rpc2FibGUnfSk7XG4gICAgfVxuXG4gICAgc2V0U2hvcnRjdXQoY29tbWFuZDogc3RyaW5nLCBzaG9ydGN1dDogc3RyaW5nKSB7XG4gICAgICAgIHRoaXMucG9ydC5wb3N0TWVzc2FnZSh7dHlwZTogJ3NldC1zaG9ydGN1dCcsIGRhdGE6IHtjb21tYW5kLCBzaG9ydGN1dH19KTtcbiAgICB9XG5cbiAgICBjaGFuZ2VTZXR0aW5ncyhzZXR0aW5nczogUGFydGlhbDxVc2VyU2V0dGluZ3M+KSB7XG4gICAgICAgIHRoaXMucG9ydC5wb3N0TWVzc2FnZSh7dHlwZTogJ2NoYW5nZS1zZXR0aW5ncycsIGRhdGE6IHNldHRpbmdzfSk7XG4gICAgfVxuXG4gICAgc2V0VGhlbWUodGhlbWU6IFBhcnRpYWw8RmlsdGVyQ29uZmlnPikge1xuICAgICAgICB0aGlzLnBvcnQucG9zdE1lc3NhZ2Uoe3R5cGU6ICdzZXQtdGhlbWUnLCBkYXRhOiB0aGVtZX0pO1xuICAgIH1cblxuICAgIHRvZ2dsZVVSTCh1cmw6IHN0cmluZykge1xuICAgICAgICB0aGlzLnBvcnQucG9zdE1lc3NhZ2Uoe3R5cGU6ICd0b2dnbGUtdXJsJywgZGF0YTogdXJsfSk7XG4gICAgfVxuXG4gICAgbWFya05ld3NBc1JlYWQoaWRzOiBzdHJpbmdbXSkge1xuICAgICAgICB0aGlzLnBvcnQucG9zdE1lc3NhZ2Uoe3R5cGU6ICdtYXJrLW5ld3MtYXMtcmVhZCcsIGRhdGE6IGlkc30pO1xuICAgIH1cblxuICAgIGxvYWRDb25maWcob3B0aW9uczoge2xvY2FsOiBib29sZWFufSkge1xuICAgICAgICB0aGlzLnBvcnQucG9zdE1lc3NhZ2Uoe3R5cGU6ICdsb2FkLWNvbmZpZycsIGRhdGE6IG9wdGlvbnN9KTtcbiAgICB9XG5cbiAgICBhcHBseURldkR5bmFtaWNUaGVtZUZpeGVzKHRleHQ6IHN0cmluZykge1xuICAgICAgICByZXR1cm4gdGhpcy5zZW5kUmVxdWVzdDx2b2lkPih7dHlwZTogJ2FwcGx5LWRldi1keW5hbWljLXRoZW1lLWZpeGVzJywgZGF0YTogdGV4dH0sICh7ZXJyb3J9LCByZXNvbHZlLCByZWplY3QpID0+IGVycm9yID8gcmVqZWN0KGVycm9yKSA6IHJlc29sdmUoKSk7XG4gICAgfVxuXG4gICAgcmVzZXREZXZEeW5hbWljVGhlbWVGaXhlcygpIHtcbiAgICAgICAgdGhpcy5wb3J0LnBvc3RNZXNzYWdlKHt0eXBlOiAncmVzZXQtZGV2LWR5bmFtaWMtdGhlbWUtZml4ZXMnfSk7XG4gICAgfVxuXG4gICAgYXBwbHlEZXZJbnZlcnNpb25GaXhlcyh0ZXh0OiBzdHJpbmcpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2VuZFJlcXVlc3Q8dm9pZD4oe3R5cGU6ICdhcHBseS1kZXYtaW52ZXJzaW9uLWZpeGVzJywgZGF0YTogdGV4dH0sICh7ZXJyb3J9LCByZXNvbHZlLCByZWplY3QpID0+IGVycm9yID8gcmVqZWN0KGVycm9yKSA6IHJlc29sdmUoKSk7XG4gICAgfVxuXG4gICAgcmVzZXREZXZJbnZlcnNpb25GaXhlcygpIHtcbiAgICAgICAgdGhpcy5wb3J0LnBvc3RNZXNzYWdlKHt0eXBlOiAncmVzZXQtZGV2LWludmVyc2lvbi1maXhlcyd9KTtcbiAgICB9XG5cbiAgICBhcHBseURldlN0YXRpY1RoZW1lcyh0ZXh0OiBzdHJpbmcpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2VuZFJlcXVlc3Q8dm9pZD4oe3R5cGU6ICdhcHBseS1kZXYtc3RhdGljLXRoZW1lcycsIGRhdGE6IHRleHR9LCAoe2Vycm9yfSwgcmVzb2x2ZSwgcmVqZWN0KSA9PiBlcnJvciA/IHJlamVjdChlcnJvcikgOiByZXNvbHZlKCkpO1xuICAgIH1cblxuICAgIHJlc2V0RGV2U3RhdGljVGhlbWVzKCkge1xuICAgICAgICB0aGlzLnBvcnQucG9zdE1lc3NhZ2Uoe3R5cGU6ICdyZXNldC1kZXYtc3RhdGljLXRoZW1lcyd9KTtcbiAgICB9XG5cbiAgICBkaXNjb25uZWN0KCkge1xuICAgICAgICB0aGlzLnBvcnQuZGlzY29ubmVjdCgpO1xuICAgIH1cbn1cbiIsImV4cG9ydCBmdW5jdGlvbiBpc0lQVjYodXJsOiBzdHJpbmcpIHtcbiAgICBjb25zdCBvcGVuaW5nQnJhY2tldEluZGV4ID0gdXJsLmluZGV4T2YoJ1snKTtcbiAgICBpZiAob3BlbmluZ0JyYWNrZXRJbmRleCA8IDApIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBjb25zdCBxdWVyeUluZGV4ID0gdXJsLmluZGV4T2YoJz8nKTtcbiAgICBpZiAocXVlcnlJbmRleCA+PSAwICYmIG9wZW5pbmdCcmFja2V0SW5kZXggPiBxdWVyeUluZGV4KSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG59XG5cbmNvbnN0IGlwVjZIb3N0UmVnZXggPSAvXFxbLio/XFxdKFxcOlxcZCspPy87XG5cbmV4cG9ydCBmdW5jdGlvbiBjb21wYXJlSVBWNihmaXJzdFVSTDogc3RyaW5nLCBzZWNvbmRVUkw6IHN0cmluZykge1xuICAgIGNvbnN0IGZpcnN0SG9zdCA9IGZpcnN0VVJMLm1hdGNoKGlwVjZIb3N0UmVnZXgpWzBdO1xuICAgIGNvbnN0IHNlY29uZEhvc3QgPSBzZWNvbmRVUkwubWF0Y2goaXBWNkhvc3RSZWdleClbMF07XG4gICAgcmV0dXJuIGZpcnN0SG9zdCA9PT0gc2Vjb25kSG9zdDtcbn1cbiIsImltcG9ydCB7VXNlclNldHRpbmdzfSBmcm9tICcuLi9kZWZpbml0aW9ucyc7XG5pbXBvcnQge2lzSVBWNiwgY29tcGFyZUlQVjZ9IGZyb20gJy4vaXB2Nic7XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRVUkxIb3N0T3JQcm90b2NvbCgkdXJsOiBzdHJpbmcpIHtcbiAgICBjb25zdCB1cmwgPSBuZXcgVVJMKCR1cmwpO1xuICAgIGlmICh1cmwuaG9zdCkge1xuICAgICAgICByZXR1cm4gdXJsLmhvc3Q7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHVybC5wcm90b2NvbDtcbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjb21wYXJlVVJMUGF0dGVybnMoYTogc3RyaW5nLCBiOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gYS5sb2NhbGVDb21wYXJlKGIpO1xufVxuXG4vKipcbiAqIERldGVybWluZXMgd2hldGhlciBVUkwgaGFzIGEgbWF0Y2ggaW4gVVJMIHRlbXBsYXRlIGxpc3QuXG4gKiBAcGFyYW0gdXJsIFNpdGUgVVJMLlxuICogQHBhcmFtbGlzdCBMaXN0IHRvIHNlYXJjaCBpbnRvLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaXNVUkxJbkxpc3QodXJsOiBzdHJpbmcsIGxpc3Q6IHN0cmluZ1tdKSB7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBsaXN0Lmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmIChpc1VSTE1hdGNoZWQodXJsLCBsaXN0W2ldKSkge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xufVxuXG4vKipcbiAqIERldGVybWluZXMgd2hldGhlciBVUkwgbWF0Y2hlcyB0aGUgdGVtcGxhdGUuXG4gKiBAcGFyYW0gdXJsIFVSTC5cbiAqIEBwYXJhbSB1cmxUZW1wbGF0ZSBVUkwgdGVtcGxhdGUgKFwiZ29vZ2xlLipcIiwgXCJ5b3V0dWJlLmNvbVwiIGV0YykuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc1VSTE1hdGNoZWQodXJsOiBzdHJpbmcsIHVybFRlbXBsYXRlOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICBjb25zdCBpc0ZpcnN0SVBWNiA9IGlzSVBWNih1cmwpO1xuICAgIGNvbnN0IGlzU2Vjb25kSVBWNiA9IGlzSVBWNih1cmxUZW1wbGF0ZSk7XG4gICAgaWYgKGlzRmlyc3RJUFY2ICYmIGlzU2Vjb25kSVBWNikge1xuICAgICAgICByZXR1cm4gY29tcGFyZUlQVjYodXJsLCB1cmxUZW1wbGF0ZSk7XG4gICAgfSBlbHNlIGlmICghaXNTZWNvbmRJUFY2ICYmICFpc1NlY29uZElQVjYpIHtcbiAgICAgICAgY29uc3QgcmVnZXggPSBjcmVhdGVVcmxSZWdleCh1cmxUZW1wbGF0ZSk7XG4gICAgICAgIHJldHVybiBCb29sZWFuKHVybC5tYXRjaChyZWdleCkpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVVybFJlZ2V4KHVybFRlbXBsYXRlOiBzdHJpbmcpOiBSZWdFeHAge1xuICAgIHVybFRlbXBsYXRlID0gdXJsVGVtcGxhdGUudHJpbSgpO1xuICAgIGNvbnN0IGV4YWN0QmVnaW5uaW5nID0gKHVybFRlbXBsYXRlWzBdID09PSAnXicpO1xuICAgIGNvbnN0IGV4YWN0RW5kaW5nID0gKHVybFRlbXBsYXRlW3VybFRlbXBsYXRlLmxlbmd0aCAtIDFdID09PSAnJCcpO1xuXG4gICAgdXJsVGVtcGxhdGUgPSAodXJsVGVtcGxhdGVcbiAgICAgICAgLnJlcGxhY2UoL15cXF4vLCAnJykgLy8gUmVtb3ZlIF4gYXQgc3RhcnRcbiAgICAgICAgLnJlcGxhY2UoL1xcJCQvLCAnJykgLy8gUmVtb3ZlICQgYXQgZW5kXG4gICAgICAgIC5yZXBsYWNlKC9eLio/XFwvezIsM30vLCAnJykgLy8gUmVtb3ZlIHNjaGVtZVxuICAgICAgICAucmVwbGFjZSgvXFw/LiokLywgJycpIC8vIFJlbW92ZSBxdWVyeVxuICAgICAgICAucmVwbGFjZSgvXFwvJC8sICcnKSAvLyBSZW1vdmUgbGFzdCBzbGFzaFxuICAgICk7XG5cbiAgICBsZXQgc2xhc2hJbmRleDogbnVtYmVyO1xuICAgIGxldCBiZWZvcmVTbGFzaDogc3RyaW5nO1xuICAgIGxldCBhZnRlclNsYXNoOiBzdHJpbmc7XG4gICAgaWYgKChzbGFzaEluZGV4ID0gdXJsVGVtcGxhdGUuaW5kZXhPZignLycpKSA+PSAwKSB7XG4gICAgICAgIGJlZm9yZVNsYXNoID0gdXJsVGVtcGxhdGUuc3Vic3RyaW5nKDAsIHNsYXNoSW5kZXgpOyAvLyBnb29nbGUuKlxuICAgICAgICBhZnRlclNsYXNoID0gdXJsVGVtcGxhdGUucmVwbGFjZSgnJCcsICcnKS5zdWJzdHJpbmcoc2xhc2hJbmRleCk7IC8vIC9sb2dpbi9hYmNcbiAgICB9IGVsc2Uge1xuICAgICAgICBiZWZvcmVTbGFzaCA9IHVybFRlbXBsYXRlLnJlcGxhY2UoJyQnLCAnJyk7XG4gICAgfVxuXG4gICAgLy9cbiAgICAvLyBTQ0hFTUUgYW5kIFNVQkRPTUFJTlNcblxuICAgIGxldCByZXN1bHQgPSAoZXhhY3RCZWdpbm5pbmcgP1xuICAgICAgICAnXiguKj9cXFxcOlxcXFwvezIsM30pPycgLy8gU2NoZW1lXG4gICAgICAgIDogJ14oLio/XFxcXDpcXFxcL3syLDN9KT8oW15cXC9dKj9cXFxcLik/JyAvLyBTY2hlbWUgYW5kIHN1YmRvbWFpbnNcbiAgICApO1xuXG4gICAgLy9cbiAgICAvLyBIT1NUIGFuZCBQT1JUXG5cbiAgICBjb25zdCBob3N0UGFydHMgPSBiZWZvcmVTbGFzaC5zcGxpdCgnLicpO1xuICAgIHJlc3VsdCArPSAnKCc7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBob3N0UGFydHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKGhvc3RQYXJ0c1tpXSA9PT0gJyonKSB7XG4gICAgICAgICAgICBob3N0UGFydHNbaV0gPSAnW15cXFxcLlxcXFwvXSs/JztcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXN1bHQgKz0gaG9zdFBhcnRzLmpvaW4oJ1xcXFwuJyk7XG4gICAgcmVzdWx0ICs9ICcpJztcblxuICAgIC8vXG4gICAgLy8gUEFUSCBhbmQgUVVFUllcblxuICAgIGlmIChhZnRlclNsYXNoKSB7XG4gICAgICAgIHJlc3VsdCArPSAnKCc7XG4gICAgICAgIHJlc3VsdCArPSBhZnRlclNsYXNoLnJlcGxhY2UoJy8nLCAnXFxcXC8nKTtcbiAgICAgICAgcmVzdWx0ICs9ICcpJztcbiAgICB9XG5cbiAgICByZXN1bHQgKz0gKGV4YWN0RW5kaW5nID9cbiAgICAgICAgJyhcXFxcLz8oXFxcXD9bXlxcL10qPyk/KSQnIC8vIEFsbCBmb2xsb3dpbmcgcXVlcmllc1xuICAgICAgICA6ICcoXFxcXC8/Lio/KSQnIC8vIEFsbCBmb2xsb3dpbmcgcGF0aHMgYW5kIHF1ZXJpZXNcbiAgICApO1xuXG4gICAgLy9cbiAgICAvLyBSZXN1bHRcblxuICAgIHJldHVybiBuZXcgUmVnRXhwKHJlc3VsdCwgJ2knKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzUERGKHVybDogc3RyaW5nKSB7XG4gICAgaWYgKHVybC5pbmNsdWRlcygnLnBkZicpKSB7XG4gICAgICAgIGlmICh1cmwuaW5jbHVkZXMoJz8nKSkge1xuICAgICAgICAgICAgdXJsID0gdXJsLnN1YnN0cmluZygwLCB1cmwubGFzdEluZGV4T2YoJz8nKSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHVybC5pbmNsdWRlcygnIycpKSB7XG4gICAgICAgICAgICB1cmwgPSB1cmwuc3Vic3RyaW5nKDAsIHVybC5sYXN0SW5kZXhPZignIycpKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodXJsLm1hdGNoKC8od2lraXBlZGlhfHdpa2ltZWRpYSkub3JnL2kpICYmIHVybC5tYXRjaCgvKHdpa2lwZWRpYXx3aWtpbWVkaWEpXFwub3JnXFwvLipcXC9bYS16XStcXDpbXlxcOlxcL10rXFwucGRmL2kpKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHVybC5lbmRzV2l0aCgnLnBkZicpKSB7XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gdXJsLmxlbmd0aDsgMCA8IGk7IGktLSkge1xuICAgICAgICAgICAgICAgIGlmICh1cmxbaV0gPT09ICc9Jykge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICh1cmxbaV0gPT09ICcvJykge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNVUkxFbmFibGVkKHVybDogc3RyaW5nLCB1c2VyU2V0dGluZ3M6IFVzZXJTZXR0aW5ncywge2lzUHJvdGVjdGVkLCBpc0luRGFya0xpc3R9KSB7XG4gICAgaWYgKGlzUHJvdGVjdGVkICYmICF1c2VyU2V0dGluZ3MuZW5hYmxlRm9yUHJvdGVjdGVkUGFnZXMpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBpZiAoaXNQREYodXJsKSkge1xuICAgICAgICByZXR1cm4gdXNlclNldHRpbmdzLmVuYWJsZUZvclBERjtcbiAgICB9XG4gICAgY29uc3QgaXNVUkxJblVzZXJMaXN0ID0gaXNVUkxJbkxpc3QodXJsLCB1c2VyU2V0dGluZ3Muc2l0ZUxpc3QpO1xuICAgIGlmICh1c2VyU2V0dGluZ3MuYXBwbHlUb0xpc3RlZE9ubHkpIHtcbiAgICAgICAgcmV0dXJuIGlzVVJMSW5Vc2VyTGlzdDtcbiAgICB9XG4gICAgLy8gVE9ETzogVXNlIGBzaXRlTGlzdEVuYWJsZWRgLCBgc2l0ZUxpc3REaXNhYmxlZGAsIGBlbmFibGVkQnlEZWZhdWx0YCBvcHRpb25zLlxuICAgIC8vIERlbGV0ZSBgc2l0ZUxpc3RgIGFuZCBgYXBwbHlUb0xpc3RlZE9ubHlgIG9wdGlvbnMsIHRyYW5zZmVyIHVzZXIncyB2YWx1ZXMuXG4gICAgY29uc3QgaXNVUkxJbkVuYWJsZWRMaXN0ID0gaXNVUkxJbkxpc3QodXJsLCB1c2VyU2V0dGluZ3Muc2l0ZUxpc3RFbmFibGVkKTtcbiAgICBpZiAoaXNVUkxJbkVuYWJsZWRMaXN0ICYmIGlzSW5EYXJrTGlzdCkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuICghaXNJbkRhcmtMaXN0ICYmICFpc1VSTEluVXNlckxpc3QpO1xufVxuIiwiaW1wb3J0IHtnZXRVUkxIb3N0T3JQcm90b2NvbH0gZnJvbSAnLi4vLi4vdXRpbHMvdXJsJztcbmltcG9ydCB7RXh0ZW5zaW9uRGF0YSwgVGFiSW5mbywgVGhlbWUsIFVzZXJTZXR0aW5nc30gZnJvbSAnLi4vLi4vZGVmaW5pdGlvbnMnO1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0TW9ja0RhdGEob3ZlcnJpZGUgPSB7fSBhcyBQYXJ0aWFsPEV4dGVuc2lvbkRhdGE+KTogRXh0ZW5zaW9uRGF0YSB7XG4gICAgcmV0dXJuIE9iamVjdC5hc3NpZ24oe1xuICAgICAgICBpc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgIGlzUmVhZHk6IHRydWUsXG4gICAgICAgIHNldHRpbmdzOiB7XG4gICAgICAgICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgICAgICAgcHJlc2V0czogW10sXG4gICAgICAgICAgICB0aGVtZToge1xuICAgICAgICAgICAgICAgIG1vZGU6IDEsXG4gICAgICAgICAgICAgICAgYnJpZ2h0bmVzczogMTEwLFxuICAgICAgICAgICAgICAgIGNvbnRyYXN0OiA5MCxcbiAgICAgICAgICAgICAgICBncmF5c2NhbGU6IDIwLFxuICAgICAgICAgICAgICAgIHNlcGlhOiAxMCxcbiAgICAgICAgICAgICAgICB1c2VGb250OiBmYWxzZSxcbiAgICAgICAgICAgICAgICBmb250RmFtaWx5OiAnU2Vnb2UgVUknLFxuICAgICAgICAgICAgICAgIHRleHRTdHJva2U6IDAsXG4gICAgICAgICAgICAgICAgZW5naW5lOiAnY3NzRmlsdGVyJyxcbiAgICAgICAgICAgICAgICBzdHlsZXNoZWV0OiAnJyxcbiAgICAgICAgICAgICAgICBzY3JvbGxiYXJDb2xvcjogJ2F1dG8nLFxuICAgICAgICAgICAgICAgIHN0eWxlU3lzdGVtQ29udHJvbHM6IHRydWUsXG4gICAgICAgICAgICB9IGFzIFRoZW1lLFxuICAgICAgICAgICAgY3VzdG9tVGhlbWVzOiBbXSxcbiAgICAgICAgICAgIHNpdGVMaXN0OiBbXSxcbiAgICAgICAgICAgIHNpdGVMaXN0RW5hYmxlZDogW10sXG4gICAgICAgICAgICBhcHBseVRvTGlzdGVkT25seTogZmFsc2UsXG4gICAgICAgICAgICBjaGFuZ2VCcm93c2VyVGhlbWU6IGZhbHNlLFxuICAgICAgICAgICAgZW5hYmxlRm9yUERGOiB0cnVlLFxuICAgICAgICAgICAgZW5hYmxlRm9yUHJvdGVjdGVkUGFnZXM6IGZhbHNlLFxuICAgICAgICAgICAgbm90aWZ5T2ZOZXdzOiBmYWxzZSxcbiAgICAgICAgICAgIHN5bmNTZXR0aW5nczogdHJ1ZSxcbiAgICAgICAgICAgIGF1dG9tYXRpb246ICcnLFxuICAgICAgICAgICAgdGltZToge1xuICAgICAgICAgICAgICAgIGFjdGl2YXRpb246ICcxODowMCcsXG4gICAgICAgICAgICAgICAgZGVhY3RpdmF0aW9uOiAnOTowMCcsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgbG9jYXRpb246IHtcbiAgICAgICAgICAgICAgICBsYXRpdHVkZTogNTIuNDIzNzE3OCxcbiAgICAgICAgICAgICAgICBsb25naXR1ZGU6IDMxLjAyMTc4NixcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH0gYXMgVXNlclNldHRpbmdzLFxuICAgICAgICBmb250czogW1xuICAgICAgICAgICAgJ3NlcmlmJyxcbiAgICAgICAgICAgICdzYW5zLXNlcmlmJyxcbiAgICAgICAgICAgICdtb25vc3BhY2UnLFxuICAgICAgICAgICAgJ2N1cnNpdmUnLFxuICAgICAgICAgICAgJ2ZhbnRhc3knLFxuICAgICAgICAgICAgJ3N5c3RlbS11aSdcbiAgICAgICAgXSxcbiAgICAgICAgbmV3czogW10sXG4gICAgICAgIHNob3J0Y3V0czoge1xuICAgICAgICAgICAgJ2FkZFNpdGUnOiAnQWx0K1NoaWZ0K0EnLFxuICAgICAgICAgICAgJ3RvZ2dsZSc6ICdBbHQrU2hpZnQrRCdcbiAgICAgICAgfSxcbiAgICAgICAgZGV2dG9vbHM6IHtcbiAgICAgICAgICAgIGR5bmFtaWNGaXhlc1RleHQ6ICcnLFxuICAgICAgICAgICAgZmlsdGVyRml4ZXNUZXh0OiAnJyxcbiAgICAgICAgICAgIHN0YXRpY1RoZW1lc1RleHQ6ICcnLFxuICAgICAgICAgICAgaGFzQ3VzdG9tRHluYW1pY0ZpeGVzOiBmYWxzZSxcbiAgICAgICAgICAgIGhhc0N1c3RvbUZpbHRlckZpeGVzOiBmYWxzZSxcbiAgICAgICAgICAgIGhhc0N1c3RvbVN0YXRpY0ZpeGVzOiBmYWxzZSxcbiAgICAgICAgfSxcbiAgICB9IGFzIEV4dGVuc2lvbkRhdGEsIG92ZXJyaWRlKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldE1vY2tBY3RpdmVUYWJJbmZvKCk6IFRhYkluZm8ge1xuICAgIHJldHVybiB7XG4gICAgICAgIHVybDogJ2h0dHBzOi8vZGFya3JlYWRlci5vcmcvJyxcbiAgICAgICAgaXNQcm90ZWN0ZWQ6IGZhbHNlLFxuICAgICAgICBpc0luRGFya0xpc3Q6IGZhbHNlLFxuICAgIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVDb25uZWN0b3JNb2NrKCkge1xuICAgIGxldCBsaXN0ZW5lcjogKGRhdGEpID0+IHZvaWQgPSBudWxsO1xuICAgIGNvbnN0IGRhdGEgPSBnZXRNb2NrRGF0YSgpO1xuICAgIGNvbnN0IHRhYiA9IGdldE1vY2tBY3RpdmVUYWJJbmZvKCk7XG4gICAgY29uc3QgY29ubmVjdG9yID0ge1xuICAgICAgICBnZXREYXRhKCkge1xuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShkYXRhKTtcbiAgICAgICAgfSxcbiAgICAgICAgZ2V0QWN0aXZlVGFiSW5mbygpIHtcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodGFiKTtcbiAgICAgICAgfSxcbiAgICAgICAgc3Vic2NyaWJlVG9DaGFuZ2VzKGNhbGxiYWNrKSB7XG4gICAgICAgICAgICBsaXN0ZW5lciA9IGNhbGxiYWNrO1xuICAgICAgICB9LFxuICAgICAgICBjaGFuZ2VTZXR0aW5ncyhzZXR0aW5ncykge1xuICAgICAgICAgICAgT2JqZWN0LmFzc2lnbihkYXRhLnNldHRpbmdzLCBzZXR0aW5ncyk7XG4gICAgICAgICAgICBsaXN0ZW5lcihkYXRhKTtcbiAgICAgICAgfSxcbiAgICAgICAgc2V0VGhlbWUodGhlbWUpIHtcbiAgICAgICAgICAgIE9iamVjdC5hc3NpZ24oZGF0YS5zZXR0aW5ncy50aGVtZSwgdGhlbWUpO1xuICAgICAgICAgICAgbGlzdGVuZXIoZGF0YSk7XG4gICAgICAgIH0sXG4gICAgICAgIHNldFNob3J0Y3V0KGNvbW1hbmQsIHNob3J0Y3V0KSB7XG4gICAgICAgICAgICBPYmplY3QuYXNzaWduKGRhdGEuc2hvcnRjdXRzLCB7W2NvbW1hbmRdOiBzaG9ydGN1dH0pO1xuICAgICAgICAgICAgbGlzdGVuZXIoZGF0YSk7XG4gICAgICAgIH0sXG4gICAgICAgIHRvZ2dsZVVSTCh1cmwpIHtcbiAgICAgICAgICAgIGNvbnN0IHBhdHRlcm4gPSBnZXRVUkxIb3N0T3JQcm90b2NvbCh1cmwpO1xuICAgICAgICAgICAgY29uc3QgaW5kZXggPSBkYXRhLnNldHRpbmdzLnNpdGVMaXN0LmluZGV4T2YocGF0dGVybik7XG4gICAgICAgICAgICBpZiAoaW5kZXggPj0gMCkge1xuICAgICAgICAgICAgICAgIGRhdGEuc2V0dGluZ3Muc2l0ZUxpc3Quc3BsaWNlKGluZGV4LCAxLCBwYXR0ZXJuKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZGF0YS5zZXR0aW5ncy5zaXRlTGlzdC5wdXNoKHBhdHRlcm4pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbGlzdGVuZXIoZGF0YSk7XG4gICAgICAgIH0sXG4gICAgICAgIG1hcmtOZXdzQXNSZWFkKGlkczogc3RyaW5nW10pIHtcbiAgICAgICAgICAgIGRhdGEubmV3c1xuICAgICAgICAgICAgICAgIC5maWx0ZXIoKHtpZH0pID0+IGlkcy5pbmNsdWRlcyhpZCkpXG4gICAgICAgICAgICAgICAgLmZvckVhY2goKG5ld3MpID0+IG5ld3MucmVhZCA9IHRydWUpO1xuICAgICAgICAgICAgbGlzdGVuZXIoZGF0YSk7XG4gICAgICAgIH0sXG4gICAgICAgIGRpc2Nvbm5lY3QoKSB7XG4gICAgICAgICAgICAvL1xuICAgICAgICB9LFxuICAgIH07XG4gICAgcmV0dXJuIGNvbm5lY3Rvcjtcbn1cbiIsImltcG9ydCBDb25uZWN0b3IgZnJvbSAnLi9jb25uZWN0b3InO1xuaW1wb3J0IHtjcmVhdGVDb25uZWN0b3JNb2NrfSBmcm9tICcuL21vY2snO1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBjb25uZWN0KCkge1xuICAgIGlmICh0eXBlb2YgY2hyb21lID09PSAndW5kZWZpbmVkJyB8fCAhY2hyb21lLmV4dGVuc2lvbikge1xuICAgICAgICByZXR1cm4gY3JlYXRlQ29ubmVjdG9yTW9jaygpIGFzIENvbm5lY3RvcjtcbiAgICB9XG4gICAgcmV0dXJuIG5ldyBDb25uZWN0b3IoKTtcbn1cbiIsIi8qIG1hbGV2aWNAMC4xOC42IC0gSnVsIDE1LCAyMDIwICovXG5pbXBvcnQgeyBwbHVnaW5zIH0gZnJvbSAnbWFsZXZpYy9kb20nO1xuXG5mdW5jdGlvbiB3aXRoRm9ybXModHlwZSkge1xuICAgIHBsdWdpbnMuc2V0QXR0cmlidXRlLmFkZCh0eXBlLCAoeyBlbGVtZW50LCBhdHRyLCB2YWx1ZSB9KSA9PiB7XG4gICAgICAgIGlmIChhdHRyID09PSAndmFsdWUnICYmIGVsZW1lbnQgaW5zdGFuY2VvZiBIVE1MSW5wdXRFbGVtZW50KSB7XG4gICAgICAgICAgICBjb25zdCB0ZXh0ID0gKGVsZW1lbnQudmFsdWUgPSB2YWx1ZSA9PSBudWxsID8gJycgOiB2YWx1ZSk7XG4gICAgICAgICAgICBlbGVtZW50LnZhbHVlID0gdGV4dDtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH0pO1xuICAgIHJldHVybiB0eXBlO1xufVxuXG5leHBvcnQgeyB3aXRoRm9ybXMgfTtcbiIsIi8qIG1hbGV2aWNAMC4xOC42IC0gSnVsIDE1LCAyMDIwICovXG5pbXBvcnQgeyBnZXRDb250ZXh0IH0gZnJvbSAnbWFsZXZpYy9kb20nO1xuXG5sZXQgY3VycmVudFVzZVN0YXRlRm4gPSBudWxsO1xuZnVuY3Rpb24gdXNlU3RhdGUoaW5pdGlhbFN0YXRlKSB7XG4gICAgaWYgKCFjdXJyZW50VXNlU3RhdGVGbikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ2B1c2VTdGF0ZSgpYCBzaG91bGQgYmUgY2FsbGVkIGluc2lkZSBhIGNvbXBvbmVudCcpO1xuICAgIH1cbiAgICByZXR1cm4gY3VycmVudFVzZVN0YXRlRm4oaW5pdGlhbFN0YXRlKTtcbn1cbmZ1bmN0aW9uIHdpdGhTdGF0ZSh0eXBlKSB7XG4gICAgY29uc3QgU3RhdGVmdWwgPSAocHJvcHMsIC4uLmNoaWxkcmVuKSA9PiB7XG4gICAgICAgIGNvbnN0IGNvbnRleHQgPSBnZXRDb250ZXh0KCk7XG4gICAgICAgIGNvbnN0IHVzZVN0YXRlID0gKGluaXRpYWwpID0+IHtcbiAgICAgICAgICAgIGlmICghY29udGV4dCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN0YXRlOiBpbml0aWFsLCBzZXRTdGF0ZTogbnVsbCB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgeyBzdG9yZSwgcmVmcmVzaCB9ID0gY29udGV4dDtcbiAgICAgICAgICAgIHN0b3JlLnN0YXRlID0gc3RvcmUuc3RhdGUgfHwgaW5pdGlhbDtcbiAgICAgICAgICAgIGNvbnN0IHNldFN0YXRlID0gKG5ld1N0YXRlKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGxvY2spIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdTZXR0aW5nIHN0YXRlIGR1cmluZyB1bmJveGluZyBjYXVzZXMgaW5maW5pdGUgbG9vcCcpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBzdG9yZS5zdGF0ZSA9IE9iamVjdC5hc3NpZ24oT2JqZWN0LmFzc2lnbih7fSwgc3RvcmUuc3RhdGUpLCBuZXdTdGF0ZSk7XG4gICAgICAgICAgICAgICAgcmVmcmVzaCgpO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3RhdGU6IHN0b3JlLnN0YXRlLFxuICAgICAgICAgICAgICAgIHNldFN0YXRlLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfTtcbiAgICAgICAgbGV0IGxvY2sgPSB0cnVlO1xuICAgICAgICBjb25zdCBwcmV2VXNlU3RhdGVGbiA9IGN1cnJlbnRVc2VTdGF0ZUZuO1xuICAgICAgICBjdXJyZW50VXNlU3RhdGVGbiA9IHVzZVN0YXRlO1xuICAgICAgICBsZXQgcmVzdWx0O1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgcmVzdWx0ID0gdHlwZShwcm9wcywgLi4uY2hpbGRyZW4pO1xuICAgICAgICB9XG4gICAgICAgIGZpbmFsbHkge1xuICAgICAgICAgICAgY3VycmVudFVzZVN0YXRlRm4gPSBwcmV2VXNlU3RhdGVGbjtcbiAgICAgICAgICAgIGxvY2sgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH07XG4gICAgcmV0dXJuIFN0YXRlZnVsO1xufVxuXG5leHBvcnQgeyB1c2VTdGF0ZSwgd2l0aFN0YXRlIH07XG4iLCJleHBvcnQgZnVuY3Rpb24gaXNDaHJvbWl1bUJhc2VkKCkge1xuICAgIHJldHVybiBuYXZpZ2F0b3IudXNlckFnZW50LnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ2Nocm9tZScpIHx8IG5hdmlnYXRvci51c2VyQWdlbnQudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnY2hyb21pdW0nKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzRmlyZWZveCgpIHtcbiAgICByZXR1cm4gbmF2aWdhdG9yLnVzZXJBZ2VudC5pbmNsdWRlcygnRmlyZWZveCcpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNWaXZhbGRpKCkge1xuICAgIHJldHVybiBuYXZpZ2F0b3IudXNlckFnZW50LnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ3ZpdmFsZGknKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzWWFCcm93c2VyKCkge1xuICAgIHJldHVybiBuYXZpZ2F0b3IudXNlckFnZW50LnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ3lhYnJvd3NlcicpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNPcGVyYSgpIHtcbiAgICBjb25zdCBhZ2VudCA9IG5hdmlnYXRvci51c2VyQWdlbnQudG9Mb3dlckNhc2UoKTtcbiAgICByZXR1cm4gYWdlbnQuaW5jbHVkZXMoJ29wcicpIHx8IGFnZW50LmluY2x1ZGVzKCdvcGVyYScpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNFZGdlKCkge1xuICAgIHJldHVybiBuYXZpZ2F0b3IudXNlckFnZW50LmluY2x1ZGVzKCdFZGcnKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzV2luZG93cygpIHtcbiAgICBpZiAodHlwZW9mIG5hdmlnYXRvciA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIHJldHVybiBuYXZpZ2F0b3IucGxhdGZvcm0udG9Mb3dlckNhc2UoKS5zdGFydHNXaXRoKCd3aW4nKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzTWFjT1MoKSB7XG4gICAgaWYgKHR5cGVvZiBuYXZpZ2F0b3IgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICByZXR1cm4gbmF2aWdhdG9yLnBsYXRmb3JtLnRvTG93ZXJDYXNlKCkuc3RhcnRzV2l0aCgnbWFjJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc01vYmlsZSgpIHtcbiAgICBpZiAodHlwZW9mIG5hdmlnYXRvciA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIHJldHVybiBuYXZpZ2F0b3IudXNlckFnZW50LnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ21vYmlsZScpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q2hyb21lVmVyc2lvbigpIHtcbiAgICBjb25zdCBhZ2VudCA9IG5hdmlnYXRvci51c2VyQWdlbnQudG9Mb3dlckNhc2UoKTtcbiAgICBjb25zdCBtID0gYWdlbnQubWF0Y2goL2Nocm9tW2V8aXVtXVxcLyhbXiBdKykvKTtcbiAgICBpZiAobSAmJiBtWzFdKSB7XG4gICAgICAgIHJldHVybiBtWzFdO1xuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNvbXBhcmVDaHJvbWVWZXJzaW9ucygkYTogc3RyaW5nLCAkYjogc3RyaW5nKSB7XG4gICAgY29uc3QgYSA9ICRhLnNwbGl0KCcuJykubWFwKCh4KSA9PiBwYXJzZUludCh4KSk7XG4gICAgY29uc3QgYiA9ICRiLnNwbGl0KCcuJykubWFwKCh4KSA9PiBwYXJzZUludCh4KSk7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmIChhW2ldICE9PSBiW2ldKSB7XG4gICAgICAgICAgICByZXR1cm4gYVtpXSA8IGJbaV0gPyAtMSA6IDE7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIDA7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0RlZmluZWRTZWxlY3RvclN1cHBvcnRlZCgpIHtcbiAgICB0cnkge1xuICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCc6ZGVmaW5lZCcpO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbn1cblxuZXhwb3J0IGNvbnN0IElTX1NIQURPV19ET01fU1VQUE9SVEVEID0gdHlwZW9mIFNoYWRvd1Jvb3QgPT09ICdmdW5jdGlvbic7XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0NTU1N0eWxlU2hlZXRDb25zdHJ1Y3RvclN1cHBvcnRlZCgpIHtcbiAgICB0cnkge1xuICAgICAgICBuZXcgQ1NTU3R5bGVTaGVldCgpO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbn1cbiIsImltcG9ydCB7aXNGaXJlZm94fSBmcm9tICcuLi91dGlscy9wbGF0Zm9ybSc7XG5cbmV4cG9ydCBmdW5jdGlvbiBjbGFzc2VzKC4uLmFyZ3M6IChzdHJpbmcgfCB7W2Nsczogc3RyaW5nXTogYm9vbGVhbn0pW10pIHtcbiAgICBjb25zdCBjbGFzc2VzID0gW107XG4gICAgYXJncy5maWx0ZXIoKGMpID0+IEJvb2xlYW4oYykpLmZvckVhY2goKGMpID0+IHtcbiAgICAgICAgaWYgKHR5cGVvZiBjID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgY2xhc3Nlcy5wdXNoKGMpO1xuICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBjID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgY2xhc3Nlcy5wdXNoKC4uLk9iamVjdC5rZXlzKGMpLmZpbHRlcigoa2V5KSA9PiBCb29sZWFuKGNba2V5XSkpKTtcbiAgICAgICAgfVxuICAgIH0pO1xuICAgIHJldHVybiBjbGFzc2VzLmpvaW4oJyAnKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNvbXBvc2U8VCBleHRlbmRzIE1hbGV2aWMuQ29tcG9uZW50Pih0eXBlOiBULCAuLi53cmFwcGVyczogKCh0OiBUKSA9PiBUKVtdKSB7XG4gICAgcmV0dXJuIHdyYXBwZXJzLnJlZHVjZSgodCwgdykgPT4gdyh0KSwgdHlwZSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBvcGVuRmlsZShvcHRpb25zOiB7ZXh0ZW5zaW9uczogc3RyaW5nW119LCBjYWxsYmFjazogKGNvbnRlbnQ6IHN0cmluZykgPT4gdm9pZCkge1xuICAgIGNvbnN0IGlucHV0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnaW5wdXQnKTtcbiAgICBpbnB1dC50eXBlID0gJ2ZpbGUnO1xuICAgIGlucHV0LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG4gICAgaWYgKG9wdGlvbnMuZXh0ZW5zaW9ucyAmJiBvcHRpb25zLmV4dGVuc2lvbnMubGVuZ3RoID4gMCkge1xuICAgICAgICBpbnB1dC5hY2NlcHQgPSBvcHRpb25zLmV4dGVuc2lvbnMubWFwKChleHQpID0+IGAuJHtleHR9YCkuam9pbignLCcpO1xuICAgIH1cbiAgICBjb25zdCByZWFkZXIgPSBuZXcgRmlsZVJlYWRlcigpO1xuICAgIHJlYWRlci5vbmxvYWRlbmQgPSAoKSA9PiBjYWxsYmFjayhyZWFkZXIucmVzdWx0IGFzIHN0cmluZyk7XG4gICAgaW5wdXQub25jaGFuZ2UgPSAoKSA9PiB7XG4gICAgICAgIGlmIChpbnB1dC5maWxlc1swXSkge1xuICAgICAgICAgICAgcmVhZGVyLnJlYWRBc1RleHQoaW5wdXQuZmlsZXNbMF0pO1xuICAgICAgICAgICAgZG9jdW1lbnQuYm9keS5yZW1vdmVDaGlsZChpbnB1dCk7XG4gICAgICAgIH1cbiAgICB9O1xuICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoaW5wdXQpO1xuICAgIGlucHV0LmNsaWNrKCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzYXZlRmlsZShuYW1lOiBzdHJpbmcsIGNvbnRlbnQ6IHN0cmluZykge1xuICAgIGlmIChpc0ZpcmVmb3goKSkge1xuICAgICAgICBjb25zdCBhID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpO1xuICAgICAgICBhLmhyZWYgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKG5ldyBCbG9iKFtjb250ZW50XSkpO1xuICAgICAgICBhLmRvd25sb2FkID0gbmFtZTtcbiAgICAgICAgYS5jbGljaygpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHt0eXBlOiAnc2F2ZS1maWxlJywgZGF0YToge25hbWUsIGNvbnRlbnR9fSk7XG4gICAgfVxufVxuXG50eXBlIEFueVZvaWRGdW5jdGlvbiA9ICguLi5hcmdzOiBhbnlbXSkgPT4gdm9pZDtcblxuZXhwb3J0IGZ1bmN0aW9uIHRocm90dGxlPEYgZXh0ZW5kcyBBbnlWb2lkRnVuY3Rpb24+KGNhbGxiYWNrOiBGKTogRiB7XG4gICAgbGV0IGZyYW1lSWQgPSBudWxsO1xuICAgIHJldHVybiAoKC4uLmFyZ3M6IGFueVtdKSA9PiB7XG4gICAgICAgIGlmICghZnJhbWVJZCkge1xuICAgICAgICAgICAgY2FsbGJhY2soLi4uYXJncyk7XG4gICAgICAgICAgICBmcmFtZUlkID0gcmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IChmcmFtZUlkID0gbnVsbCkpO1xuICAgICAgICB9XG4gICAgfSkgYXMgRjtcbn1cblxuaW50ZXJmYWNlIFN3aXBlRXZlbnRPYmplY3Qge1xuICAgIGNsaWVudFg6IG51bWJlcjtcbiAgICBjbGllbnRZOiBudW1iZXI7XG59XG5cbnR5cGUgU3dpcGVFdmVudEhhbmRsZXI8VCA9IHZvaWQ+ID0gKGU6IFN3aXBlRXZlbnRPYmplY3QsIG5hdGl2ZUV2ZW50OiBNb3VzZUV2ZW50IHwgVG91Y2hFdmVudCkgPT4gVDtcbnR5cGUgU3RhcnRTd2lwZUhhbmRsZXIgPSBTd2lwZUV2ZW50SGFuZGxlcjx7bW92ZTogU3dpcGVFdmVudEhhbmRsZXI7IHVwOiBTd2lwZUV2ZW50SGFuZGxlcn0+O1xuXG5mdW5jdGlvbiBvblN3aXBlU3RhcnQoXG4gICAgc3RhcnRFdmVudE9iajogTW91c2VFdmVudCB8IFRvdWNoRXZlbnQsXG4gICAgc3RhcnRIYW5kbGVyOiBTdGFydFN3aXBlSGFuZGxlcixcbikge1xuICAgIGNvbnN0IGlzVG91Y2hFdmVudCA9XG4gICAgICAgIHR5cGVvZiBUb3VjaEV2ZW50ICE9PSAndW5kZWZpbmVkJyAmJlxuICAgICAgICBzdGFydEV2ZW50T2JqIGluc3RhbmNlb2YgVG91Y2hFdmVudDtcbiAgICBjb25zdCB0b3VjaElkID0gaXNUb3VjaEV2ZW50XG4gICAgICAgID8gKHN0YXJ0RXZlbnRPYmogYXMgVG91Y2hFdmVudCkuY2hhbmdlZFRvdWNoZXNbMF0uaWRlbnRpZmllclxuICAgICAgICA6IG51bGw7XG4gICAgY29uc3QgcG9pbnRlck1vdmVFdmVudCA9IGlzVG91Y2hFdmVudCA/ICd0b3VjaG1vdmUnIDogJ21vdXNlbW92ZSc7XG4gICAgY29uc3QgcG9pbnRlclVwRXZlbnQgPSBpc1RvdWNoRXZlbnQgPyAndG91Y2hlbmQnIDogJ21vdXNldXAnO1xuXG4gICAgaWYgKCFpc1RvdWNoRXZlbnQpIHtcbiAgICAgICAgc3RhcnRFdmVudE9iai5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGdldFN3aXBlRXZlbnRPYmplY3QoZTogTW91c2VFdmVudCB8IFRvdWNoRXZlbnQpIHtcbiAgICAgICAgY29uc3Qge2NsaWVudFgsIGNsaWVudFl9ID0gaXNUb3VjaEV2ZW50XG4gICAgICAgICAgICA/IGdldFRvdWNoKGUgYXMgVG91Y2hFdmVudClcbiAgICAgICAgICAgIDogZSBhcyBNb3VzZUV2ZW50O1xuICAgICAgICByZXR1cm4ge2NsaWVudFgsIGNsaWVudFl9O1xuICAgIH1cblxuICAgIGNvbnN0IHN0YXJ0U0UgPSBnZXRTd2lwZUV2ZW50T2JqZWN0KHN0YXJ0RXZlbnRPYmopO1xuICAgIGNvbnN0IHttb3ZlOiBtb3ZlSGFuZGxlciwgdXA6IHVwSGFuZGxlcn0gPSBzdGFydEhhbmRsZXIoc3RhcnRTRSwgc3RhcnRFdmVudE9iaik7XG5cbiAgICBmdW5jdGlvbiBnZXRUb3VjaChlOiBUb3VjaEV2ZW50KSB7XG4gICAgICAgIHJldHVybiBBcnJheS5mcm9tKGUuY2hhbmdlZFRvdWNoZXMpLmZpbmQoXG4gICAgICAgICAgICAoe2lkZW50aWZpZXI6IGlkfSkgPT4gaWQgPT09IHRvdWNoSWQsXG4gICAgICAgICk7XG4gICAgfVxuXG4gICAgY29uc3Qgb25Qb2ludGVyTW92ZSA9IHRocm90dGxlKChlKSA9PiB7XG4gICAgICAgIGNvbnN0IHNlID0gZ2V0U3dpcGVFdmVudE9iamVjdChlKTtcbiAgICAgICAgbW92ZUhhbmRsZXIoc2UsIGUpO1xuICAgIH0pO1xuXG4gICAgZnVuY3Rpb24gb25Qb2ludGVyVXAoZSkge1xuICAgICAgICB1bnN1YnNjcmliZSgpO1xuICAgICAgICBjb25zdCBzZSA9IGdldFN3aXBlRXZlbnRPYmplY3QoZSk7XG4gICAgICAgIHVwSGFuZGxlcihzZSwgZSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gdW5zdWJzY3JpYmUoKSB7XG4gICAgICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKHBvaW50ZXJNb3ZlRXZlbnQsIG9uUG9pbnRlck1vdmUpO1xuICAgICAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcihwb2ludGVyVXBFdmVudCwgb25Qb2ludGVyVXApO1xuICAgIH1cblxuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKHBvaW50ZXJNb3ZlRXZlbnQsIG9uUG9pbnRlck1vdmUsIHtwYXNzaXZlOiB0cnVlfSk7XG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIocG9pbnRlclVwRXZlbnQsIG9uUG9pbnRlclVwLCB7cGFzc2l2ZTogdHJ1ZX0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlU3dpcGVIYW5kbGVyKHN0YXJ0SGFuZGxlcjogU3RhcnRTd2lwZUhhbmRsZXIpIHtcbiAgICByZXR1cm4gKGU6IE1vdXNlRXZlbnQgfCBUb3VjaEV2ZW50KSA9PiBvblN3aXBlU3RhcnQoZSwgc3RhcnRIYW5kbGVyKTtcbn1cbiIsImltcG9ydCB7Y2xhc3Nlc30gZnJvbSAnLi4vdXRpbHMnO1xuXG5mdW5jdGlvbiB0b0FycmF5PFQ+KHg6IFQgfCBUW10pIHtcbiAgICByZXR1cm4gQXJyYXkuaXNBcnJheSh4KSA/IHggOiBbeF07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtZXJnZUNsYXNzKFxuICAgIGNsczogc3RyaW5nIHwge1tjbHM6IHN0cmluZ106IGFueX0gfCAoc3RyaW5nIHwge1tjbHM6IHN0cmluZ106IGFueX0pW10sXG4gICAgcHJvcHNDbHM6IHN0cmluZyB8IHtbY2xzOiBzdHJpbmddOiBhbnl9IHwgKHN0cmluZyB8IHtbY2xzOiBzdHJpbmddOiBhbnl9KVtdXG4pIHtcbiAgICBjb25zdCBub3JtYWxpemVkID0gdG9BcnJheShjbHMpLmNvbmNhdCh0b0FycmF5KHByb3BzQ2xzKSk7XG4gICAgcmV0dXJuIGNsYXNzZXMoLi4ubm9ybWFsaXplZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBvbWl0QXR0cnMob21pdDogc3RyaW5nW10sIGF0dHJzOiBNYWxldmljLk5vZGVBdHRycykge1xuICAgIGNvbnN0IHJlc3VsdDogTWFsZXZpYy5Ob2RlQXR0cnMgPSB7fTtcbiAgICBPYmplY3Qua2V5cyhhdHRycykuZm9yRWFjaCgoa2V5KSA9PiB7XG4gICAgICAgIGlmIChvbWl0LmluZGV4T2Yoa2V5KSA8IDApIHtcbiAgICAgICAgICAgIHJlc3VsdFtrZXldID0gYXR0cnNba2V5XTtcbiAgICAgICAgfVxuICAgIH0pO1xuICAgIHJldHVybiByZXN1bHQ7XG59XG4iLCJpbXBvcnQge219IGZyb20gJ21hbGV2aWMnO1xuaW1wb3J0IHttZXJnZUNsYXNzLCBvbWl0QXR0cnN9IGZyb20gJy4uL3V0aWxzJztcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gQnV0dG9uKHByb3BzOiBNYWxldmljLk5vZGVBdHRycywgLi4uY2hpbGRyZW4pIHtcbiAgICBjb25zdCBjbHMgPSBtZXJnZUNsYXNzKCdidXR0b24nLCBwcm9wcy5jbGFzcyk7XG4gICAgY29uc3QgYXR0cnMgPSBvbWl0QXR0cnMoWydjbGFzcyddLCBwcm9wcyk7XG5cbiAgICByZXR1cm4gKFxuICAgICAgICA8YnV0dG9uIGNsYXNzPXtjbHN9IHsuLi5hdHRyc30+XG4gICAgICAgICAgICA8c3BhbiBjbGFzcz1cImJ1dHRvbl9fd3JhcHBlclwiPlxuICAgICAgICAgICAgICAgIHsuLi5jaGlsZHJlbn1cbiAgICAgICAgICAgIDwvc3Bhbj5cbiAgICAgICAgPC9idXR0b24+XG4gICAgKTtcbn1cbiIsImltcG9ydCB7bX0gZnJvbSAnbWFsZXZpYyc7XG5pbXBvcnQge21lcmdlQ2xhc3MsIG9taXRBdHRyc30gZnJvbSAnLi4vdXRpbHMnO1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBDaGVja0JveChwcm9wczogTWFsZXZpYy5Ob2RlQXR0cnMsIC4uLmNoaWxkcmVuKSB7XG4gICAgY29uc3QgY2xzID0gbWVyZ2VDbGFzcygnY2hlY2tib3gnLCBwcm9wcy5jbGFzcyk7XG4gICAgY29uc3QgYXR0cnMgPSBvbWl0QXR0cnMoWydjbGFzcycsICdjaGVja2VkJywgJ29uY2hhbmdlJ10sIHByb3BzKTtcbiAgICBjb25zdCBjaGVjayA9IChkb21Ob2RlOiBIVE1MSW5wdXRFbGVtZW50KSA9PiBkb21Ob2RlLmNoZWNrZWQgPSBCb29sZWFuKHByb3BzLmNoZWNrZWQpO1xuXG4gICAgcmV0dXJuIChcbiAgICAgICAgPGxhYmVsIGNsYXNzPXtjbHN9IHsuLi5hdHRyc30+XG4gICAgICAgICAgICA8aW5wdXRcbiAgICAgICAgICAgICAgICBjbGFzcz1cImNoZWNrYm94X19pbnB1dFwiXG4gICAgICAgICAgICAgICAgdHlwZT1cImNoZWNrYm94XCJcbiAgICAgICAgICAgICAgICBjaGVja2VkPXtwcm9wcy5jaGVja2VkfVxuICAgICAgICAgICAgICAgIG9uY2hhbmdlPXtwcm9wcy5vbmNoYW5nZX1cbiAgICAgICAgICAgICAgICBvbnJlbmRlcj17Y2hlY2t9XG4gICAgICAgICAgICAvPlxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJjaGVja2JveF9fY2hlY2ttYXJrXCI+PC9zcGFuPlxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJjaGVja2JveF9fY29udGVudFwiPntjaGlsZHJlbn08L3NwYW4+XG4gICAgICAgIDwvbGFiZWw+XG4gICAgKTtcbn1cbiIsImV4cG9ydCBpbnRlcmZhY2UgUkdCQSB7XG4gICAgcjogbnVtYmVyO1xuICAgIGc6IG51bWJlcjtcbiAgICBiOiBudW1iZXI7XG4gICAgYT86IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBIU0xBIHtcbiAgICBoOiBudW1iZXI7XG4gICAgczogbnVtYmVyO1xuICAgIGw6IG51bWJlcjtcbiAgICBhPzogbnVtYmVyO1xufVxuXG4vLyBodHRwczovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9IU0xfYW5kX0hTVlxuZXhwb3J0IGZ1bmN0aW9uIGhzbFRvUkdCKHtoLCBzLCBsLCBhID0gMX06IEhTTEEpOiBSR0JBIHtcbiAgICBpZiAocyA9PT0gMCkge1xuICAgICAgICBjb25zdCBbciwgYiwgZ10gPSBbbCwgbCwgbF0ubWFwKCh4KSA9PiBNYXRoLnJvdW5kKHggKiAyNTUpKTtcbiAgICAgICAgcmV0dXJuIHtyLCBnLCBiLCBhfTtcbiAgICB9XG5cbiAgICBjb25zdCBjID0gKDEgLSBNYXRoLmFicygyICogbCAtIDEpKSAqIHM7XG4gICAgY29uc3QgeCA9IGMgKiAoMSAtIE1hdGguYWJzKChoIC8gNjApICUgMiAtIDEpKTtcbiAgICBjb25zdCBtID0gbCAtIGMgLyAyO1xuICAgIGNvbnN0IFtyLCBnLCBiXSA9IChcbiAgICAgICAgaCA8IDYwID8gW2MsIHgsIDBdIDpcbiAgICAgICAgICAgIGggPCAxMjAgPyBbeCwgYywgMF0gOlxuICAgICAgICAgICAgICAgIGggPCAxODAgPyBbMCwgYywgeF0gOlxuICAgICAgICAgICAgICAgICAgICBoIDwgMjQwID8gWzAsIHgsIGNdIDpcbiAgICAgICAgICAgICAgICAgICAgICAgIGggPCAzMDAgPyBbeCwgMCwgY10gOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFtjLCAwLCB4XVxuICAgICkubWFwKChuKSA9PiBNYXRoLnJvdW5kKChuICsgbSkgKiAyNTUpKTtcblxuICAgIHJldHVybiB7ciwgZywgYiwgYX07XG59XG5cbi8vIGh0dHBzOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL0hTTF9hbmRfSFNWXG5leHBvcnQgZnVuY3Rpb24gcmdiVG9IU0woe3I6IHIyNTUsIGc6IGcyNTUsIGI6IGIyNTUsIGEgPSAxfTogUkdCQSk6IEhTTEEge1xuICAgIGNvbnN0IHIgPSByMjU1IC8gMjU1O1xuICAgIGNvbnN0IGcgPSBnMjU1IC8gMjU1O1xuICAgIGNvbnN0IGIgPSBiMjU1IC8gMjU1O1xuXG4gICAgY29uc3QgbWF4ID0gTWF0aC5tYXgociwgZywgYik7XG4gICAgY29uc3QgbWluID0gTWF0aC5taW4ociwgZywgYik7XG4gICAgY29uc3QgYyA9IG1heCAtIG1pbjtcblxuICAgIGNvbnN0IGwgPSAobWF4ICsgbWluKSAvIDI7XG5cbiAgICBpZiAoYyA9PT0gMCkge1xuICAgICAgICByZXR1cm4ge2g6IDAsIHM6IDAsIGwsIGF9O1xuICAgIH1cblxuICAgIGxldCBoID0gKFxuICAgICAgICBtYXggPT09IHIgPyAoKChnIC0gYikgLyBjKSAlIDYpIDpcbiAgICAgICAgICAgIG1heCA9PT0gZyA/ICgoYiAtIHIpIC8gYyArIDIpIDpcbiAgICAgICAgICAgICAgICAoKHIgLSBnKSAvIGMgKyA0KVxuICAgICkgKiA2MDtcbiAgICBpZiAoaCA8IDApIHtcbiAgICAgICAgaCArPSAzNjA7XG4gICAgfVxuXG4gICAgY29uc3QgcyA9IGMgLyAoMSAtIE1hdGguYWJzKDIgKiBsIC0gMSkpO1xuXG4gICAgcmV0dXJuIHtoLCBzLCBsLCBhfTtcbn1cblxuZnVuY3Rpb24gdG9GaXhlZChuOiBudW1iZXIsIGRpZ2l0cyA9IDApIHtcbiAgICBjb25zdCBmaXhlZCA9IG4udG9GaXhlZChkaWdpdHMpO1xuICAgIGlmIChkaWdpdHMgPT09IDApIHtcbiAgICAgICAgcmV0dXJuIGZpeGVkO1xuICAgIH1cbiAgICBjb25zdCBkb3QgPSBmaXhlZC5pbmRleE9mKCcuJyk7XG4gICAgaWYgKGRvdCA+PSAwKSB7XG4gICAgICAgIGNvbnN0IHplcm9zTWF0Y2ggPSBmaXhlZC5tYXRjaCgvMCskLyk7XG4gICAgICAgIGlmICh6ZXJvc01hdGNoKSB7XG4gICAgICAgICAgICBpZiAoemVyb3NNYXRjaC5pbmRleCA9PT0gZG90ICsgMSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmaXhlZC5zdWJzdHJpbmcoMCwgZG90KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBmaXhlZC5zdWJzdHJpbmcoMCwgemVyb3NNYXRjaC5pbmRleCk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZpeGVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmdiVG9TdHJpbmcocmdiOiBSR0JBKSB7XG4gICAgY29uc3Qge3IsIGcsIGIsIGF9ID0gcmdiO1xuICAgIGlmIChhICE9IG51bGwgJiYgYSA8IDEpIHtcbiAgICAgICAgcmV0dXJuIGByZ2JhKCR7dG9GaXhlZChyKX0sICR7dG9GaXhlZChnKX0sICR7dG9GaXhlZChiKX0sICR7dG9GaXhlZChhLCAyKX0pYDtcbiAgICB9XG4gICAgcmV0dXJuIGByZ2IoJHt0b0ZpeGVkKHIpfSwgJHt0b0ZpeGVkKGcpfSwgJHt0b0ZpeGVkKGIpfSlgO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmdiVG9IZXhTdHJpbmcoe3IsIGcsIGIsIGF9OiBSR0JBKSB7XG4gICAgcmV0dXJuIGAjJHsoYSAhPSBudWxsICYmIGEgPCAxID8gW3IsIGcsIGIsIE1hdGgucm91bmQoYSAqIDI1NSldIDogW3IsIGcsIGJdKS5tYXAoKHgpID0+IHtcbiAgICAgICAgcmV0dXJuIGAke3ggPCAxNiA/ICcwJyA6ICcnfSR7eC50b1N0cmluZygxNil9YDtcbiAgICB9KS5qb2luKCcnKX1gO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaHNsVG9TdHJpbmcoaHNsOiBIU0xBKSB7XG4gICAgY29uc3Qge2gsIHMsIGwsIGF9ID0gaHNsO1xuICAgIGlmIChhICE9IG51bGwgJiYgYSA8IDEpIHtcbiAgICAgICAgcmV0dXJuIGBoc2xhKCR7dG9GaXhlZChoKX0sICR7dG9GaXhlZChzICogMTAwKX0lLCAke3RvRml4ZWQobCAqIDEwMCl9JSwgJHt0b0ZpeGVkKGEsIDIpfSlgO1xuICAgIH1cbiAgICByZXR1cm4gYGhzbCgke3RvRml4ZWQoaCl9LCAke3RvRml4ZWQocyAqIDEwMCl9JSwgJHt0b0ZpeGVkKGwgKiAxMDApfSUpYDtcbn1cblxuY29uc3QgcmdiTWF0Y2ggPSAvXnJnYmE/XFwoW15cXChcXCldK1xcKSQvO1xuY29uc3QgaHNsTWF0Y2ggPSAvXmhzbGE/XFwoW15cXChcXCldK1xcKSQvO1xuY29uc3QgaGV4TWF0Y2ggPSAvXiNbMC05YS1mXSskL2k7XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZSgkY29sb3I6IHN0cmluZyk6IFJHQkEge1xuICAgIGNvbnN0IGMgPSAkY29sb3IudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG5cbiAgICBpZiAoYy5tYXRjaChyZ2JNYXRjaCkpIHtcbiAgICAgICAgcmV0dXJuIHBhcnNlUkdCKGMpO1xuICAgIH1cblxuICAgIGlmIChjLm1hdGNoKGhzbE1hdGNoKSkge1xuICAgICAgICByZXR1cm4gcGFyc2VIU0woYyk7XG4gICAgfVxuXG4gICAgaWYgKGMubWF0Y2goaGV4TWF0Y2gpKSB7XG4gICAgICAgIHJldHVybiBwYXJzZUhleChjKTtcbiAgICB9XG5cbiAgICBpZiAoa25vd25Db2xvcnMuaGFzKGMpKSB7XG4gICAgICAgIHJldHVybiBnZXRDb2xvckJ5TmFtZShjKTtcbiAgICB9XG5cbiAgICBpZiAoc3lzdGVtQ29sb3JzLmhhcyhjKSkge1xuICAgICAgICByZXR1cm4gZ2V0U3lzdGVtQ29sb3IoYyk7XG4gICAgfVxuXG4gICAgaWYgKCRjb2xvciA9PT0gJ3RyYW5zcGFyZW50Jykge1xuICAgICAgICByZXR1cm4ge3I6IDAsIGc6IDAsIGI6IDAsIGE6IDB9O1xuICAgIH1cblxuICAgIHRocm93IG5ldyBFcnJvcihgVW5hYmxlIHRvIHBhcnNlICR7JGNvbG9yfWApO1xufVxuXG5mdW5jdGlvbiBnZXROdW1iZXJzRnJvbVN0cmluZyhzdHI6IHN0cmluZywgc3BsaXR0ZXI6IFJlZ0V4cCwgcmFuZ2U6IG51bWJlcltdLCB1bml0czoge1t1bml0OiBzdHJpbmddOiBudW1iZXJ9KSB7XG4gICAgY29uc3QgcmF3ID0gc3RyLnNwbGl0KHNwbGl0dGVyKS5maWx0ZXIoKHgpID0+IHgpO1xuICAgIGNvbnN0IHVuaXRzTGlzdCA9IE9iamVjdC5lbnRyaWVzKHVuaXRzKTtcbiAgICBjb25zdCBudW1iZXJzID0gcmF3Lm1hcCgocikgPT4gci50cmltKCkpLm1hcCgociwgaSkgPT4ge1xuICAgICAgICBsZXQgbjogbnVtYmVyO1xuICAgICAgICBjb25zdCB1bml0ID0gdW5pdHNMaXN0LmZpbmQoKFt1XSkgPT4gci5lbmRzV2l0aCh1KSk7XG4gICAgICAgIGlmICh1bml0KSB7XG4gICAgICAgICAgICBuID0gcGFyc2VGbG9hdChyLnN1YnN0cmluZygwLCByLmxlbmd0aCAtIHVuaXRbMF0ubGVuZ3RoKSkgLyB1bml0WzFdICogcmFuZ2VbaV07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBuID0gcGFyc2VGbG9hdChyKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAocmFuZ2VbaV0gPiAxKSB7XG4gICAgICAgICAgICByZXR1cm4gTWF0aC5yb3VuZChuKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbjtcbiAgICB9KTtcbiAgICByZXR1cm4gbnVtYmVycztcbn1cblxuY29uc3QgcmdiU3BsaXR0ZXIgPSAvcmdiYT98XFwofFxcKXxcXC98LHxcXHMvaWc7XG5jb25zdCByZ2JSYW5nZSA9IFsyNTUsIDI1NSwgMjU1LCAxXTtcbmNvbnN0IHJnYlVuaXRzID0geyclJzogMTAwfTtcblxuZnVuY3Rpb24gcGFyc2VSR0IoJHJnYjogc3RyaW5nKSB7XG4gICAgY29uc3QgW3IsIGcsIGIsIGEgPSAxXSA9IGdldE51bWJlcnNGcm9tU3RyaW5nKCRyZ2IsIHJnYlNwbGl0dGVyLCByZ2JSYW5nZSwgcmdiVW5pdHMpO1xuICAgIHJldHVybiB7ciwgZywgYiwgYX07XG59XG5cbmNvbnN0IGhzbFNwbGl0dGVyID0gL2hzbGE/fFxcKHxcXCl8XFwvfCx8XFxzL2lnO1xuY29uc3QgaHNsUmFuZ2UgPSBbMzYwLCAxLCAxLCAxXTtcbmNvbnN0IGhzbFVuaXRzID0geyclJzogMTAwLCAnZGVnJzogMzYwLCAncmFkJzogMiAqIE1hdGguUEksICd0dXJuJzogMX07XG5cbmZ1bmN0aW9uIHBhcnNlSFNMKCRoc2w6IHN0cmluZykge1xuICAgIGNvbnN0IFtoLCBzLCBsLCBhID0gMV0gPSBnZXROdW1iZXJzRnJvbVN0cmluZygkaHNsLCBoc2xTcGxpdHRlciwgaHNsUmFuZ2UsIGhzbFVuaXRzKTtcbiAgICByZXR1cm4gaHNsVG9SR0Ioe2gsIHMsIGwsIGF9KTtcbn1cblxuZnVuY3Rpb24gcGFyc2VIZXgoJGhleDogc3RyaW5nKSB7XG4gICAgY29uc3QgaCA9ICRoZXguc3Vic3RyaW5nKDEpO1xuICAgIHN3aXRjaCAoaC5sZW5ndGgpIHtcbiAgICAgICAgY2FzZSAzOlxuICAgICAgICBjYXNlIDQ6IHtcbiAgICAgICAgICAgIGNvbnN0IFtyLCBnLCBiXSA9IFswLCAxLCAyXS5tYXAoKGkpID0+IHBhcnNlSW50KGAke2hbaV19JHtoW2ldfWAsIDE2KSk7XG4gICAgICAgICAgICBjb25zdCBhID0gaC5sZW5ndGggPT09IDMgPyAxIDogKHBhcnNlSW50KGAke2hbM119JHtoWzNdfWAsIDE2KSAvIDI1NSk7XG4gICAgICAgICAgICByZXR1cm4ge3IsIGcsIGIsIGF9O1xuICAgICAgICB9XG4gICAgICAgIGNhc2UgNjpcbiAgICAgICAgY2FzZSA4OiB7XG4gICAgICAgICAgICBjb25zdCBbciwgZywgYl0gPSBbMCwgMiwgNF0ubWFwKChpKSA9PiBwYXJzZUludChoLnN1YnN0cmluZyhpLCBpICsgMiksIDE2KSk7XG4gICAgICAgICAgICBjb25zdCBhID0gaC5sZW5ndGggPT09IDYgPyAxIDogKHBhcnNlSW50KGguc3Vic3RyaW5nKDYsIDgpLCAxNikgLyAyNTUpO1xuICAgICAgICAgICAgcmV0dXJuIHtyLCBnLCBiLCBhfTtcbiAgICAgICAgfVxuICAgIH1cbiAgICB0aHJvdyBuZXcgRXJyb3IoYFVuYWJsZSB0byBwYXJzZSAkeyRoZXh9YCk7XG59XG5cbmZ1bmN0aW9uIGdldENvbG9yQnlOYW1lKCRjb2xvcjogc3RyaW5nKSB7XG4gICAgY29uc3QgbiA9IGtub3duQ29sb3JzLmdldCgkY29sb3IpO1xuICAgIHJldHVybiB7XG4gICAgICAgIHI6IChuID4+IDE2KSAmIDI1NSxcbiAgICAgICAgZzogKG4gPj4gOCkgJiAyNTUsXG4gICAgICAgIGI6IChuID4+IDApICYgMjU1LFxuICAgICAgICBhOiAxXG4gICAgfTtcbn1cblxuZnVuY3Rpb24gZ2V0U3lzdGVtQ29sb3IoJGNvbG9yOiBzdHJpbmcpIHtcbiAgICBjb25zdCBuID0gc3lzdGVtQ29sb3JzLmdldCgkY29sb3IpO1xuICAgIHJldHVybiB7XG4gICAgICAgIHI6IChuID4+IDE2KSAmIDI1NSxcbiAgICAgICAgZzogKG4gPj4gOCkgJiAyNTUsXG4gICAgICAgIGI6IChuID4+IDApICYgMjU1LFxuICAgICAgICBhOiAxXG4gICAgfTtcbn1cblxuY29uc3Qga25vd25Db2xvcnM6IE1hcDxzdHJpbmcsIG51bWJlcj4gPSBuZXcgTWFwKE9iamVjdC5lbnRyaWVzKHtcbiAgICBhbGljZWJsdWU6IDB4ZjBmOGZmLFxuICAgIGFudGlxdWV3aGl0ZTogMHhmYWViZDcsXG4gICAgYXF1YTogMHgwMGZmZmYsXG4gICAgYXF1YW1hcmluZTogMHg3ZmZmZDQsXG4gICAgYXp1cmU6IDB4ZjBmZmZmLFxuICAgIGJlaWdlOiAweGY1ZjVkYyxcbiAgICBiaXNxdWU6IDB4ZmZlNGM0LFxuICAgIGJsYWNrOiAweDAwMDAwMCxcbiAgICBibGFuY2hlZGFsbW9uZDogMHhmZmViY2QsXG4gICAgYmx1ZTogMHgwMDAwZmYsXG4gICAgYmx1ZXZpb2xldDogMHg4YTJiZTIsXG4gICAgYnJvd246IDB4YTUyYTJhLFxuICAgIGJ1cmx5d29vZDogMHhkZWI4ODcsXG4gICAgY2FkZXRibHVlOiAweDVmOWVhMCxcbiAgICBjaGFydHJldXNlOiAweDdmZmYwMCxcbiAgICBjaG9jb2xhdGU6IDB4ZDI2OTFlLFxuICAgIGNvcmFsOiAweGZmN2Y1MCxcbiAgICBjb3JuZmxvd2VyYmx1ZTogMHg2NDk1ZWQsXG4gICAgY29ybnNpbGs6IDB4ZmZmOGRjLFxuICAgIGNyaW1zb246IDB4ZGMxNDNjLFxuICAgIGN5YW46IDB4MDBmZmZmLFxuICAgIGRhcmtibHVlOiAweDAwMDA4YixcbiAgICBkYXJrY3lhbjogMHgwMDhiOGIsXG4gICAgZGFya2dvbGRlbnJvZDogMHhiODg2MGIsXG4gICAgZGFya2dyYXk6IDB4YTlhOWE5LFxuICAgIGRhcmtncmV5OiAweGE5YTlhOSxcbiAgICBkYXJrZ3JlZW46IDB4MDA2NDAwLFxuICAgIGRhcmtraGFraTogMHhiZGI3NmIsXG4gICAgZGFya21hZ2VudGE6IDB4OGIwMDhiLFxuICAgIGRhcmtvbGl2ZWdyZWVuOiAweDU1NmIyZixcbiAgICBkYXJrb3JhbmdlOiAweGZmOGMwMCxcbiAgICBkYXJrb3JjaGlkOiAweDk5MzJjYyxcbiAgICBkYXJrcmVkOiAweDhiMDAwMCxcbiAgICBkYXJrc2FsbW9uOiAweGU5OTY3YSxcbiAgICBkYXJrc2VhZ3JlZW46IDB4OGZiYzhmLFxuICAgIGRhcmtzbGF0ZWJsdWU6IDB4NDgzZDhiLFxuICAgIGRhcmtzbGF0ZWdyYXk6IDB4MmY0ZjRmLFxuICAgIGRhcmtzbGF0ZWdyZXk6IDB4MmY0ZjRmLFxuICAgIGRhcmt0dXJxdW9pc2U6IDB4MDBjZWQxLFxuICAgIGRhcmt2aW9sZXQ6IDB4OTQwMGQzLFxuICAgIGRlZXBwaW5rOiAweGZmMTQ5MyxcbiAgICBkZWVwc2t5Ymx1ZTogMHgwMGJmZmYsXG4gICAgZGltZ3JheTogMHg2OTY5NjksXG4gICAgZGltZ3JleTogMHg2OTY5NjksXG4gICAgZG9kZ2VyYmx1ZTogMHgxZTkwZmYsXG4gICAgZmlyZWJyaWNrOiAweGIyMjIyMixcbiAgICBmbG9yYWx3aGl0ZTogMHhmZmZhZjAsXG4gICAgZm9yZXN0Z3JlZW46IDB4MjI4YjIyLFxuICAgIGZ1Y2hzaWE6IDB4ZmYwMGZmLFxuICAgIGdhaW5zYm9ybzogMHhkY2RjZGMsXG4gICAgZ2hvc3R3aGl0ZTogMHhmOGY4ZmYsXG4gICAgZ29sZDogMHhmZmQ3MDAsXG4gICAgZ29sZGVucm9kOiAweGRhYTUyMCxcbiAgICBncmF5OiAweDgwODA4MCxcbiAgICBncmV5OiAweDgwODA4MCxcbiAgICBncmVlbjogMHgwMDgwMDAsXG4gICAgZ3JlZW55ZWxsb3c6IDB4YWRmZjJmLFxuICAgIGhvbmV5ZGV3OiAweGYwZmZmMCxcbiAgICBob3RwaW5rOiAweGZmNjliNCxcbiAgICBpbmRpYW5yZWQ6IDB4Y2Q1YzVjLFxuICAgIGluZGlnbzogMHg0YjAwODIsXG4gICAgaXZvcnk6IDB4ZmZmZmYwLFxuICAgIGtoYWtpOiAweGYwZTY4YyxcbiAgICBsYXZlbmRlcjogMHhlNmU2ZmEsXG4gICAgbGF2ZW5kZXJibHVzaDogMHhmZmYwZjUsXG4gICAgbGF3bmdyZWVuOiAweDdjZmMwMCxcbiAgICBsZW1vbmNoaWZmb246IDB4ZmZmYWNkLFxuICAgIGxpZ2h0Ymx1ZTogMHhhZGQ4ZTYsXG4gICAgbGlnaHRjb3JhbDogMHhmMDgwODAsXG4gICAgbGlnaHRjeWFuOiAweGUwZmZmZixcbiAgICBsaWdodGdvbGRlbnJvZHllbGxvdzogMHhmYWZhZDIsXG4gICAgbGlnaHRncmF5OiAweGQzZDNkMyxcbiAgICBsaWdodGdyZXk6IDB4ZDNkM2QzLFxuICAgIGxpZ2h0Z3JlZW46IDB4OTBlZTkwLFxuICAgIGxpZ2h0cGluazogMHhmZmI2YzEsXG4gICAgbGlnaHRzYWxtb246IDB4ZmZhMDdhLFxuICAgIGxpZ2h0c2VhZ3JlZW46IDB4MjBiMmFhLFxuICAgIGxpZ2h0c2t5Ymx1ZTogMHg4N2NlZmEsXG4gICAgbGlnaHRzbGF0ZWdyYXk6IDB4Nzc4ODk5LFxuICAgIGxpZ2h0c2xhdGVncmV5OiAweDc3ODg5OSxcbiAgICBsaWdodHN0ZWVsYmx1ZTogMHhiMGM0ZGUsXG4gICAgbGlnaHR5ZWxsb3c6IDB4ZmZmZmUwLFxuICAgIGxpbWU6IDB4MDBmZjAwLFxuICAgIGxpbWVncmVlbjogMHgzMmNkMzIsXG4gICAgbGluZW46IDB4ZmFmMGU2LFxuICAgIG1hZ2VudGE6IDB4ZmYwMGZmLFxuICAgIG1hcm9vbjogMHg4MDAwMDAsXG4gICAgbWVkaXVtYXF1YW1hcmluZTogMHg2NmNkYWEsXG4gICAgbWVkaXVtYmx1ZTogMHgwMDAwY2QsXG4gICAgbWVkaXVtb3JjaGlkOiAweGJhNTVkMyxcbiAgICBtZWRpdW1wdXJwbGU6IDB4OTM3MGRiLFxuICAgIG1lZGl1bXNlYWdyZWVuOiAweDNjYjM3MSxcbiAgICBtZWRpdW1zbGF0ZWJsdWU6IDB4N2I2OGVlLFxuICAgIG1lZGl1bXNwcmluZ2dyZWVuOiAweDAwZmE5YSxcbiAgICBtZWRpdW10dXJxdW9pc2U6IDB4NDhkMWNjLFxuICAgIG1lZGl1bXZpb2xldHJlZDogMHhjNzE1ODUsXG4gICAgbWlkbmlnaHRibHVlOiAweDE5MTk3MCxcbiAgICBtaW50Y3JlYW06IDB4ZjVmZmZhLFxuICAgIG1pc3R5cm9zZTogMHhmZmU0ZTEsXG4gICAgbW9jY2FzaW46IDB4ZmZlNGI1LFxuICAgIG5hdmFqb3doaXRlOiAweGZmZGVhZCxcbiAgICBuYXZ5OiAweDAwMDA4MCxcbiAgICBvbGRsYWNlOiAweGZkZjVlNixcbiAgICBvbGl2ZTogMHg4MDgwMDAsXG4gICAgb2xpdmVkcmFiOiAweDZiOGUyMyxcbiAgICBvcmFuZ2U6IDB4ZmZhNTAwLFxuICAgIG9yYW5nZXJlZDogMHhmZjQ1MDAsXG4gICAgb3JjaGlkOiAweGRhNzBkNixcbiAgICBwYWxlZ29sZGVucm9kOiAweGVlZThhYSxcbiAgICBwYWxlZ3JlZW46IDB4OThmYjk4LFxuICAgIHBhbGV0dXJxdW9pc2U6IDB4YWZlZWVlLFxuICAgIHBhbGV2aW9sZXRyZWQ6IDB4ZGI3MDkzLFxuICAgIHBhcGF5YXdoaXA6IDB4ZmZlZmQ1LFxuICAgIHBlYWNocHVmZjogMHhmZmRhYjksXG4gICAgcGVydTogMHhjZDg1M2YsXG4gICAgcGluazogMHhmZmMwY2IsXG4gICAgcGx1bTogMHhkZGEwZGQsXG4gICAgcG93ZGVyYmx1ZTogMHhiMGUwZTYsXG4gICAgcHVycGxlOiAweDgwMDA4MCxcbiAgICByZWJlY2NhcHVycGxlOiAweDY2MzM5OSxcbiAgICByZWQ6IDB4ZmYwMDAwLFxuICAgIHJvc3licm93bjogMHhiYzhmOGYsXG4gICAgcm95YWxibHVlOiAweDQxNjllMSxcbiAgICBzYWRkbGVicm93bjogMHg4YjQ1MTMsXG4gICAgc2FsbW9uOiAweGZhODA3MixcbiAgICBzYW5keWJyb3duOiAweGY0YTQ2MCxcbiAgICBzZWFncmVlbjogMHgyZThiNTcsXG4gICAgc2Vhc2hlbGw6IDB4ZmZmNWVlLFxuICAgIHNpZW5uYTogMHhhMDUyMmQsXG4gICAgc2lsdmVyOiAweGMwYzBjMCxcbiAgICBza3libHVlOiAweDg3Y2VlYixcbiAgICBzbGF0ZWJsdWU6IDB4NmE1YWNkLFxuICAgIHNsYXRlZ3JheTogMHg3MDgwOTAsXG4gICAgc2xhdGVncmV5OiAweDcwODA5MCxcbiAgICBzbm93OiAweGZmZmFmYSxcbiAgICBzcHJpbmdncmVlbjogMHgwMGZmN2YsXG4gICAgc3RlZWxibHVlOiAweDQ2ODJiNCxcbiAgICB0YW46IDB4ZDJiNDhjLFxuICAgIHRlYWw6IDB4MDA4MDgwLFxuICAgIHRoaXN0bGU6IDB4ZDhiZmQ4LFxuICAgIHRvbWF0bzogMHhmZjYzNDcsXG4gICAgdHVycXVvaXNlOiAweDQwZTBkMCxcbiAgICB2aW9sZXQ6IDB4ZWU4MmVlLFxuICAgIHdoZWF0OiAweGY1ZGViMyxcbiAgICB3aGl0ZTogMHhmZmZmZmYsXG4gICAgd2hpdGVzbW9rZTogMHhmNWY1ZjUsXG4gICAgeWVsbG93OiAweGZmZmYwMCxcbiAgICB5ZWxsb3dncmVlbjogMHg5YWNkMzIsXG59KSk7XG5cbmNvbnN0IHN5c3RlbUNvbG9yczogTWFwPHN0cmluZywgbnVtYmVyPiA9IG5ldyBNYXAoT2JqZWN0LmVudHJpZXMoe1xuICAgIEFjdGl2ZUJvcmRlcjogMHgzYjk5ZmMsXG4gICAgQWN0aXZlQ2FwdGlvbjogMHgwMDAwMDAsXG4gICAgQXBwV29ya3NwYWNlOiAweGFhYWFhYSxcbiAgICBCYWNrZ3JvdW5kOiAweDYzNjNjZSxcbiAgICBCdXR0b25GYWNlOiAweGZmZmZmZixcbiAgICBCdXR0b25IaWdobGlnaHQ6IDB4ZTllOWU5LFxuICAgIEJ1dHRvblNoYWRvdzogMHg5ZmEwOWYsXG4gICAgQnV0dG9uVGV4dDogMHgwMDAwMDAsXG4gICAgQ2FwdGlvblRleHQ6IDB4MDAwMDAwLFxuICAgIEdyYXlUZXh0OiAweDdmN2Y3ZixcbiAgICBIaWdobGlnaHQ6IDB4YjJkN2ZmLFxuICAgIEhpZ2hsaWdodFRleHQ6IDB4MDAwMDAwLFxuICAgIEluYWN0aXZlQm9yZGVyOiAweGZmZmZmZixcbiAgICBJbmFjdGl2ZUNhcHRpb246IDB4ZmZmZmZmLFxuICAgIEluYWN0aXZlQ2FwdGlvblRleHQ6IDB4MDAwMDAwLFxuICAgIEluZm9CYWNrZ3JvdW5kOiAweGZiZmNjNSxcbiAgICBJbmZvVGV4dDogMHgwMDAwMDAsXG4gICAgTWVudTogMHhmNmY2ZjYsXG4gICAgTWVudVRleHQ6IDB4ZmZmZmZmLFxuICAgIFNjcm9sbGJhcjogMHhhYWFhYWEsXG4gICAgVGhyZWVERGFya1NoYWRvdzogMHgwMDAwMDAsXG4gICAgVGhyZWVERmFjZTogMHhjMGMwYzAsXG4gICAgVGhyZWVESGlnaGxpZ2h0OiAweGZmZmZmZixcbiAgICBUaHJlZURMaWdodFNoYWRvdzogMHhmZmZmZmYsXG4gICAgVGhyZWVEU2hhZG93OiAweDAwMDAwMCxcbiAgICBXaW5kb3c6IDB4ZWNlY2VjLFxuICAgIFdpbmRvd0ZyYW1lOiAweGFhYWFhYSxcbiAgICBXaW5kb3dUZXh0OiAweDAwMDAwMCxcbiAgICAnLXdlYmtpdC1mb2N1cy1yaW5nLWNvbG9yJzogMHhlNTk3MDBcbn0pLm1hcCgoW2tleSwgdmFsdWVdKSA9PiBba2V5LnRvTG93ZXJDYXNlKCksIHZhbHVlXSBhcyBbc3RyaW5nLCBudW1iZXJdKSk7XG4iLCJpbXBvcnQge219IGZyb20gJ21hbGV2aWMnO1xuaW1wb3J0IHttZXJnZUNsYXNzLCBvbWl0QXR0cnN9IGZyb20gJy4uL3V0aWxzJztcblxuaW50ZXJmYWNlIFRleHRCb3hQcm9wcyBleHRlbmRzIE1hbGV2aWMuTm9kZUF0dHJzIHtcbiAgICBvbmlucHV0PzogKGU6IEV2ZW50ICYge3RhcmdldDogSFRNTElucHV0RWxlbWVudH0pID0+IHZvaWQ7XG4gICAgb25jaGFuZ2U/OiAoZTogRXZlbnQgJiB7dGFyZ2V0OiBIVE1MSW5wdXRFbGVtZW50fSkgPT4gdm9pZDtcbn1cblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gVGV4dEJveChwcm9wczogVGV4dEJveFByb3BzKSB7XG4gICAgY29uc3QgY2xzID0gbWVyZ2VDbGFzcygndGV4dGJveCcsIHByb3BzLmNsYXNzKTtcbiAgICBjb25zdCBhdHRycyA9IG9taXRBdHRycyhbJ2NsYXNzJywgJ3R5cGUnXSwgcHJvcHMpO1xuXG4gICAgcmV0dXJuIChcbiAgICAgICAgPGlucHV0IGNsYXNzPXtjbHN9IHR5cGU9XCJ0ZXh0XCIgey4uLmF0dHJzfSAvPlxuICAgICk7XG59XG4iLCJleHBvcnQgZnVuY3Rpb24gc2NhbGUoeDogbnVtYmVyLCBpbkxvdzogbnVtYmVyLCBpbkhpZ2g6IG51bWJlciwgb3V0TG93OiBudW1iZXIsIG91dEhpZ2g6IG51bWJlcikge1xuICAgIHJldHVybiAoeCAtIGluTG93KSAqIChvdXRIaWdoIC0gb3V0TG93KSAvIChpbkhpZ2ggLSBpbkxvdykgKyBvdXRMb3c7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjbGFtcCh4OiBudW1iZXIsIG1pbjogbnVtYmVyLCBtYXg6IG51bWJlcikge1xuICAgIHJldHVybiBNYXRoLm1pbihtYXgsIE1hdGgubWF4KG1pbiwgeCkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbXVsdGlwbHlNYXRyaWNlcyhtMTogbnVtYmVyW11bXSwgbTI6IG51bWJlcltdW10pIHtcbiAgICBjb25zdCByZXN1bHQ6IG51bWJlcltdW10gPSBbXTtcbiAgICBmb3IgKGxldCBpID0gMCwgbGVuID0gbTEubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgcmVzdWx0W2ldID0gW107XG4gICAgICAgIGZvciAobGV0IGogPSAwLCBsZW4yID0gbTJbMF0ubGVuZ3RoOyBqIDwgbGVuMjsgaisrKSB7XG4gICAgICAgICAgICBsZXQgc3VtID0gMDtcbiAgICAgICAgICAgIGZvciAobGV0IGsgPSAwLCBsZW4zID0gbTFbMF0ubGVuZ3RoOyBrIDwgbGVuMzsgaysrKSB7XG4gICAgICAgICAgICAgICAgc3VtICs9IG0xW2ldW2tdICogbTJba11bal07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXN1bHRbaV1bal0gPSBzdW07XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbn1cbiIsImltcG9ydCB7bX0gZnJvbSAnbWFsZXZpYyc7XG5pbXBvcnQge2dldENvbnRleHR9IGZyb20gJ21hbGV2aWMvZG9tJztcbmltcG9ydCB7cmdiVG9IU0wsIHBhcnNlLCBoc2xUb1N0cmluZywgcmdiVG9IZXhTdHJpbmcsIFJHQkF9IGZyb20gJy4uLy4uLy4uL3V0aWxzL2NvbG9yJztcbmltcG9ydCB7Y2xhbXAsIHNjYWxlfSBmcm9tICcuLi8uLi8uLi91dGlscy9tYXRoJztcbmltcG9ydCB7Y3JlYXRlU3dpcGVIYW5kbGVyfSBmcm9tICcuLi8uLi91dGlscyc7XG5cbmludGVyZmFjZSBIU0Ige1xuICAgIGg6IG51bWJlcjtcbiAgICBzOiBudW1iZXI7XG4gICAgYjogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgSFNCUGlja2VyUHJvcHMge1xuICAgIGNvbG9yOiBzdHJpbmc7XG4gICAgb25DaGFuZ2U6IChjb2xvcjogc3RyaW5nKSA9PiB2b2lkO1xuICAgIG9uQ29sb3JQcmV2aWV3OiAoY29sb3I6IHN0cmluZykgPT4gdm9pZDtcbn1cblxuaW50ZXJmYWNlIEhTQlBpY2tlclN0YXRlIHtcbiAgICBhY3RpdmVIU0I6IEhTQjtcbiAgICBhY3RpdmVDaGFuZ2VIYW5kbGVyOiAoY29sb3I6IHN0cmluZykgPT4gdm9pZDtcbiAgICBodWVUb3VjaFN0YXJ0SGFuZGxlcjogKGU6IFRvdWNoRXZlbnQpID0+IHZvaWQ7XG4gICAgc2JUb3VjaFN0YXJ0SGFuZGxlcjogKGU6IFRvdWNoRXZlbnQpID0+IHZvaWQ7XG59XG5cbmZ1bmN0aW9uIHJnYlRvSFNCKHtyLCBnLCBifTogUkdCQSkge1xuICAgIGNvbnN0IG1pbiA9IE1hdGgubWluKHIsIGcsIGIpO1xuICAgIGNvbnN0IG1heCA9IE1hdGgubWF4KHIsIGcsIGIpO1xuICAgIHJldHVybiB7XG4gICAgICAgIGg6IHJnYlRvSFNMKHtyLCBnLCBifSkuaCxcbiAgICAgICAgczogbWF4ID09PSAwID8gMCA6ICgxIC0gKG1pbiAvIG1heCkpLFxuICAgICAgICBiOiBtYXggLyAyNTUsXG4gICAgfTtcbn1cblxuZnVuY3Rpb24gaHNiVG9SR0Ioe2g6IGh1ZSwgczogc2F0LCBiOiBicn06IEhTQik6IFJHQkEge1xuICAgIGxldCBjOiBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl07XG4gICAgaWYgKGh1ZSA8IDYwKSB7XG4gICAgICAgIGMgPSBbMSwgaHVlIC8gNjAsIDBdO1xuICAgIH0gZWxzZSBpZiAoaHVlIDwgMTIwKSB7XG4gICAgICAgIGMgPSBbKDEyMCAtIGh1ZSkgLyA2MCwgMSwgMF07XG4gICAgfSBlbHNlIGlmIChodWUgPCAxODApIHtcbiAgICAgICAgYyA9IFswLCAxLCAoaHVlIC0gMTIwKSAvIDYwXTtcbiAgICB9IGVsc2UgaWYgKGh1ZSA8IDI0MCkge1xuICAgICAgICBjID0gWzAsICgyNDAgLSBodWUpIC8gNjAsIDFdO1xuICAgIH0gZWxzZSBpZiAoaHVlIDwgMzAwKSB7XG4gICAgICAgIGMgPSBbKGh1ZSAtIDI0MCkgLyA2MCwgMCwgMV07XG4gICAgfSBlbHNlIHtcbiAgICAgICAgYyA9IFsxLCAwLCAoMzYwIC0gaHVlKSAvIDYwXTtcbiAgICB9XG5cbiAgICBjb25zdCBtYXggPSBNYXRoLm1heCguLi5jKTtcbiAgICBjb25zdCBbciwgZywgYl0gPSBjXG4gICAgICAgIC5tYXAoKHYpID0+IHYgKyAobWF4IC0gdikgKiAoMSAtIHNhdCkpXG4gICAgICAgIC5tYXAoKHYpID0+IHYgKiBicilcbiAgICAgICAgLm1hcCgodikgPT4gTWF0aC5yb3VuZCh2ICogMjU1KSk7XG5cbiAgICByZXR1cm4ge3IsIGcsIGIsIGE6IDF9O1xufVxuXG5mdW5jdGlvbiBoc2JUb1N0cmluZyhoc2I6IEhTQikge1xuICAgIGNvbnN0IHJnYiA9IGhzYlRvUkdCKGhzYik7XG4gICAgcmV0dXJuIHJnYlRvSGV4U3RyaW5nKHJnYik7XG59XG5cbmZ1bmN0aW9uIHJlbmRlcihjYW52YXM6IEhUTUxDYW52YXNFbGVtZW50LCBnZXRQaXhlbDogKHgsIHkpID0+IFVpbnQ4Q2xhbXBlZEFycmF5KSB7XG4gICAgY29uc3Qge3dpZHRoLCBoZWlnaHR9ID0gY2FudmFzO1xuICAgIGNvbnN0IGNvbnRleHQgPSBjYW52YXMuZ2V0Q29udGV4dCgnMmQnKTtcbiAgICBjb25zdCBpbWFnZURhdGEgPSBjb250ZXh0LmdldEltYWdlRGF0YSgwLCAwLCB3aWR0aCwgaGVpZ2h0KTtcbiAgICBjb25zdCBkID0gaW1hZ2VEYXRhLmRhdGE7XG4gICAgZm9yIChsZXQgeSA9IDA7IHkgPCBoZWlnaHQ7IHkrKykge1xuICAgICAgICBmb3IgKGxldCB4ID0gMDsgeCA8IHdpZHRoOyB4KyspIHtcbiAgICAgICAgICAgIGNvbnN0IGkgPSA0ICogKHkgKiB3aWR0aCArIHgpO1xuICAgICAgICAgICAgY29uc3QgYyA9IGdldFBpeGVsKHgsIHkpO1xuICAgICAgICAgICAgZm9yIChsZXQgaiA9IDA7IGogPCA0OyBqKyspIHtcbiAgICAgICAgICAgICAgICBkW2kgKyBqXSA9IGNbal07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgY29udGV4dC5wdXRJbWFnZURhdGEoaW1hZ2VEYXRhLCAwLCAwKTtcbn1cblxuZnVuY3Rpb24gcmVuZGVySHVlKGNhbnZhczogSFRNTENhbnZhc0VsZW1lbnQpIHtcbiAgICBjb25zdCB7aGVpZ2h0fSA9IGNhbnZhcztcbiAgICByZW5kZXIoY2FudmFzLCAoXywgeSkgPT4ge1xuICAgICAgICBjb25zdCBodWUgPSBzY2FsZSh5LCAwLCBoZWlnaHQsIDAsIDM2MCk7XG4gICAgICAgIGNvbnN0IHtyLCBnLCBifSA9IGhzYlRvUkdCKHtoOiBodWUsIHM6IDEsIGI6IDF9KTtcbiAgICAgICAgcmV0dXJuIG5ldyBVaW50OENsYW1wZWRBcnJheShbciwgZywgYiwgMjU1XSk7XG4gICAgfSk7XG59XG5cbmZ1bmN0aW9uIHJlbmRlclNCKGh1ZTogbnVtYmVyLCBjYW52YXM6IEhUTUxDYW52YXNFbGVtZW50KSB7XG4gICAgY29uc3Qge3dpZHRoLCBoZWlnaHR9ID0gY2FudmFzO1xuICAgIHJlbmRlcihjYW52YXMsICh4LCB5KSA9PiB7XG4gICAgICAgIGNvbnN0IHNhdCA9IHNjYWxlKHgsIDAsIHdpZHRoIC0gMSwgMCwgMSk7XG4gICAgICAgIGNvbnN0IGJyID0gc2NhbGUoeSwgMCwgaGVpZ2h0IC0gMSwgMSwgMCk7XG4gICAgICAgIGNvbnN0IHtyLCBnLCBifSA9IGhzYlRvUkdCKHtoOiBodWUsIHM6IHNhdCwgYjogYnJ9KTtcbiAgICAgICAgcmV0dXJuIG5ldyBVaW50OENsYW1wZWRBcnJheShbciwgZywgYiwgMjU1XSk7XG4gICAgfSk7XG59XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIEhTQlBpY2tlcihwcm9wczogSFNCUGlja2VyUHJvcHMpIHtcbiAgICBjb25zdCBjb250ZXh0ID0gZ2V0Q29udGV4dCgpO1xuICAgIGNvbnN0IHN0b3JlID0gY29udGV4dC5zdG9yZSBhcyBIU0JQaWNrZXJTdGF0ZTtcbiAgICBzdG9yZS5hY3RpdmVDaGFuZ2VIYW5kbGVyID0gcHJvcHMub25DaGFuZ2U7XG5cbiAgICBjb25zdCBwcmV2Q29sb3IgPSBjb250ZXh0LnByZXYgJiYgY29udGV4dC5wcmV2LnByb3BzLmNvbG9yO1xuICAgIGNvbnN0IHByZXZBY3RpdmVDb2xvciA9IHN0b3JlLmFjdGl2ZUhTQiA/IGhzYlRvU3RyaW5nKHN0b3JlLmFjdGl2ZUhTQikgOiBudWxsO1xuICAgIGNvbnN0IGRpZENvbG9yQ2hhbmdlID0gcHJvcHMuY29sb3IgIT09IHByZXZDb2xvciAmJiBwcm9wcy5jb2xvciAhPT0gcHJldkFjdGl2ZUNvbG9yO1xuICAgIGxldCBhY3RpdmVIU0I6IEhTQjtcbiAgICBpZiAoZGlkQ29sb3JDaGFuZ2UpIHtcbiAgICAgICAgY29uc3QgcmdiID0gcGFyc2UocHJvcHMuY29sb3IpO1xuICAgICAgICBhY3RpdmVIU0IgPSByZ2JUb0hTQihyZ2IpO1xuICAgICAgICBzdG9yZS5hY3RpdmVIU0IgPSBhY3RpdmVIU0I7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgYWN0aXZlSFNCID0gc3RvcmUuYWN0aXZlSFNCO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIG9uU0JDYW52YXNSZW5kZXIoY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudCkge1xuICAgICAgICBjb25zdCBodWUgPSBhY3RpdmVIU0IuaDtcbiAgICAgICAgY29uc3QgcHJldkh1ZSA9IHByZXZDb2xvciAmJiByZ2JUb0hTQihwYXJzZShwcmV2Q29sb3IpKS5oO1xuICAgICAgICBpZiAoaHVlID09PSBwcmV2SHVlKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgcmVuZGVyU0IoaHVlLCBjYW52YXMpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIG9uSHVlQ2FudmFzQ3JlYXRlKGNhbnZhczogSFRNTENhbnZhc0VsZW1lbnQpIHtcbiAgICAgICAgcmVuZGVySHVlKGNhbnZhcyk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gY3JlYXRlSFNCU3dpcGVIYW5kbGVyKGdldEV2ZW50SFNCOiAoZToge2NsaWVudFg6IG51bWJlcjsgY2xpZW50WTogbnVtYmVyOyByZWN0OiBDbGllbnRSZWN0fSkgPT4gSFNCKSB7XG4gICAgICAgIHJldHVybiBjcmVhdGVTd2lwZUhhbmRsZXIoKHN0YXJ0RXZ0LCBzdGFydE5hdGl2ZUV2dCkgPT4ge1xuICAgICAgICAgICAgdHlwZSBTd2lwZUV2ZW50ID0gdHlwZW9mIHN0YXJ0RXZ0O1xuXG4gICAgICAgICAgICBjb25zdCByZWN0ID0gKHN0YXJ0TmF0aXZlRXZ0LmN1cnJlbnRUYXJnZXQgYXMgSFRNTEVsZW1lbnQpLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXG4gICAgICAgICAgICBmdW5jdGlvbiBvblBvaW50ZXJNb3ZlKGU6IFN3aXBlRXZlbnQpIHtcbiAgICAgICAgICAgICAgICBzdG9yZS5hY3RpdmVIU0IgPSBnZXRFdmVudEhTQih7Li4uZSwgcmVjdH0pO1xuICAgICAgICAgICAgICAgIHByb3BzLm9uQ29sb3JQcmV2aWV3KGhzYlRvU3RyaW5nKHN0b3JlLmFjdGl2ZUhTQikpO1xuICAgICAgICAgICAgICAgIGNvbnRleHQucmVmcmVzaCgpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmdW5jdGlvbiBvblBvaW50ZXJVcChlOiBTd2lwZUV2ZW50KSB7XG4gICAgICAgICAgICAgICAgY29uc3QgaHNiID0gZ2V0RXZlbnRIU0Ioey4uLmUsIHJlY3R9KTtcbiAgICAgICAgICAgICAgICBzdG9yZS5hY3RpdmVIU0IgPSBoc2I7XG4gICAgICAgICAgICAgICAgcHJvcHMub25DaGFuZ2UoaHNiVG9TdHJpbmcoaHNiKSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHN0b3JlLmFjdGl2ZUhTQiA9IGdldEV2ZW50SFNCKHsuLi5zdGFydEV2dCwgcmVjdH0pO1xuICAgICAgICAgICAgY29udGV4dC5yZWZyZXNoKCk7XG5cbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgbW92ZTogb25Qb2ludGVyTW92ZSxcbiAgICAgICAgICAgICAgICB1cDogb25Qb2ludGVyVXAsXG4gICAgICAgICAgICB9O1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBjb25zdCBvblNCUG9pbnRlckRvd24gPSBjcmVhdGVIU0JTd2lwZUhhbmRsZXIoKHtjbGllbnRYLCBjbGllbnRZLCByZWN0fSkgPT4ge1xuICAgICAgICBjb25zdCBzYXQgPSBjbGFtcCgoY2xpZW50WCAtIHJlY3QubGVmdCkgLyByZWN0LndpZHRoLCAwLCAxKTtcbiAgICAgICAgY29uc3QgYnIgPSBjbGFtcCgxIC0gKGNsaWVudFkgLSByZWN0LnRvcCkgLyByZWN0LmhlaWdodCwgMCwgMSk7XG4gICAgICAgIHJldHVybiB7Li4uYWN0aXZlSFNCLCBzOiBzYXQsIGI6IGJyfTtcbiAgICB9KTtcblxuICAgIGNvbnN0IG9uSHVlUG9pbnRlckRvd24gPSBjcmVhdGVIU0JTd2lwZUhhbmRsZXIoKHtjbGllbnRZLCByZWN0fSkgPT4ge1xuICAgICAgICBjb25zdCBodWUgPSBjbGFtcCgoY2xpZW50WSAtIHJlY3QudG9wKSAvIHJlY3QuaGVpZ2h0LCAwLCAxKSAqIDM2MDtcbiAgICAgICAgcmV0dXJuIHsuLi5hY3RpdmVIU0IsIGg6IGh1ZX07XG4gICAgfSk7XG5cbiAgICBjb25zdCBodWVDdXJzb3JTdHlsZSA9IHtcbiAgICAgICAgJ2JhY2tncm91bmQtY29sb3InOiBoc2xUb1N0cmluZyh7aDogYWN0aXZlSFNCLmgsIHM6IDEsIGw6IDAuNSwgYTogMX0pLFxuICAgICAgICAnbGVmdCc6ICcwJScsXG4gICAgICAgICd0b3AnOiBgJHthY3RpdmVIU0IuaCAvIDM2MCAqIDEwMH0lYCxcbiAgICB9O1xuICAgIGNvbnN0IHNiQ3Vyc29yU3R5bGUgPSB7XG4gICAgICAgICdiYWNrZ3JvdW5kLWNvbG9yJzogcmdiVG9IZXhTdHJpbmcoaHNiVG9SR0IoYWN0aXZlSFNCKSksXG4gICAgICAgICdsZWZ0JzogYCR7YWN0aXZlSFNCLnMgKiAxMDB9JWAsXG4gICAgICAgICd0b3AnOiBgJHsoMSAtIGFjdGl2ZUhTQi5iKSAqIDEwMH0lYCxcbiAgICB9O1xuXG4gICAgcmV0dXJuIChcbiAgICAgICAgPHNwYW4gY2xhc3M9XCJoc2ItcGlja2VyXCI+XG4gICAgICAgICAgICA8c3BhblxuICAgICAgICAgICAgICAgIGNsYXNzPVwiaHNiLXBpY2tlcl9fc2ItY29udGFpbmVyXCJcbiAgICAgICAgICAgICAgICBvbm1vdXNlZG93bj17b25TQlBvaW50ZXJEb3dufVxuICAgICAgICAgICAgICAgIG9udXBkYXRlPXsoZWw6IEhUTUxFbGVtZW50KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChzdG9yZS5zYlRvdWNoU3RhcnRIYW5kbGVyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBlbC5yZW1vdmVFdmVudExpc3RlbmVyKCd0b3VjaHN0YXJ0Jywgc3RvcmUuc2JUb3VjaFN0YXJ0SGFuZGxlcik7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWwuYWRkRXZlbnRMaXN0ZW5lcigndG91Y2hzdGFydCcsIG9uU0JQb2ludGVyRG93biwge3Bhc3NpdmU6IHRydWV9KTtcbiAgICAgICAgICAgICAgICAgICAgc3RvcmUuc2JUb3VjaFN0YXJ0SGFuZGxlciA9IG9uU0JQb2ludGVyRG93bjtcbiAgICAgICAgICAgICAgICB9fVxuICAgICAgICAgICAgPlxuICAgICAgICAgICAgICAgIDxjYW52YXMgY2xhc3M9XCJoc2ItcGlja2VyX19zYi1jYW52YXNcIiBvbnJlbmRlcj17b25TQkNhbnZhc1JlbmRlcn0gLz5cbiAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz1cImhzYi1waWNrZXJfX3NiLWN1cnNvclwiIHN0eWxlPXtzYkN1cnNvclN0eWxlfT48L3NwYW4+XG4gICAgICAgICAgICA8L3NwYW4+XG4gICAgICAgICAgICA8c3BhblxuICAgICAgICAgICAgICAgIGNsYXNzPVwiaHNiLXBpY2tlcl9faHVlLWNvbnRhaW5lclwiXG4gICAgICAgICAgICAgICAgb25tb3VzZWRvd249e29uSHVlUG9pbnRlckRvd259XG4gICAgICAgICAgICAgICAgb251cGRhdGU9eyhlbDogSFRNTEVsZW1lbnQpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHN0b3JlLmh1ZVRvdWNoU3RhcnRIYW5kbGVyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBlbC5yZW1vdmVFdmVudExpc3RlbmVyKCd0b3VjaHN0YXJ0Jywgc3RvcmUuaHVlVG91Y2hTdGFydEhhbmRsZXIpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGVsLmFkZEV2ZW50TGlzdGVuZXIoJ3RvdWNoc3RhcnQnLCBvbkh1ZVBvaW50ZXJEb3duLCB7cGFzc2l2ZTogdHJ1ZX0pO1xuICAgICAgICAgICAgICAgICAgICBzdG9yZS5odWVUb3VjaFN0YXJ0SGFuZGxlciA9IG9uSHVlUG9pbnRlckRvd247XG4gICAgICAgICAgICAgICAgfX1cbiAgICAgICAgICAgID5cbiAgICAgICAgICAgICAgICA8Y2FudmFzIGNsYXNzPVwiaHNiLXBpY2tlcl9faHVlLWNhbnZhc1wiIG9uY3JlYXRlPXtvbkh1ZUNhbnZhc0NyZWF0ZX0gLz5cbiAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz1cImhzYi1waWNrZXJfX2h1ZS1jdXJzb3JcIiBzdHlsZT17aHVlQ3Vyc29yU3R5bGV9Pjwvc3Bhbj5cbiAgICAgICAgICAgIDwvc3Bhbj5cbiAgICAgICAgPC9zcGFuPlxuICAgICk7XG59XG4iLCJpbXBvcnQge219IGZyb20gJ21hbGV2aWMnO1xuaW1wb3J0IHtnZXRDb250ZXh0fSBmcm9tICdtYWxldmljL2RvbSc7XG5pbXBvcnQge3BhcnNlfSBmcm9tICcuLi8uLi8uLi91dGlscy9jb2xvcic7XG5pbXBvcnQgVGV4dEJveCBmcm9tICcuLi90ZXh0Ym94JztcbmltcG9ydCBIU0JQaWNrZXIgZnJvbSAnLi9oc2ItcGlja2VyJztcblxuaW50ZXJmYWNlIENvbG9yUGlja2VyUHJvcHMge1xuICAgIGNsYXNzPzogYW55O1xuICAgIGNvbG9yOiBzdHJpbmc7XG4gICAgb25DaGFuZ2U6IChjb2xvcjogc3RyaW5nKSA9PiB2b2lkO1xuICAgIGNhblJlc2V0OiBib29sZWFuO1xuICAgIG9uUmVzZXQ6ICgpID0+IHZvaWQ7XG59XG5cbmZ1bmN0aW9uIGlzVmFsaWRDb2xvcihjb2xvcjogc3RyaW5nKSB7XG4gICAgdHJ5IHtcbiAgICAgICAgcGFyc2UoY29sb3IpO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbn1cblxuY29uc3QgY29sb3JQaWNrZXJGb2N1c2VzID0gbmV3IFdlYWtNYXA8Tm9kZSwgKCkgPT4gdm9pZD4oKTtcblxuZnVuY3Rpb24gZm9jdXNDb2xvclBpY2tlcihub2RlOiBOb2RlKSB7XG4gICAgY29uc3QgZm9jdXMgPSBjb2xvclBpY2tlckZvY3VzZXMuZ2V0KG5vZGUpO1xuICAgIGZvY3VzKCk7XG59XG5cbmZ1bmN0aW9uIENvbG9yUGlja2VyKHByb3BzOiBDb2xvclBpY2tlclByb3BzKSB7XG4gICAgY29uc3QgY29udGV4dCA9IGdldENvbnRleHQoKTtcbiAgICBjb250ZXh0Lm9uUmVuZGVyKChub2RlKSA9PiBjb2xvclBpY2tlckZvY3VzZXMuc2V0KG5vZGUsIGZvY3VzKSk7XG4gICAgY29uc3Qgc3RvcmUgPSBjb250ZXh0LnN0b3JlIGFzIHtpc0ZvY3VzZWQ6IGJvb2xlYW47IHRleHRCb3hOb2RlOiBIVE1MSW5wdXRFbGVtZW50OyBwcmV2aWV3Tm9kZTogSFRNTEVsZW1lbnR9O1xuXG4gICAgY29uc3QgaXNDb2xvclZhbGlkID0gaXNWYWxpZENvbG9yKHByb3BzLmNvbG9yKTtcblxuICAgIGZ1bmN0aW9uIG9uQ29sb3JQcmV2aWV3KHByZXZpZXdDb2xvcjogc3RyaW5nKSB7XG4gICAgICAgIHN0b3JlLnByZXZpZXdOb2RlLnN0eWxlLmJhY2tncm91bmRDb2xvciA9IHByZXZpZXdDb2xvcjtcbiAgICAgICAgc3RvcmUudGV4dEJveE5vZGUudmFsdWUgPSBwcmV2aWV3Q29sb3I7XG4gICAgICAgIHN0b3JlLnRleHRCb3hOb2RlLmJsdXIoKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBvbkNvbG9yQ2hhbmdlKHJhd1ZhbHVlOiBzdHJpbmcpIHtcbiAgICAgICAgY29uc3QgdmFsdWUgPSByYXdWYWx1ZS50cmltKCk7XG4gICAgICAgIGlmIChpc1ZhbGlkQ29sb3IodmFsdWUpKSB7XG4gICAgICAgICAgICBwcm9wcy5vbkNoYW5nZSh2YWx1ZSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwcm9wcy5vbkNoYW5nZShwcm9wcy5jb2xvcik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBmb2N1cygpIHtcbiAgICAgICAgaWYgKHN0b3JlLmlzRm9jdXNlZCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHN0b3JlLmlzRm9jdXNlZCA9IHRydWU7XG4gICAgICAgIGNvbnRleHQucmVmcmVzaCgpO1xuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vkb3duJywgb25PdXRlckNsaWNrKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBibHVyKCkge1xuICAgICAgICBpZiAoIXN0b3JlLmlzRm9jdXNlZCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdtb3VzZWRvd24nLCBvbk91dGVyQ2xpY2spO1xuICAgICAgICBzdG9yZS5pc0ZvY3VzZWQgPSBmYWxzZTtcbiAgICAgICAgY29udGV4dC5yZWZyZXNoKCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gdG9nZ2xlRm9jdXMoKSB7XG4gICAgICAgIGlmIChzdG9yZS5pc0ZvY3VzZWQpIHtcbiAgICAgICAgICAgIGJsdXIoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGZvY3VzKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBvbk91dGVyQ2xpY2soZTogTW91c2VFdmVudCkge1xuICAgICAgICBpZiAoIWUuY29tcG9zZWRQYXRoKCkuc29tZSgoZWwpID0+IGVsID09PSBjb250ZXh0Lm5vZGUpKSB7XG4gICAgICAgICAgICBibHVyKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCB0ZXh0Qm94ID0gKFxuICAgICAgICA8VGV4dEJveFxuICAgICAgICAgICAgY2xhc3M9XCJjb2xvci1waWNrZXJfX2lucHV0XCJcbiAgICAgICAgICAgIG9ucmVuZGVyPXsoZWwpID0+IHtcbiAgICAgICAgICAgICAgICBzdG9yZS50ZXh0Qm94Tm9kZSA9IGVsIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG4gICAgICAgICAgICAgICAgc3RvcmUudGV4dEJveE5vZGUudmFsdWUgPSBpc0NvbG9yVmFsaWQgPyBwcm9wcy5jb2xvciA6ICcnO1xuICAgICAgICAgICAgfX1cbiAgICAgICAgICAgIG9ua2V5cHJlc3M9eyhlKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgaW5wdXQgPSBlLnRhcmdldCBhcyBIVE1MSW5wdXRFbGVtZW50O1xuICAgICAgICAgICAgICAgIGlmIChlLmtleSA9PT0gJ0VudGVyJykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB7dmFsdWV9ID0gaW5wdXQ7XG4gICAgICAgICAgICAgICAgICAgIG9uQ29sb3JDaGFuZ2UodmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICBibHVyKCk7XG4gICAgICAgICAgICAgICAgICAgIG9uQ29sb3JQcmV2aWV3KHZhbHVlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9fVxuICAgICAgICAgICAgb25mb2N1cz17Zm9jdXN9XG4gICAgICAgIC8+XG4gICAgKTtcblxuICAgIGNvbnN0IHByZXZpZXdFbGVtZW50ID0gKFxuICAgICAgICA8c3BhblxuICAgICAgICAgICAgY2xhc3M9XCJjb2xvci1waWNrZXJfX3ByZXZpZXdcIlxuICAgICAgICAgICAgb25jbGljaz17dG9nZ2xlRm9jdXN9XG4gICAgICAgICAgICBvbnJlbmRlcj17KGVsOiBIVE1MRWxlbWVudCkgPT4ge1xuICAgICAgICAgICAgICAgIHN0b3JlLnByZXZpZXdOb2RlID0gZWw7XG4gICAgICAgICAgICAgICAgZWwuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gaXNDb2xvclZhbGlkID8gcHJvcHMuY29sb3IgOiAndHJhbnNwYXJlbnQnO1xuICAgICAgICAgICAgfX1cbiAgICAgICAgPjwvc3Bhbj5cbiAgICApO1xuXG4gICAgY29uc3QgcmVzZXRCdXR0b24gPSBwcm9wcy5jYW5SZXNldCA/IChcbiAgICAgICAgPHNwYW5cbiAgICAgICAgICAgIHJvbGU9XCJidXR0b25cIlxuICAgICAgICAgICAgY2xhc3M9XCJjb2xvci1waWNrZXJfX3Jlc2V0XCJcbiAgICAgICAgICAgIG9uY2xpY2s9eygpID0+IHtcbiAgICAgICAgICAgICAgICBwcm9wcy5vblJlc2V0KCk7XG4gICAgICAgICAgICAgICAgYmx1cigpO1xuICAgICAgICAgICAgfX1cbiAgICAgICAgPjwvc3Bhbj5cbiAgICApIDogbnVsbDtcblxuICAgIGNvbnN0IHRleHRCb3hMaW5lID0gKFxuICAgICAgICA8c3BhbiBjbGFzcz1cImNvbG9yLXBpY2tlcl9fdGV4dGJveC1saW5lXCI+XG4gICAgICAgICAgICB7dGV4dEJveH1cbiAgICAgICAgICAgIHtwcmV2aWV3RWxlbWVudH1cbiAgICAgICAgICAgIHtyZXNldEJ1dHRvbn1cbiAgICAgICAgPC9zcGFuPlxuICAgICk7XG5cbiAgICBjb25zdCBoc2JMaW5lID0gaXNDb2xvclZhbGlkID8gKFxuICAgICAgICA8c3BhbiBjbGFzcz1cImNvbG9yLXBpY2tlcl9faHNiLWxpbmVcIj5cbiAgICAgICAgICAgIDxIU0JQaWNrZXJcbiAgICAgICAgICAgICAgICBjb2xvcj17cHJvcHMuY29sb3J9XG4gICAgICAgICAgICAgICAgb25DaGFuZ2U9e29uQ29sb3JDaGFuZ2V9XG4gICAgICAgICAgICAgICAgb25Db2xvclByZXZpZXc9e29uQ29sb3JQcmV2aWV3fVxuICAgICAgICAgICAgLz5cbiAgICAgICAgPC9zcGFuPlxuICAgICkgOiBudWxsO1xuXG4gICAgcmV0dXJuIChcbiAgICAgICAgPHNwYW4gY2xhc3M9e1snY29sb3ItcGlja2VyJywgc3RvcmUuaXNGb2N1c2VkICYmICdjb2xvci1waWNrZXItLWZvY3VzZWQnLCBwcm9wcy5jbGFzc119PlxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJjb2xvci1waWNrZXJfX3dyYXBwZXJcIj5cbiAgICAgICAgICAgICAgICB7dGV4dEJveExpbmV9XG4gICAgICAgICAgICAgICAge2hzYkxpbmV9XG4gICAgICAgICAgICA8L3NwYW4+XG4gICAgICAgIDwvc3Bhbj5cbiAgICApO1xufVxuXG5leHBvcnQgZGVmYXVsdCBPYmplY3QuYXNzaWduKENvbG9yUGlja2VyLCB7Zm9jdXM6IGZvY3VzQ29sb3JQaWNrZXJ9KTtcbiIsImltcG9ydCB7bX0gZnJvbSAnbWFsZXZpYyc7XG5pbXBvcnQge2dldENvbnRleHR9IGZyb20gJ21hbGV2aWMvZG9tJztcblxudHlwZSBEcm9wRG93bk9wdGlvbjxUPiA9IHtpZDogVDsgY29udGVudDogTWFsZXZpYy5DaGlsZH07XG5cbmludGVyZmFjZSBEcm9wRG93blByb3BzPFQ+IHtcbiAgICBjbGFzcz86IHN0cmluZztcbiAgICBzZWxlY3RlZDogVDtcbiAgICBvcHRpb25zOiBEcm9wRG93bk9wdGlvbjxUPltdO1xuICAgIG9uQ2hhbmdlOiAodmFsdWU6IFQpID0+IHZvaWQ7XG59XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIERyb3BEb3duPFQ+KHByb3BzOiBEcm9wRG93blByb3BzPFQ+KSB7XG4gICAgY29uc3QgY29udGV4dCA9IGdldENvbnRleHQoKTtcbiAgICBjb25zdCBzdG9yZSA9IGNvbnRleHQuc3RvcmUgYXMge1xuICAgICAgICBpc09wZW46IGJvb2xlYW47XG4gICAgICAgIGxpc3ROb2RlOiBIVE1MRWxlbWVudDtcbiAgICAgICAgc2VsZWN0ZWROb2RlOiBIVE1MRWxlbWVudDtcbiAgICB9O1xuXG4gICAgaWYgKGNvbnRleHQucHJldikge1xuICAgICAgICBjb25zdCBjdXJyT3B0aW9ucyA9IHByb3BzLm9wdGlvbnMubWFwKChvKSA9PiBvLmlkKTtcbiAgICAgICAgY29uc3QgcHJldk9wdGlvbnMgPSAoY29udGV4dC5wcmV2LnByb3BzLm9wdGlvbnMgYXMgRHJvcERvd25PcHRpb248VD5bXSkubWFwKChvKSA9PiBvLmlkKTtcbiAgICAgICAgaWYgKGN1cnJPcHRpb25zLmxlbmd0aCAhPT0gcHJldk9wdGlvbnMubGVuZ3RoIHx8IGN1cnJPcHRpb25zLnNvbWUoKG8sIGkpID0+IG8gIT09IHByZXZPcHRpb25zW2ldKSkge1xuICAgICAgICAgICAgc3RvcmUuaXNPcGVuID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzYXZlTGlzdE5vZGUoZWw6IEhUTUxFbGVtZW50KSB7XG4gICAgICAgIHN0b3JlLmxpc3ROb2RlID0gZWw7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc2F2ZVNlbGVjdGVkTm9kZShlbDogSFRNTEVsZW1lbnQpIHtcbiAgICAgICAgc3RvcmUuc2VsZWN0ZWROb2RlID0gZWw7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gb25TZWxlY3RlZENsaWNrKCkge1xuICAgICAgICBzdG9yZS5pc09wZW4gPSAhc3RvcmUuaXNPcGVuO1xuICAgICAgICBjb250ZXh0LnJlZnJlc2goKTtcblxuICAgICAgICBpZiAoc3RvcmUuaXNPcGVuKSB7XG4gICAgICAgICAgICBjb25zdCBvbk91dGVyQ2xpY2sgPSAoZTogTW91c2VFdmVudCkgPT4ge1xuICAgICAgICAgICAgICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdtb3VzZWRvd24nLCBvbk91dGVyQ2xpY2ssIGZhbHNlKTtcblxuICAgICAgICAgICAgICAgIGNvbnN0IGxpc3RSZWN0ID0gc3RvcmUubGlzdE5vZGUuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgICAgICAgICAgICAgY29uc3QgZXggPSBlLmNsaWVudFg7XG4gICAgICAgICAgICAgICAgY29uc3QgZXkgPSBlLmNsaWVudFk7XG4gICAgICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAgICAgICBleCA8IGxpc3RSZWN0LmxlZnQgfHxcbiAgICAgICAgICAgICAgICAgICAgZXggPiBsaXN0UmVjdC5yaWdodCB8fFxuICAgICAgICAgICAgICAgICAgICBleSA8IGxpc3RSZWN0LnRvcCB8fFxuICAgICAgICAgICAgICAgICAgICBleSA+IGxpc3RSZWN0LmJvdHRvbVxuICAgICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgICAgICBzdG9yZS5pc09wZW4gPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgY29udGV4dC5yZWZyZXNoKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWRvd24nLCBvbk91dGVyQ2xpY2ssIGZhbHNlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNyZWF0ZUxpc3RJdGVtKHZhbHVlOiBEcm9wRG93bk9wdGlvbjxUPikge1xuICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgPHNwYW5cbiAgICAgICAgICAgICAgICBjbGFzcz17e1xuICAgICAgICAgICAgICAgICAgICAnZHJvcGRvd25fX2xpc3RfX2l0ZW0nOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAnZHJvcGRvd25fX2xpc3RfX2l0ZW0tLXNlbGVjdGVkJzogdmFsdWUuaWQgPT09IHByb3BzLnNlbGVjdGVkLFxuICAgICAgICAgICAgICAgICAgICBbcHJvcHMuY2xhc3NdOiBwcm9wcy5jbGFzcyAhPSBudWxsLFxuICAgICAgICAgICAgICAgIH19XG4gICAgICAgICAgICAgICAgb25jbGljaz17KCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBzdG9yZS5pc09wZW4gPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgY29udGV4dC5yZWZyZXNoKCk7XG4gICAgICAgICAgICAgICAgICAgIHByb3BzLm9uQ2hhbmdlKHZhbHVlLmlkKTtcbiAgICAgICAgICAgICAgICB9fVxuICAgICAgICAgICAgPlxuICAgICAgICAgICAgICAgIHt2YWx1ZS5jb250ZW50fVxuICAgICAgICAgICAgPC9zcGFuPlxuICAgICAgICApO1xuICAgIH1cblxuICAgIGNvbnN0IHNlbGVjdGVkQ29udGVudCA9IHByb3BzLm9wdGlvbnMuZmluZCgodmFsdWUpID0+IHZhbHVlLmlkID09PSBwcm9wcy5zZWxlY3RlZCkuY29udGVudDtcblxuICAgIHJldHVybiAoXG4gICAgICAgIDxzcGFuXG4gICAgICAgICAgICBjbGFzcz17e1xuICAgICAgICAgICAgICAgICdkcm9wZG93bic6IHRydWUsXG4gICAgICAgICAgICAgICAgJ2Ryb3Bkb3duLS1vcGVuJzogc3RvcmUuaXNPcGVuLFxuICAgICAgICAgICAgICAgIFtwcm9wcy5jbGFzc106IEJvb2xlYW4ocHJvcHMuY2xhc3MpLFxuICAgICAgICAgICAgfX1cbiAgICAgICAgPlxuICAgICAgICAgICAgPHNwYW5cbiAgICAgICAgICAgICAgICBjbGFzcz1cImRyb3Bkb3duX19saXN0XCJcbiAgICAgICAgICAgICAgICBvbmNyZWF0ZT17c2F2ZUxpc3ROb2RlfVxuICAgICAgICAgICAgPlxuICAgICAgICAgICAgICAgIHtwcm9wcy5vcHRpb25zXG4gICAgICAgICAgICAgICAgICAgIC5zbGljZSgpXG4gICAgICAgICAgICAgICAgICAgIC5zb3J0KChhLCBiKSA9PiBhLmlkID09PSBwcm9wcy5zZWxlY3RlZCA/IC0xIDogYi5pZCA9PT0gcHJvcHMuc2VsZWN0ZWQgPyAxIDogMClcbiAgICAgICAgICAgICAgICAgICAgLm1hcChjcmVhdGVMaXN0SXRlbSl9XG4gICAgICAgICAgICA8L3NwYW4+XG4gICAgICAgICAgICA8c3BhblxuICAgICAgICAgICAgICAgIGNsYXNzPVwiZHJvcGRvd25fX3NlbGVjdGVkXCJcbiAgICAgICAgICAgICAgICBvbmNyZWF0ZT17c2F2ZVNlbGVjdGVkTm9kZX1cbiAgICAgICAgICAgICAgICBvbmNsaWNrPXtvblNlbGVjdGVkQ2xpY2t9XG4gICAgICAgICAgICA+XG4gICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJkcm9wZG93bl9fc2VsZWN0ZWRfX3RleHRcIj5cbiAgICAgICAgICAgICAgICAgICAge3NlbGVjdGVkQ29udGVudH1cbiAgICAgICAgICAgICAgICA8L3NwYW4+XG4gICAgICAgICAgICA8L3NwYW4+XG4gICAgICAgIDwvc3BhbiA+XG4gICAgKTtcbn1cbiIsImltcG9ydCB7bX0gZnJvbSAnbWFsZXZpYyc7XG5pbXBvcnQge2dldENvbnRleHR9IGZyb20gJ21hbGV2aWMvZG9tJztcbmltcG9ydCBDb2xvclBpY2tlciBmcm9tICcuLi9jb2xvci1waWNrZXInO1xuaW1wb3J0IERyb3BEb3duIGZyb20gJy4uL2Ryb3Bkb3duJztcbmltcG9ydCB7cGFyc2V9IGZyb20gJy4uLy4uLy4uL3V0aWxzL2NvbG9yJztcblxuaW50ZXJmYWNlIENvbG9yRHJvcERvd25Qcm9wcyB7XG4gICAgY2xhc3M/OiBzdHJpbmc7XG4gICAgdmFsdWU6IHN0cmluZztcbiAgICBjb2xvclN1Z2dlc3Rpb246IHN0cmluZztcbiAgICBoYXNEZWZhdWx0T3B0aW9uPzogYm9vbGVhbjtcbiAgICBoYXNBdXRvT3B0aW9uPzogYm9vbGVhbjtcbiAgICBvbkNoYW5nZTogKHZhbHVlOiBzdHJpbmcpID0+IHZvaWQ7XG4gICAgb25SZXNldDogKCkgPT4gdm9pZDtcbn1cblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gQ29sb3JEcm9wRG93bihwcm9wczogQ29sb3JEcm9wRG93blByb3BzKSB7XG4gICAgY29uc3QgY29udGV4dCA9IGdldENvbnRleHQoKTtcbiAgICBjb25zdCBzdG9yZSA9IGNvbnRleHQuc3RvcmUgYXMge1xuICAgICAgICBpc09wZW46IGJvb2xlYW47XG4gICAgICAgIGxpc3ROb2RlOiBIVE1MRWxlbWVudDtcbiAgICAgICAgc2VsZWN0ZWROb2RlOiBIVE1MRWxlbWVudDtcbiAgICB9O1xuXG4gICAgY29uc3QgbGFiZWxzID0ge1xuICAgICAgICBERUZBVUxUOiAnRGVmYXVsdCcsXG4gICAgICAgIEFVVE86ICdBdXRvJyxcbiAgICAgICAgQ1VTVE9NOiAnQ3VzdG9tJyxcbiAgICB9O1xuXG4gICAgY29uc3QgZHJvcERvd25PcHRpb25zID0gW1xuICAgICAgICBwcm9wcy5oYXNEZWZhdWx0T3B0aW9uID8ge2lkOiAnZGVmYXVsdCcsIGNvbnRlbnQ6IGxhYmVscy5ERUZBVUxUfSA6IG51bGwsXG4gICAgICAgIHByb3BzLmhhc0F1dG9PcHRpb24gPyB7aWQ6ICdhdXRvJywgY29udGVudDogbGFiZWxzLkFVVE99IDogbnVsbCxcbiAgICAgICAge2lkOiAnY3VzdG9tJywgY29udGVudDogbGFiZWxzLkNVU1RPTX0sXG4gICAgXS5maWx0ZXIoKHYpID0+IHYpO1xuXG4gICAgY29uc3Qgc2VsZWN0ZWREcm9wRG93blZhbHVlID0gKFxuICAgICAgICBwcm9wcy52YWx1ZSA9PT0gJycgPyAnZGVmYXVsdCcgOlxuICAgICAgICAgICAgcHJvcHMudmFsdWUgPT09ICdhdXRvJyA/ICdhdXRvJyA6XG4gICAgICAgICAgICAgICAgJ2N1c3RvbSdcbiAgICApO1xuXG4gICAgZnVuY3Rpb24gb25Ecm9wRG93bkNoYW5nZSh2YWx1ZTogc3RyaW5nKSB7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IHtcbiAgICAgICAgICAgIGRlZmF1bHQ6ICcnLFxuICAgICAgICAgICAgYXV0bzogJ2F1dG8nLFxuICAgICAgICAgICAgY3VzdG9tOiBwcm9wcy5jb2xvclN1Z2dlc3Rpb24sXG4gICAgICAgIH1bdmFsdWVdO1xuICAgICAgICBwcm9wcy5vbkNoYW5nZShyZXN1bHQpO1xuICAgIH1cblxuICAgIGxldCBpc1BpY2tlclZpc2libGU6IGJvb2xlYW47XG5cbiAgICB0cnkge1xuICAgICAgICBwYXJzZShwcm9wcy52YWx1ZSk7XG4gICAgICAgIGlzUGlja2VyVmlzaWJsZSA9IHRydWU7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIGlzUGlja2VyVmlzaWJsZSA9IGZhbHNlO1xuICAgIH1cblxuICAgIGNvbnN0IHByZXZWYWx1ZSA9IGNvbnRleHQucHJldiA/IGNvbnRleHQucHJldi5wcm9wcy52YWx1ZSA6IG51bGw7XG4gICAgY29uc3Qgc2hvdWxkRm9jdXNPblBpY2tlciA9IChcbiAgICAgICAgKHByb3BzLnZhbHVlICE9PSAnJyAmJiBwcm9wcy52YWx1ZSAhPT0gJ2F1dG8nKSAmJlxuICAgICAgICBwcmV2VmFsdWUgIT0gbnVsbCAmJlxuICAgICAgICAocHJldlZhbHVlID09PSAnJyB8fCBwcmV2VmFsdWUgPT09ICdhdXRvJylcbiAgICApO1xuXG4gICAgZnVuY3Rpb24gb25Sb290UmVuZGVyKHJvb3Q6IEVsZW1lbnQpIHtcbiAgICAgICAgaWYgKHNob3VsZEZvY3VzT25QaWNrZXIpIHtcbiAgICAgICAgICAgIGNvbnN0IHBpY2tlck5vZGUgPSByb290LnF1ZXJ5U2VsZWN0b3IoJy5jb2xvci1kcm9wZG93bl9fcGlja2VyJyk7XG4gICAgICAgICAgICBDb2xvclBpY2tlci5mb2N1cyhwaWNrZXJOb2RlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiAoXG4gICAgICAgIDxzcGFuXG4gICAgICAgICAgICBjbGFzcz17e1xuICAgICAgICAgICAgICAgICdjb2xvci1kcm9wZG93bic6IHRydWUsXG4gICAgICAgICAgICAgICAgJ2NvbG9yLWRyb3Bkb3duLS1vcGVuJzogc3RvcmUuaXNPcGVuLFxuICAgICAgICAgICAgICAgIFtwcm9wcy5jbGFzc106IEJvb2xlYW4ocHJvcHMuY2xhc3MpLFxuICAgICAgICAgICAgfX1cbiAgICAgICAgICAgIG9ucmVuZGVyPXtvblJvb3RSZW5kZXJ9XG4gICAgICAgID5cbiAgICAgICAgICAgIDxEcm9wRG93biBjbGFzcz1cImNvbG9yLWRyb3Bkb3duX19vcHRpb25zXCJcbiAgICAgICAgICAgICAgICBvcHRpb25zPXtkcm9wRG93bk9wdGlvbnN9XG4gICAgICAgICAgICAgICAgc2VsZWN0ZWQ9e3NlbGVjdGVkRHJvcERvd25WYWx1ZX1cbiAgICAgICAgICAgICAgICBvbkNoYW5nZT17b25Ecm9wRG93bkNoYW5nZX1cbiAgICAgICAgICAgIC8+XG4gICAgICAgICAgICA8Q29sb3JQaWNrZXJcbiAgICAgICAgICAgICAgICBjbGFzcz17e1xuICAgICAgICAgICAgICAgICAgICAnY29sb3ItZHJvcGRvd25fX3BpY2tlcic6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICdjb2xvci1kcm9wZG93bl9fcGlja2VyLS1oaWRkZW4nOiAhaXNQaWNrZXJWaXNpYmxlLFxuICAgICAgICAgICAgICAgIH19XG4gICAgICAgICAgICAgICAgY29sb3I9e3Byb3BzLnZhbHVlfVxuICAgICAgICAgICAgICAgIG9uQ2hhbmdlPXtwcm9wcy5vbkNoYW5nZX1cbiAgICAgICAgICAgICAgICBjYW5SZXNldD17dHJ1ZX1cbiAgICAgICAgICAgICAgICBvblJlc2V0PXtwcm9wcy5vblJlc2V0fVxuICAgICAgICAgICAgLz5cbiAgICAgICAgPC9zcGFuPlxuICAgICk7XG59XG4iLCJpbXBvcnQge2dldENvbnRleHQsIHJlbmRlcn0gZnJvbSAnbWFsZXZpYy9kb20nO1xuaW1wb3J0IHtpc1N0cmluZ2lmeWluZ30gZnJvbSAnbWFsZXZpYy9zdHJpbmcnO1xuXG5jb25zdCBERUZBVUxUX09WRVJMQVlfS0VZID0gU3ltYm9sKCk7XG5jb25zdCBvdmVybGF5Tm9kZXMgPSBuZXcgTWFwPGFueSwgSFRNTEVsZW1lbnQ+KCk7XG5jb25zdCBjbGlja0xpc3RlbmVycyA9IG5ldyBXZWFrTWFwPEhUTUxFbGVtZW50LCAoKSA9PiB2b2lkPigpO1xuXG5mdW5jdGlvbiBnZXRPdmVybGF5RE9NTm9kZShrZXk6IGFueSkge1xuICAgIGlmIChrZXkgPT0gbnVsbCkge1xuICAgICAgICBrZXkgPSBERUZBVUxUX09WRVJMQVlfS0VZO1xuICAgIH1cblxuICAgIGlmICghb3ZlcmxheU5vZGVzLmhhcyhrZXkpKSB7XG4gICAgICAgIGNvbnN0IG5vZGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgbm9kZS5jbGFzc0xpc3QuYWRkKCdvdmVybGF5Jyk7XG4gICAgICAgIG5vZGUuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4ge1xuICAgICAgICAgICAgaWYgKGNsaWNrTGlzdGVuZXJzLmhhcyhub2RlKSAmJiBlLmN1cnJlbnRUYXJnZXQgPT09IG5vZGUpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBsaXN0ZW5lciA9IGNsaWNrTGlzdGVuZXJzLmdldChub2RlKTtcbiAgICAgICAgICAgICAgICBsaXN0ZW5lcigpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgb3ZlcmxheU5vZGVzLnNldChrZXksIG5vZGUpO1xuICAgIH1cbiAgICByZXR1cm4gb3ZlcmxheU5vZGVzLmdldChrZXkpO1xufVxuXG5pbnRlcmZhY2UgT3ZlcmxheVByb3BzIHtcbiAgICBrZXk/OiBhbnk7XG59XG5cbmZ1bmN0aW9uIE92ZXJsYXkocHJvcHM6IE92ZXJsYXlQcm9wcykge1xuICAgIGlmIChpc1N0cmluZ2lmeWluZygpKSB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICByZXR1cm4gZ2V0T3ZlcmxheURPTU5vZGUocHJvcHMua2V5KTtcbn1cblxuaW50ZXJmYWNlIE92ZXJsYXlQb3J0YWxQcm9wcyB7XG4gICAga2V5PzogYW55O1xuICAgIG9uT3V0ZXJDbGljaz86ICgpID0+IHZvaWQ7XG59XG5cbmZ1bmN0aW9uIFBvcnRhbChwcm9wczogT3ZlcmxheVBvcnRhbFByb3BzLCAuLi5jb250ZW50OiBNYWxldmljLkNoaWxkW10pIHtcbiAgICBjb25zdCBjb250ZXh0ID0gZ2V0Q29udGV4dCgpO1xuXG4gICAgY29udGV4dC5vblJlbmRlcigoKSA9PiB7XG4gICAgICAgIGNvbnN0IG5vZGUgPSBnZXRPdmVybGF5RE9NTm9kZShwcm9wcy5rZXkpO1xuICAgICAgICBpZiAocHJvcHMub25PdXRlckNsaWNrKSB7XG4gICAgICAgICAgICBjbGlja0xpc3RlbmVycy5zZXQobm9kZSwgcHJvcHMub25PdXRlckNsaWNrKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNsaWNrTGlzdGVuZXJzLmRlbGV0ZShub2RlKTtcbiAgICAgICAgfVxuICAgICAgICByZW5kZXIobm9kZSwgY29udGVudCk7XG4gICAgfSk7XG5cbiAgICBjb250ZXh0Lm9uUmVtb3ZlKCgpID0+IHtcbiAgICAgICAgY29uc3QgY29udGFpbmVyID0gZ2V0T3ZlcmxheURPTU5vZGUocHJvcHMua2V5KTtcbiAgICAgICAgcmVuZGVyKGNvbnRhaW5lciwgbnVsbCk7XG4gICAgfSk7XG5cbiAgICByZXR1cm4gY29udGV4dC5sZWF2ZSgpO1xufVxuXG5leHBvcnQgZGVmYXVsdCBPYmplY3QuYXNzaWduKE92ZXJsYXksIHtQb3J0YWx9KTtcbiIsImltcG9ydCB7bX0gZnJvbSAnbWFsZXZpYyc7XG5pbXBvcnQgQnV0dG9uIGZyb20gJy4uL2J1dHRvbic7XG5pbXBvcnQgT3ZlcmxheSBmcm9tICcuLi9vdmVybGF5JztcblxuaW50ZXJmYWNlIE1lc3NhZ2VCb3hQcm9wcyB7XG4gICAgY2FwdGlvbjogc3RyaW5nO1xuICAgIG9uT0s/OiAoKSA9PiB2b2lkO1xuICAgIG9uQ2FuY2VsPzogKCkgPT4gdm9pZDtcbiAgICBwb3J0YWxLZXk/OiBhbnk7XG59XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIE1lc3NhZ2VCb3gocHJvcHM6IE1lc3NhZ2VCb3hQcm9wcykge1xuICAgIHJldHVybiAoXG4gICAgICAgIDxPdmVybGF5LlBvcnRhbCBrZXk9e3Byb3BzLnBvcnRhbEtleX0gb25PdXRlckNsaWNrPXtwcm9wcy5vbkNhbmNlbH0+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwibWVzc2FnZS1ib3hcIj5cbiAgICAgICAgICAgICAgICA8bGFiZWwgY2xhc3M9XCJtZXNzYWdlLWJveF9fY2FwdGlvblwiPlxuICAgICAgICAgICAgICAgICAgICB7cHJvcHMuY2FwdGlvbn1cbiAgICAgICAgICAgICAgICA8L2xhYmVsPlxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJtZXNzYWdlLWJveF9fYnV0dG9uc1wiPlxuICAgICAgICAgICAgICAgICAgICA8QnV0dG9uIGNsYXNzPVwibWVzc2FnZS1ib3hfX2J1dHRvbiBtZXNzYWdlLWJveF9fYnV0dG9uLW9rXCIgb25jbGljaz17cHJvcHMub25PS30+XG4gICAgICAgICAgICAgICAgICAgICAgICBPS1xuICAgICAgICAgICAgICAgICAgICA8L0J1dHRvbj5cbiAgICAgICAgICAgICAgICAgICAgPEJ1dHRvbiBjbGFzcz1cIm1lc3NhZ2UtYm94X19idXR0b24gbWVzc2FnZS1ib3hfX2J1dHRvbi1jYW5jZWxcIiBvbmNsaWNrPXtwcm9wcy5vbkNhbmNlbH0+XG4gICAgICAgICAgICAgICAgICAgICAgICBDYW5jZWxcbiAgICAgICAgICAgICAgICAgICAgPC9CdXR0b24+XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgPC9PdmVybGF5LlBvcnRhbD5cbiAgICApO1xufVxuIiwiaW1wb3J0IHttfSBmcm9tICdtYWxldmljJztcblxuaW50ZXJmYWNlIE11bHRpU3dpdGNoUHJvcHMge1xuICAgIGNsYXNzPzogc3RyaW5nO1xuICAgIG9wdGlvbnM6IHN0cmluZ1tdO1xuICAgIHZhbHVlOiBzdHJpbmc7XG4gICAgb25DaGFuZ2U6ICh2YWx1ZTogc3RyaW5nKSA9PiB2b2lkO1xufVxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBNdWx0aVN3aXRjaChwcm9wczogTXVsdGlTd2l0Y2hQcm9wcywgLi4uY2hpbGRyZW4pIHtcbiAgICByZXR1cm4gKFxuICAgICAgICA8c3BhbiBjbGFzcz17WydtdWx0aS1zd2l0Y2gnLCBwcm9wcy5jbGFzc119PlxuICAgICAgICAgICAgPHNwYW5cbiAgICAgICAgICAgICAgICBjbGFzcz1cIm11bHRpLXN3aXRjaF9faGlnaGxpZ2h0XCJcbiAgICAgICAgICAgICAgICBzdHlsZT17e1xuICAgICAgICAgICAgICAgICAgICAnbGVmdCc6IGAke3Byb3BzLm9wdGlvbnMuaW5kZXhPZihwcm9wcy52YWx1ZSkgLyBwcm9wcy5vcHRpb25zLmxlbmd0aCAqIDEwMH0lYCxcbiAgICAgICAgICAgICAgICAgICAgJ3dpZHRoJzogYCR7MSAvIHByb3BzLm9wdGlvbnMubGVuZ3RoICogMTAwfSVgLFxuICAgICAgICAgICAgICAgIH19XG4gICAgICAgICAgICAvPlxuICAgICAgICAgICAge3Byb3BzLm9wdGlvbnMubWFwKChvcHRpb24pID0+IChcbiAgICAgICAgICAgICAgICA8c3BhblxuICAgICAgICAgICAgICAgICAgICBjbGFzcz17e1xuICAgICAgICAgICAgICAgICAgICAgICAgJ211bHRpLXN3aXRjaF9fb3B0aW9uJzogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICdtdWx0aS1zd2l0Y2hfX29wdGlvbi0tc2VsZWN0ZWQnOiBvcHRpb24gPT09IHByb3BzLnZhbHVlXG4gICAgICAgICAgICAgICAgICAgIH19XG4gICAgICAgICAgICAgICAgICAgIG9uY2xpY2s9eygpID0+IG9wdGlvbiAhPT0gcHJvcHMudmFsdWUgJiYgcHJvcHMub25DaGFuZ2Uob3B0aW9uKX1cbiAgICAgICAgICAgICAgICA+XG4gICAgICAgICAgICAgICAgICAgIHtvcHRpb259XG4gICAgICAgICAgICAgICAgPC9zcGFuPlxuICAgICAgICAgICAgKSl9XG4gICAgICAgICAgICB7Li4uY2hpbGRyZW59XG4gICAgICAgIDwvc3Bhbj5cbiAgICApO1xufVxuIiwiaW1wb3J0IHttfSBmcm9tICdtYWxldmljJztcbmltcG9ydCBCdXR0b24gZnJvbSAnLi4vYnV0dG9uJztcblxuaW50ZXJmYWNlIE5hdkJ1dHRvblByb3BzIHtcbiAgICBjbGFzcz86IGFueTtcbiAgICBvbkNsaWNrOiAoKSA9PiB2b2lkO1xufVxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBSZXNldEJ1dHRvbihwcm9wczogTmF2QnV0dG9uUHJvcHMsIC4uLmNvbnRlbnQ6IE1hbGV2aWMuQ2hpbGRbXSkge1xuICAgIHJldHVybiAoXG4gICAgICAgIDxCdXR0b25cbiAgICAgICAgICAgIGNsYXNzPXtbJ25hdi1idXR0b24nLCBwcm9wcy5jbGFzc119XG4gICAgICAgICAgICBvbmNsaWNrPXtwcm9wcy5vbkNsaWNrfVxuICAgICAgICA+XG4gICAgICAgICAgICA8c3BhbiBjbGFzcz1cIm5hdi1idXR0b25fX2NvbnRlbnRcIj5cbiAgICAgICAgICAgICAgICB7Li4uY29udGVudH1cbiAgICAgICAgICAgIDwvc3Bhbj5cbiAgICAgICAgPC9CdXR0b24+XG4gICAgKTtcbn1cbiIsImltcG9ydCB7bX0gZnJvbSAnbWFsZXZpYyc7XG5pbXBvcnQgQnV0dG9uIGZyb20gJy4uL2J1dHRvbic7XG5cbmludGVyZmFjZSBSZXNldEJ1dHRvblByb3BzIHtcbiAgICBvbkNsaWNrOiAoKSA9PiB2b2lkO1xufVxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBSZXNldEJ1dHRvbihwcm9wczogUmVzZXRCdXR0b25Qcm9wcywgLi4uY29udGVudDogTWFsZXZpYy5DaGlsZFtdKSB7XG4gICAgcmV0dXJuIChcbiAgICAgICAgPEJ1dHRvblxuICAgICAgICAgICAgY2xhc3M9XCJyZXNldC1idXR0b25cIlxuICAgICAgICAgICAgb25jbGljaz17cHJvcHMub25DbGlja31cbiAgICAgICAgPlxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJyZXNldC1idXR0b25fX2NvbnRlbnRcIj5cbiAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz1cInJlc2V0LWJ1dHRvbl9faWNvblwiPjwvc3Bhbj5cbiAgICAgICAgICAgICAgICB7Li4uY29udGVudH1cbiAgICAgICAgICAgIDwvc3Bhbj5cbiAgICAgICAgPC9CdXR0b24+XG4gICAgKTtcbn1cbiIsImltcG9ydCB7bX0gZnJvbSAnbWFsZXZpYyc7XG5pbXBvcnQge3JlbmRlciwgZ2V0Q29udGV4dH0gZnJvbSAnbWFsZXZpYy9kb20nO1xuXG5pbnRlcmZhY2UgVmlydHVhbFNjcm9sbFByb3BzIHtcbiAgICByb290OiBNYWxldmljLlNwZWM7XG4gICAgaXRlbXM6IE1hbGV2aWMuU3BlY1tdO1xuICAgIHNjcm9sbFRvSW5kZXg/OiBudW1iZXI7XG59XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIFZpcnR1YWxTY3JvbGwocHJvcHM6IFZpcnR1YWxTY3JvbGxQcm9wcykge1xuICAgIGlmIChwcm9wcy5pdGVtcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgcmV0dXJuIHByb3BzLnJvb3Q7XG4gICAgfVxuXG4gICAgY29uc3Qge3N0b3JlfSA9IGdldENvbnRleHQoKTtcblxuICAgIGZ1bmN0aW9uIHJlbmRlckNvbnRlbnQocm9vdDogRWxlbWVudCwgc2Nyb2xsVG9JbmRleDogbnVtYmVyKSB7XG4gICAgICAgIGlmIChyb290LmNsaWVudFdpZHRoID09PSAwKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc3RvcmUuaXRlbUhlaWdodCA9PSBudWxsKSB7XG4gICAgICAgICAgICBjb25zdCB0ZW1wSXRlbSA9IHtcbiAgICAgICAgICAgICAgICAuLi5wcm9wcy5pdGVtc1swXSxcbiAgICAgICAgICAgICAgICBwcm9wczoge1xuICAgICAgICAgICAgICAgICAgICAuLi5wcm9wcy5pdGVtc1swXS5wcm9wcyxcbiAgICAgICAgICAgICAgICAgICAgb25jcmVhdGU6IG51bGwsXG4gICAgICAgICAgICAgICAgICAgIG9udXBkYXRlOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICBvbnJlbmRlcjogbnVsbCxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGNvbnN0IHRlbXBOb2RlID0gcmVuZGVyKHJvb3QsIHRlbXBJdGVtKS5maXJzdEVsZW1lbnRDaGlsZDtcbiAgICAgICAgICAgIHN0b3JlLml0ZW1IZWlnaHQgPSB0ZW1wTm9kZS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKS5oZWlnaHQ7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qge2l0ZW1IZWlnaHR9ID0gc3RvcmU7XG5cbiAgICAgICAgY29uc3Qgd3JhcHBlciA9IHJlbmRlcihyb290LCAoXG4gICAgICAgICAgICA8ZGl2XG4gICAgICAgICAgICAgICAgc3R5bGU9e3tcbiAgICAgICAgICAgICAgICAgICAgJ2ZsZXgnOiAnbm9uZScsXG4gICAgICAgICAgICAgICAgICAgICdoZWlnaHQnOiBgJHtwcm9wcy5pdGVtcy5sZW5ndGggKiBpdGVtSGVpZ2h0fXB4YCxcbiAgICAgICAgICAgICAgICAgICAgJ292ZXJmbG93JzogJ2hpZGRlbicsXG4gICAgICAgICAgICAgICAgICAgICdwb3NpdGlvbic6ICdyZWxhdGl2ZScsXG4gICAgICAgICAgICAgICAgfX1cbiAgICAgICAgICAgIC8+XG4gICAgICAgICkpLmZpcnN0RWxlbWVudENoaWxkO1xuXG4gICAgICAgIGlmIChzY3JvbGxUb0luZGV4ID49IDApIHtcbiAgICAgICAgICAgIHJvb3Quc2Nyb2xsVG9wID0gc2Nyb2xsVG9JbmRleCAqIGl0ZW1IZWlnaHQ7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgY29udGFpbmVySGVpZ2h0ID0gZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LmNsaWVudEhlaWdodCAtIHJvb3QuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkudG9wOyAvLyBVc2UgdGhpcyBoZWlnaHQgYXMgYSBmaXggZm9yIGFuaW1hdGVkIGhlaWdodFxuXG4gICAgICAgIC8vIFByZXZlbnQgcmVtb3ZpbmcgZm9jdXNlZCBlbGVtZW50XG4gICAgICAgIGxldCBmb2N1c2VkSW5kZXggPSAtMTtcbiAgICAgICAgaWYgKGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQpIHtcbiAgICAgICAgICAgIGxldCBjdXJyZW50ID0gZG9jdW1lbnQuYWN0aXZlRWxlbWVudDtcbiAgICAgICAgICAgIHdoaWxlIChjdXJyZW50ICYmIGN1cnJlbnQucGFyZW50RWxlbWVudCAhPT0gd3JhcHBlcikge1xuICAgICAgICAgICAgICAgIGN1cnJlbnQgPSBjdXJyZW50LnBhcmVudEVsZW1lbnQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoY3VycmVudCkge1xuICAgICAgICAgICAgICAgIGZvY3VzZWRJbmRleCA9IHN0b3JlLm5vZGVzSW5kaWNlcy5nZXQoY3VycmVudCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBzdG9yZS5ub2Rlc0luZGljZXMgPSBzdG9yZS5ub2Rlc0luZGljZXMgfHwgbmV3IFdlYWtNYXAoKTtcbiAgICAgICAgY29uc3Qgc2F2ZU5vZGVJbmRleCA9IChub2RlOiBFbGVtZW50LCBpbmRleDogbnVtYmVyKSA9PiBzdG9yZS5ub2Rlc0luZGljZXMuc2V0KG5vZGUsIGluZGV4KTtcblxuICAgICAgICBjb25zdCBpdGVtcyA9IHByb3BzLml0ZW1zXG4gICAgICAgICAgICAubWFwKChpdGVtLCBpbmRleCkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiB7aXRlbSwgaW5kZXh9O1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5maWx0ZXIoKHtpbmRleH0pID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBlVG9wID0gaW5kZXggKiBpdGVtSGVpZ2h0O1xuICAgICAgICAgICAgICAgIGNvbnN0IGVCb3R0b20gPSAoaW5kZXggKyAxKSAqIGl0ZW1IZWlnaHQ7XG4gICAgICAgICAgICAgICAgY29uc3QgclRvcCA9IHJvb3Quc2Nyb2xsVG9wO1xuICAgICAgICAgICAgICAgIGNvbnN0IHJCb3R0b20gPSByb290LnNjcm9sbFRvcCArIGNvbnRhaW5lckhlaWdodDtcbiAgICAgICAgICAgICAgICBjb25zdCBpc1RvcEJvdW5kVmlzaWJsZSA9IGVUb3AgPj0gclRvcCAmJiBlVG9wIDw9IHJCb3R0b207XG4gICAgICAgICAgICAgICAgY29uc3QgaXNCb3R0b21Cb3VuZFZpc2libGUgPSBlQm90dG9tID49IHJUb3AgJiYgZUJvdHRvbSA8PSByQm90dG9tO1xuICAgICAgICAgICAgICAgIHJldHVybiBpc1RvcEJvdW5kVmlzaWJsZSB8fCBpc0JvdHRvbUJvdW5kVmlzaWJsZSB8fCBmb2N1c2VkSW5kZXggPT09IGluZGV4O1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5tYXAoKHtpdGVtLCBpbmRleH0pID0+IChcbiAgICAgICAgICAgICAgICA8ZGl2XG4gICAgICAgICAgICAgICAgICAgIGtleT17aW5kZXh9XG4gICAgICAgICAgICAgICAgICAgIG9ucmVuZGVyPXsobm9kZSkgPT4gc2F2ZU5vZGVJbmRleChub2RlLCBpbmRleCl9XG4gICAgICAgICAgICAgICAgICAgIHN0eWxlPXt7XG4gICAgICAgICAgICAgICAgICAgICAgICAnbGVmdCc6ICcwJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICdwb3NpdGlvbic6ICdhYnNvbHV0ZScsXG4gICAgICAgICAgICAgICAgICAgICAgICAndG9wJzogYCR7aW5kZXggKiBpdGVtSGVpZ2h0fXB4YCxcbiAgICAgICAgICAgICAgICAgICAgICAgICd3aWR0aCc6ICcxMDAlJyxcbiAgICAgICAgICAgICAgICAgICAgfX1cbiAgICAgICAgICAgICAgICA+XG4gICAgICAgICAgICAgICAgICAgIHtpdGVtfVxuICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgKSk7XG5cbiAgICAgICAgcmVuZGVyKHdyYXBwZXIsIGl0ZW1zKTtcbiAgICB9XG5cbiAgICBsZXQgcm9vdE5vZGU6IEVsZW1lbnQ7XG4gICAgbGV0IHByZXZTY3JvbGxUb3A6IG51bWJlcjtcbiAgICBjb25zdCByb290RGlkTW91bnQgPSBwcm9wcy5yb290LnByb3BzLm9uY3JlYXRlO1xuICAgIGNvbnN0IHJvb3REaWRVcGRhdGUgPSBwcm9wcy5yb290LnByb3BzLm9udXBkYXRlO1xuICAgIGNvbnN0IHJvb3REaWRSZW5kZXIgPSBwcm9wcy5yb290LnByb3BzLm9ucmVuZGVyO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgLi4ucHJvcHMucm9vdCxcbiAgICAgICAgcHJvcHM6IHtcbiAgICAgICAgICAgIC4uLnByb3BzLnJvb3QucHJvcHMsXG4gICAgICAgICAgICBvbmNyZWF0ZTogcm9vdERpZE1vdW50LFxuICAgICAgICAgICAgb251cGRhdGU6IHJvb3REaWRVcGRhdGUsXG4gICAgICAgICAgICBvbnJlbmRlcjogKG5vZGUpID0+IHtcbiAgICAgICAgICAgICAgICByb290Tm9kZSA9IG5vZGU7XG4gICAgICAgICAgICAgICAgcm9vdERpZFJlbmRlciAmJiByb290RGlkUmVuZGVyKHJvb3ROb2RlKTtcbiAgICAgICAgICAgICAgICByZW5kZXJDb250ZW50KHJvb3ROb2RlLCBpc05hTihwcm9wcy5zY3JvbGxUb0luZGV4KSA/IC0xIDogcHJvcHMuc2Nyb2xsVG9JbmRleCk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgb25zY3JvbGw6ICgpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAocm9vdE5vZGUuc2Nyb2xsVG9wID09PSBwcmV2U2Nyb2xsVG9wKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcHJldlNjcm9sbFRvcCA9IHJvb3ROb2RlLnNjcm9sbFRvcDtcbiAgICAgICAgICAgICAgICByZW5kZXJDb250ZW50KHJvb3ROb2RlLCAtMSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICBjaGlsZHJlbjogW11cbiAgICB9IGFzIE1hbGV2aWMuU3BlYztcbn1cbiIsImltcG9ydCB7bX0gZnJvbSAnbWFsZXZpYyc7XG5pbXBvcnQge2dldENvbnRleHR9IGZyb20gJ21hbGV2aWMvZG9tJztcbmltcG9ydCB7d2l0aFN0YXRlLCB1c2VTdGF0ZX0gZnJvbSAnbWFsZXZpYy9zdGF0ZSc7XG5pbXBvcnQgQnV0dG9uIGZyb20gJy4uL2J1dHRvbic7XG5pbXBvcnQgVGV4dEJveCBmcm9tICcuLi90ZXh0Ym94JztcbmltcG9ydCBWaXJ0dWFsU2Nyb2xsIGZyb20gJy4uL3ZpcnR1YWwtc2Nyb2xsJztcblxuaW50ZXJmYWNlIFNlbGVjdFByb3BzIHtcbiAgICBjbGFzcz86IGFueTtcbiAgICB2YWx1ZTogc3RyaW5nO1xuICAgIG9wdGlvbnM6IHtcbiAgICAgICAgW3ZhbHVlOiBzdHJpbmddOiBNYWxldmljLkNoaWxkO1xuICAgIH07XG4gICAgb25DaGFuZ2U6ICh2YWx1ZTogc3RyaW5nKSA9PiB2b2lkO1xufVxuXG5pbnRlcmZhY2UgU2VsZWN0U3RhdGUge1xuICAgIGlzRXhwYW5kZWQ6IGJvb2xlYW47XG4gICAgZm9jdXNlZEluZGV4OiBudW1iZXI7XG59XG5cbmZ1bmN0aW9uIFNlbGVjdChwcm9wczogU2VsZWN0UHJvcHMpIHtcbiAgICBjb25zdCB7c3RhdGUsIHNldFN0YXRlfSA9IHVzZVN0YXRlPFNlbGVjdFN0YXRlPih7aXNFeHBhbmRlZDogZmFsc2UsIGZvY3VzZWRJbmRleDogbnVsbH0pO1xuICAgIGNvbnN0IHZhbHVlcyA9IE9iamVjdC5rZXlzKHByb3BzLm9wdGlvbnMpO1xuXG4gICAgY29uc3Qge3N0b3JlfSA9IGdldENvbnRleHQoKTtcbiAgICBjb25zdCB2YWx1ZU5vZGVzOiBNYXA8c3RyaW5nLCBFbGVtZW50PiA9IHN0b3JlLnZhbHVlTm9kZXMgfHwgKHN0b3JlLnZhbHVlTm9kZXMgPSBuZXcgTWFwKCkpO1xuICAgIGNvbnN0IG5vZGVzVmFsdWVzOiBXZWFrTWFwPEVsZW1lbnQsIHN0cmluZz4gPSBzdG9yZS5ub2Rlc1ZhbHVlcyB8fCAoc3RvcmUubm9kZXNWYWx1ZXMgPSBuZXcgV2Vha01hcCgpKTtcblxuICAgIGZ1bmN0aW9uIG9uUmVuZGVyKG5vZGUpIHtcbiAgICAgICAgc3RvcmUucm9vdE5vZGUgPSBub2RlO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIG9uT3V0ZXJDbGljayhlOiBNb3VzZUV2ZW50KSB7XG4gICAgICAgIGNvbnN0IHIgPSAoc3RvcmUucm9vdE5vZGUgYXMgRWxlbWVudCkuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgICAgIGlmIChlLmNsaWVudFggPCByLmxlZnQgfHwgZS5jbGllbnRYID4gci5yaWdodCB8fCBlLmNsaWVudFkgPCByLnRvcCB8fCBlLmNsaWVudFkgPiByLmJvdHRvbSkge1xuICAgICAgICAgICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgb25PdXRlckNsaWNrKTtcbiAgICAgICAgICAgIGNvbGxhcHNlTGlzdCgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gb25UZXh0SW5wdXQoZTogRXZlbnQpIHtcbiAgICAgICAgY29uc3QgdGV4dCA9IChlLnRhcmdldCBhcyBIVE1MSW5wdXRFbGVtZW50KVxuICAgICAgICAgICAgLnZhbHVlXG4gICAgICAgICAgICAudG9Mb3dlckNhc2UoKVxuICAgICAgICAgICAgLnRyaW0oKTtcblxuICAgICAgICBleHBhbmRMaXN0KCk7XG5cbiAgICAgICAgdmFsdWVzLnNvbWUoKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICBpZiAodmFsdWUudG9Mb3dlckNhc2UoKS5pbmRleE9mKHRleHQpID09PSAwKSB7XG4gICAgICAgICAgICAgICAgc2Nyb2xsVG9WYWx1ZSh2YWx1ZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIG9uS2V5UHJlc3MoZTogS2V5Ym9hcmRFdmVudCkge1xuICAgICAgICBjb25zdCBpbnB1dCA9IGUudGFyZ2V0IGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG4gICAgICAgIGlmIChlLmtleSA9PT0gJ0VudGVyJykge1xuICAgICAgICAgICAgY29uc3QgdmFsdWUgPSBpbnB1dC52YWx1ZTtcbiAgICAgICAgICAgIGlucHV0LmJsdXIoKTtcbiAgICAgICAgICAgIGNvbGxhcHNlTGlzdCgpO1xuICAgICAgICAgICAgcHJvcHMub25DaGFuZ2UodmFsdWUpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc2Nyb2xsVG9WYWx1ZSh2YWx1ZTogc3RyaW5nKSB7XG4gICAgICAgIHNldFN0YXRlKHtmb2N1c2VkSW5kZXg6IHZhbHVlcy5pbmRleE9mKHZhbHVlKX0pO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIG9uRXhwYW5kQ2xpY2soKSB7XG4gICAgICAgIGlmIChzdGF0ZS5pc0V4cGFuZGVkKSB7XG4gICAgICAgICAgICBjb2xsYXBzZUxpc3QoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGV4cGFuZExpc3QoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGV4cGFuZExpc3QoKSB7XG4gICAgICAgIHNldFN0YXRlKHtpc0V4cGFuZGVkOiB0cnVlfSk7XG4gICAgICAgIHNjcm9sbFRvVmFsdWUocHJvcHMudmFsdWUpO1xuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBvbk91dGVyQ2xpY2spO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNvbGxhcHNlTGlzdCgpIHtcbiAgICAgICAgc2V0U3RhdGUoe2lzRXhwYW5kZWQ6IGZhbHNlfSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gb25TZWxlY3RPcHRpb24oZTogTW91c2VFdmVudCkge1xuICAgICAgICBsZXQgY3VycmVudCA9IGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuICAgICAgICB3aGlsZSAoY3VycmVudCAmJiAhbm9kZXNWYWx1ZXMuaGFzKGN1cnJlbnQpKSB7XG4gICAgICAgICAgICBjdXJyZW50ID0gY3VycmVudC5wYXJlbnRFbGVtZW50O1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGN1cnJlbnQpIHtcbiAgICAgICAgICAgIGNvbnN0IHZhbHVlID0gbm9kZXNWYWx1ZXMuZ2V0KGN1cnJlbnQpO1xuICAgICAgICAgICAgcHJvcHMub25DaGFuZ2UodmFsdWUpO1xuICAgICAgICB9XG5cbiAgICAgICAgY29sbGFwc2VMaXN0KCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc2F2ZVZhbHVlTm9kZSh2YWx1ZTogc3RyaW5nLCBkb21Ob2RlOiBFbGVtZW50KSB7XG4gICAgICAgIHZhbHVlTm9kZXMuc2V0KHZhbHVlLCBkb21Ob2RlKTtcbiAgICAgICAgbm9kZXNWYWx1ZXMuc2V0KGRvbU5vZGUsIHZhbHVlKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiByZW1vdmVWYWx1ZU5vZGUodmFsdWUpIHtcbiAgICAgICAgY29uc3QgZWwgPSB2YWx1ZU5vZGVzLmdldCh2YWx1ZSk7XG4gICAgICAgIHZhbHVlTm9kZXMuZGVsZXRlKHZhbHVlKTtcbiAgICAgICAgbm9kZXNWYWx1ZXMuZGVsZXRlKGVsKTtcbiAgICB9XG5cbiAgICByZXR1cm4gKFxuICAgICAgICA8c3BhblxuICAgICAgICAgICAgY2xhc3M9e1tcbiAgICAgICAgICAgICAgICAnc2VsZWN0JyxcbiAgICAgICAgICAgICAgICBzdGF0ZS5pc0V4cGFuZGVkICYmICdzZWxlY3QtLWV4cGFuZGVkJyxcbiAgICAgICAgICAgICAgICBwcm9wcy5jbGFzcyxcbiAgICAgICAgICAgIF19XG4gICAgICAgICAgICBvbnJlbmRlcj17b25SZW5kZXJ9XG4gICAgICAgID5cbiAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwic2VsZWN0X19saW5lXCI+XG4gICAgICAgICAgICAgICAgPFRleHRCb3hcbiAgICAgICAgICAgICAgICAgICAgY2xhc3M9XCJzZWxlY3RfX3RleHRib3hcIlxuICAgICAgICAgICAgICAgICAgICB2YWx1ZT17cHJvcHMudmFsdWV9XG4gICAgICAgICAgICAgICAgICAgIG9uaW5wdXQ9e29uVGV4dElucHV0fVxuICAgICAgICAgICAgICAgICAgICBvbmtleXByZXNzPXtvbktleVByZXNzfVxuICAgICAgICAgICAgICAgIC8+XG4gICAgICAgICAgICAgICAgPEJ1dHRvblxuICAgICAgICAgICAgICAgICAgICBjbGFzcz1cInNlbGVjdF9fZXhwYW5kXCJcbiAgICAgICAgICAgICAgICAgICAgb25jbGljaz17b25FeHBhbmRDbGlja31cbiAgICAgICAgICAgICAgICA+XG4gICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwic2VsZWN0X19leHBhbmRfX2ljb25cIj48L3NwYW4+XG4gICAgICAgICAgICAgICAgPC9CdXR0b24+XG4gICAgICAgICAgICA8L3NwYW4+XG4gICAgICAgICAgICA8VmlydHVhbFNjcm9sbFxuICAgICAgICAgICAgICAgIHJvb3Q9ezxzcGFuXG4gICAgICAgICAgICAgICAgICAgIGNsYXNzPXt7XG4gICAgICAgICAgICAgICAgICAgICAgICAnc2VsZWN0X19saXN0JzogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICdzZWxlY3RfX2xpc3QtLWV4cGFuZGVkJzogc3RhdGUuaXNFeHBhbmRlZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICdzZWxlY3RfX2xpc3QtLXNob3J0JzogT2JqZWN0LmtleXMocHJvcHMub3B0aW9ucykubGVuZ3RoIDw9IDcsXG4gICAgICAgICAgICAgICAgICAgIH19XG4gICAgICAgICAgICAgICAgICAgIG9uY2xpY2s9e29uU2VsZWN0T3B0aW9ufVxuICAgICAgICAgICAgICAgIC8+fVxuICAgICAgICAgICAgICAgIGl0ZW1zPXtPYmplY3QuZW50cmllcyhwcm9wcy5vcHRpb25zKS5tYXAoKFt2YWx1ZSwgY29udGVudF0pID0+IChcbiAgICAgICAgICAgICAgICAgICAgPHNwYW5cbiAgICAgICAgICAgICAgICAgICAgICAgIGNsYXNzPVwic2VsZWN0X19vcHRpb25cIlxuICAgICAgICAgICAgICAgICAgICAgICAgZGF0YT17dmFsdWV9XG4gICAgICAgICAgICAgICAgICAgICAgICBvbnJlbmRlcj17KGRvbU5vZGUpID0+IHNhdmVWYWx1ZU5vZGUodmFsdWUsIGRvbU5vZGUpfVxuICAgICAgICAgICAgICAgICAgICAgICAgb25yZW1vdmU9eygpID0+IHJlbW92ZVZhbHVlTm9kZSh2YWx1ZSl9XG4gICAgICAgICAgICAgICAgICAgID5cbiAgICAgICAgICAgICAgICAgICAgICAgIHtjb250ZW50fVxuICAgICAgICAgICAgICAgICAgICA8L3NwYW4+XG4gICAgICAgICAgICAgICAgKSl9XG4gICAgICAgICAgICAgICAgc2Nyb2xsVG9JbmRleD17c3RhdGUuZm9jdXNlZEluZGV4fVxuICAgICAgICAgICAgLz5cbiAgICAgICAgPC9zcGFuPlxuICAgICk7XG59XG5cbmV4cG9ydCBkZWZhdWx0IHdpdGhTdGF0ZShTZWxlY3QpO1xuIiwiaW1wb3J0IHttfSBmcm9tICdtYWxldmljJztcbmltcG9ydCB7bWVyZ2VDbGFzc30gZnJvbSAnLi4vdXRpbHMnO1xuaW1wb3J0IHtpc0ZpcmVmb3gsIGlzRWRnZX0gZnJvbSAnLi4vLi4vLi4vdXRpbHMvcGxhdGZvcm0nO1xuaW1wb3J0IHtTaG9ydGN1dHN9IGZyb20gJy4uLy4uLy4uL2RlZmluaXRpb25zJztcblxuaW50ZXJmYWNlIFNob3J0Y3V0TGlua1Byb3BzIHtcbiAgICBjbGFzcz86IHN0cmluZyB8IHtbY2xzOiBzdHJpbmddOiBhbnl9O1xuICAgIGNvbW1hbmROYW1lOiBzdHJpbmc7XG4gICAgc2hvcnRjdXRzOiBTaG9ydGN1dHM7XG4gICAgdGV4dFRlbXBsYXRlOiAoc2hvcnRjdXQ6IHN0cmluZykgPT4gc3RyaW5nO1xuICAgIG9uU2V0U2hvcnRjdXQ6IChzaG9ydGN1dDogc3RyaW5nKSA9PiB2b2lkO1xufVxuXG4vKipcbiAqIERpc3BsYXlzIGEgc2hvcnRjdXQgYW5kIG5hdmlnYXRlc1xuICogdG8gQ2hyb21lIENvbW1hbmRzIHBhZ2Ugb24gY2xpY2suXG4gKi9cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIFNob3J0Y3V0TGluayhwcm9wczogU2hvcnRjdXRMaW5rUHJvcHMpIHtcbiAgICBjb25zdCBjbHMgPSBtZXJnZUNsYXNzKCdzaG9ydGN1dCcsIHByb3BzLmNsYXNzKTtcbiAgICBjb25zdCBzaG9ydGN1dCA9IHByb3BzLnNob3J0Y3V0c1twcm9wcy5jb21tYW5kTmFtZV07XG4gICAgY29uc3Qgc2hvcnRjdXRNZXNzYWdlID0gcHJvcHMudGV4dFRlbXBsYXRlKHNob3J0Y3V0KTtcblxuICAgIGxldCBlbnRlcmluZ1Nob3J0Y3V0SW5Qcm9ncmVzcyA9IGZhbHNlO1xuXG4gICAgZnVuY3Rpb24gc3RhcnRFbnRlcmluZ1Nob3J0Y3V0KG5vZGU6IEhUTUxBbmNob3JFbGVtZW50KSB7XG4gICAgICAgIGlmIChlbnRlcmluZ1Nob3J0Y3V0SW5Qcm9ncmVzcykge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGVudGVyaW5nU2hvcnRjdXRJblByb2dyZXNzID0gdHJ1ZTtcblxuICAgICAgICBjb25zdCBpbml0aWFsVGV4dCA9IG5vZGUudGV4dENvbnRlbnQ7XG4gICAgICAgIG5vZGUudGV4dENvbnRlbnQgPSAnLi4u4oyoJztcblxuICAgICAgICBmdW5jdGlvbiBvbktleURvd24oZTogS2V5Ym9hcmRFdmVudCkge1xuICAgICAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgY29uc3QgY3RybCA9IGUuY3RybEtleTtcbiAgICAgICAgICAgIGNvbnN0IGFsdCA9IGUuYWx0S2V5O1xuICAgICAgICAgICAgY29uc3QgY29tbWFuZCA9IGUubWV0YUtleTtcbiAgICAgICAgICAgIGNvbnN0IHNoaWZ0ID0gZS5zaGlmdEtleTtcblxuICAgICAgICAgICAgbGV0IGtleTogc3RyaW5nID0gbnVsbDtcbiAgICAgICAgICAgIGlmIChlLmNvZGUuc3RhcnRzV2l0aCgnS2V5JykpIHtcbiAgICAgICAgICAgICAgICBrZXkgPSBlLmNvZGUuc3Vic3RyaW5nKDMpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChlLmNvZGUuc3RhcnRzV2l0aCgnRGlnaXQnKSkge1xuICAgICAgICAgICAgICAgIGtleSA9IGUuY29kZS5zdWJzdHJpbmcoNSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IHNob3J0Y3V0ID0gYCR7Y3RybCA/ICdDdHJsKycgOiBhbHQgPyAnQWx0KycgOiBjb21tYW5kID8gJ0NvbW1hbmQrJyA6ICcnfSR7c2hpZnQgPyAnU2hpZnQrJyA6ICcnfSR7a2V5ID8ga2V5IDogJyd9YDtcbiAgICAgICAgICAgIG5vZGUudGV4dENvbnRlbnQgPSBzaG9ydGN1dDtcblxuICAgICAgICAgICAgaWYgKChjdHJsIHx8IGFsdCB8fCBjb21tYW5kIHx8IHNoaWZ0KSAmJiBrZXkpIHtcbiAgICAgICAgICAgICAgICByZW1vdmVMaXN0ZW5lcnMoKTtcbiAgICAgICAgICAgICAgICBwcm9wcy5vblNldFNob3J0Y3V0KHNob3J0Y3V0KTtcbiAgICAgICAgICAgICAgICBub2RlLmJsdXIoKTtcbiAgICAgICAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgZW50ZXJpbmdTaG9ydGN1dEluUHJvZ3Jlc3MgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgbm9kZS5jbGFzc0xpc3QucmVtb3ZlKCdzaG9ydGN1dC0tZWRpdCcpO1xuICAgICAgICAgICAgICAgICAgICBub2RlLnRleHRDb250ZW50ID0gcHJvcHMudGV4dFRlbXBsYXRlKHNob3J0Y3V0KTtcbiAgICAgICAgICAgICAgICB9LCA1MDApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gb25CbHVyKCkge1xuICAgICAgICAgICAgcmVtb3ZlTGlzdGVuZXJzKCk7XG4gICAgICAgICAgICBub2RlLmNsYXNzTGlzdC5yZW1vdmUoJ3Nob3J0Y3V0LS1lZGl0Jyk7XG4gICAgICAgICAgICBub2RlLnRleHRDb250ZW50ID0gaW5pdGlhbFRleHQ7XG4gICAgICAgICAgICBlbnRlcmluZ1Nob3J0Y3V0SW5Qcm9ncmVzcyA9IGZhbHNlO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gcmVtb3ZlTGlzdGVuZXJzKCkge1xuICAgICAgICAgICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBvbktleURvd24sIHRydWUpO1xuICAgICAgICAgICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2JsdXInLCBvbkJsdXIsIHRydWUpO1xuICAgICAgICB9XG5cbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBvbktleURvd24sIHRydWUpO1xuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignYmx1cicsIG9uQmx1ciwgdHJ1ZSk7XG4gICAgICAgIG5vZGUuY2xhc3NMaXN0LmFkZCgnc2hvcnRjdXQtLWVkaXQnKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBvbkNsaWNrKGU6IEV2ZW50KSB7XG4gICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgaWYgKGlzRmlyZWZveCgpKSB7XG4gICAgICAgICAgICBzdGFydEVudGVyaW5nU2hvcnRjdXQoZS50YXJnZXQgYXMgSFRNTEFuY2hvckVsZW1lbnQpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGlmIChpc0VkZ2UoKSkge1xuICAgICAgICAgICAgY2hyb21lLnRhYnMuY3JlYXRlKHtcbiAgICAgICAgICAgICAgICB1cmw6IGBlZGdlOi8vZXh0ZW5zaW9ucy9zaG9ydGN1dHNgLFxuICAgICAgICAgICAgICAgIGFjdGl2ZTogdHJ1ZVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgY2hyb21lLnRhYnMuY3JlYXRlKHtcbiAgICAgICAgICAgIHVybDogYGNocm9tZTovL2V4dGVuc2lvbnMvY29uZmlndXJlQ29tbWFuZHMjY29tbWFuZC0ke2Nocm9tZS5ydW50aW1lLmlkfS0ke3Byb3BzLmNvbW1hbmROYW1lfWAsXG4gICAgICAgICAgICBhY3RpdmU6IHRydWVcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gb25SZW5kZXIobm9kZTogSFRNTEFuY2hvckVsZW1lbnQpIHtcbiAgICAgICAgbm9kZS50ZXh0Q29udGVudCA9IHNob3J0Y3V0TWVzc2FnZTtcbiAgICB9XG5cbiAgICByZXR1cm4gKFxuICAgICAgICA8YVxuICAgICAgICAgICAgY2xhc3M9e2Nsc31cbiAgICAgICAgICAgIGhyZWY9XCIjXCJcbiAgICAgICAgICAgIG9uY2xpY2s9e29uQ2xpY2t9XG4gICAgICAgICAgICBvbmNyZWF0ZT17b25SZW5kZXJ9XG4gICAgICAgID48L2E+XG4gICAgKTtcbn1cbiIsImV4cG9ydCBmdW5jdGlvbiB0aHJvdHRsZTxUIGV4dGVuZHMoLi4uYXJnczogYW55W10pID0+IGFueT4oY2FsbGJhY2s6IFQpIHtcbiAgICBsZXQgcGVuZGluZyA9IGZhbHNlO1xuICAgIGxldCBmcmFtZUlkOiBudW1iZXIgPSBudWxsO1xuICAgIGxldCBsYXN0QXJnczogYW55W107XG5cbiAgICBjb25zdCB0aHJvdHRsZWQ6IFQgPSAoKC4uLmFyZ3M6IGFueVtdKSA9PiB7XG4gICAgICAgIGxhc3RBcmdzID0gYXJncztcbiAgICAgICAgaWYgKGZyYW1lSWQpIHtcbiAgICAgICAgICAgIHBlbmRpbmcgPSB0cnVlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY2FsbGJhY2soLi4ubGFzdEFyZ3MpO1xuICAgICAgICAgICAgZnJhbWVJZCA9IHJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB7XG4gICAgICAgICAgICAgICAgZnJhbWVJZCA9IG51bGw7XG4gICAgICAgICAgICAgICAgaWYgKHBlbmRpbmcpIHtcbiAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2soLi4ubGFzdEFyZ3MpO1xuICAgICAgICAgICAgICAgICAgICBwZW5kaW5nID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9KSBhcyBhbnk7XG5cbiAgICBjb25zdCBjYW5jZWwgPSAoKSA9PiB7XG4gICAgICAgIGNhbmNlbEFuaW1hdGlvbkZyYW1lKGZyYW1lSWQpO1xuICAgICAgICBwZW5kaW5nID0gZmFsc2U7XG4gICAgICAgIGZyYW1lSWQgPSBudWxsO1xuICAgIH07XG5cbiAgICByZXR1cm4gT2JqZWN0LmFzc2lnbih0aHJvdHRsZWQsIHtjYW5jZWx9KTtcbn1cblxudHlwZSBUYXNrID0gKCkgPT4gdm9pZDtcblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUFzeW5jVGFza3NRdWV1ZSgpIHtcbiAgICBjb25zdCB0YXNrczogVGFza1tdID0gW107XG4gICAgbGV0IGZyYW1lSWQgPSBudWxsO1xuXG4gICAgZnVuY3Rpb24gcnVuVGFza3MoKSB7XG4gICAgICAgIGxldCB0YXNrOiBUYXNrO1xuICAgICAgICB3aGlsZSAodGFzayA9IHRhc2tzLnNoaWZ0KCkpIHtcbiAgICAgICAgICAgIHRhc2soKTtcbiAgICAgICAgfVxuICAgICAgICBmcmFtZUlkID0gbnVsbDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBhZGQodGFzazogVGFzaykge1xuICAgICAgICB0YXNrcy5wdXNoKHRhc2spO1xuICAgICAgICBpZiAoIWZyYW1lSWQpIHtcbiAgICAgICAgICAgIGZyYW1lSWQgPSByZXF1ZXN0QW5pbWF0aW9uRnJhbWUocnVuVGFza3MpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gY2FuY2VsKCkge1xuICAgICAgICB0YXNrcy5zcGxpY2UoMCk7XG4gICAgICAgIGNhbmNlbEFuaW1hdGlvbkZyYW1lKGZyYW1lSWQpO1xuICAgICAgICBmcmFtZUlkID0gbnVsbDtcbiAgICB9XG5cbiAgICByZXR1cm4ge2FkZCwgY2FuY2VsfTtcbn1cbiIsImltcG9ydCB7bX0gZnJvbSAnbWFsZXZpYyc7XG5pbXBvcnQge2dldENvbnRleHR9IGZyb20gJ21hbGV2aWMvZG9tJztcbmltcG9ydCB7dGhyb3R0bGV9IGZyb20gJy4uLy4uLy4uL2luamVjdC91dGlscy90aHJvdHRsZSc7XG5pbXBvcnQge3NjYWxlLCBjbGFtcH0gZnJvbSAnLi4vLi4vLi4vdXRpbHMvbWF0aCc7XG5cbmludGVyZmFjZSBTbGlkZXJQcm9wcyB7XG4gICAgdmFsdWU6IG51bWJlcjtcbiAgICBtaW46IG51bWJlcjtcbiAgICBtYXg6IG51bWJlcjtcbiAgICBzdGVwOiBudW1iZXI7XG4gICAgZm9ybWF0VmFsdWU6ICh2YWx1ZTogbnVtYmVyKSA9PiBzdHJpbmc7XG4gICAgb25DaGFuZ2U6ICh2YWx1ZTogbnVtYmVyKSA9PiB2b2lkO1xufVxuXG5mdW5jdGlvbiBzdGlja1RvU3RlcCh4OiBudW1iZXIsIHN0ZXA6IG51bWJlcikge1xuICAgIGNvbnN0IHMgPSBNYXRoLnJvdW5kKHggLyBzdGVwKSAqIHN0ZXA7XG4gICAgY29uc3QgZXhwID0gTWF0aC5mbG9vcihNYXRoLmxvZzEwKHN0ZXApKTtcbiAgICBpZiAoZXhwID49IDApIHtcbiAgICAgICAgY29uc3QgbSA9IE1hdGgucG93KDEwLCBleHApO1xuICAgICAgICByZXR1cm4gTWF0aC5yb3VuZChzIC8gbSkgKiBtO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnN0IG0gPSBNYXRoLnBvdygxMCwgLWV4cCk7XG4gICAgICAgIHJldHVybiBNYXRoLnJvdW5kKHMgKiBtKSAvIG07XG4gICAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBTbGlkZXIocHJvcHM6IFNsaWRlclByb3BzKSB7XG4gICAgY29uc3QgY29udGV4dCA9IGdldENvbnRleHQoKTtcbiAgICBjb25zdCBzdG9yZSA9IGNvbnRleHQuc3RvcmUgYXMge1xuICAgICAgICBpc0FjdGl2ZTogYm9vbGVhbjtcbiAgICAgICAgYWN0aXZlVmFsdWU6IG51bWJlcjtcbiAgICAgICAgYWN0aXZlUHJvcHM6IFNsaWRlclByb3BzO1xuICAgICAgICB0cmFja05vZGU6IEhUTUxFbGVtZW50O1xuICAgICAgICB0aHVtYk5vZGU6IEhUTUxFbGVtZW50O1xuICAgICAgICB3aGVlbFRpbWVvdXRJZDogbnVtYmVyO1xuICAgICAgICB3aGVlbFZhbHVlOiBudW1iZXI7XG4gICAgfTtcblxuICAgIHN0b3JlLmFjdGl2ZVByb3BzID0gcHJvcHM7XG5cbiAgICBmdW5jdGlvbiBvblJvb3RDcmVhdGUocm9vdE5vZGU6IEhUTUxFbGVtZW50KSB7XG4gICAgICAgIHJvb3ROb2RlLmFkZEV2ZW50TGlzdGVuZXIoJ3RvdWNoc3RhcnQnLCBvblBvaW50ZXJEb3duLCB7cGFzc2l2ZTogdHJ1ZX0pO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHNhdmVUcmFja05vZGUoZWw6IEhUTUxFbGVtZW50KSB7XG4gICAgICAgIHN0b3JlLnRyYWNrTm9kZSA9IGVsO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGdldFRyYWNrTm9kZSgpIHtcbiAgICAgICAgcmV0dXJuIHN0b3JlLnRyYWNrTm9kZSBhcyBIVE1MRWxlbWVudDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzYXZlVGh1bWJOb2RlKGVsOiBIVE1MRWxlbWVudCkge1xuICAgICAgICBzdG9yZS50aHVtYk5vZGUgPSBlbDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRUaHVtYk5vZGUoKSB7XG4gICAgICAgIHJldHVybiBzdG9yZS50aHVtYk5vZGUgYXMgSFRNTEVsZW1lbnQ7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gb25Qb2ludGVyRG93bihzdGFydEV2dDogTW91c2VFdmVudCB8IFRvdWNoRXZlbnQpIHtcbiAgICAgICAgaWYgKHN0b3JlLmlzQWN0aXZlKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCB7XG4gICAgICAgICAgICBnZXRDbGllbnRYLFxuICAgICAgICAgICAgcG9pbnRlck1vdmVFdmVudCxcbiAgICAgICAgICAgIHBvaW50ZXJVcEV2ZW50LFxuICAgICAgICB9ID0gKCgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGlzVG91Y2hFdmVudCA9XG4gICAgICAgICAgICAgICAgdHlwZW9mIFRvdWNoRXZlbnQgIT09ICd1bmRlZmluZWQnICYmXG4gICAgICAgICAgICAgICAgc3RhcnRFdnQgaW5zdGFuY2VvZiBUb3VjaEV2ZW50O1xuICAgICAgICAgICAgY29uc3QgdG91Y2hJZCA9IGlzVG91Y2hFdmVudFxuICAgICAgICAgICAgICAgID8gKHN0YXJ0RXZ0IGFzIFRvdWNoRXZlbnQpLmNoYW5nZWRUb3VjaGVzWzBdLmlkZW50aWZpZXJcbiAgICAgICAgICAgICAgICA6IG51bGw7XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIGdldFRvdWNoKGU6IFRvdWNoRXZlbnQpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBmaW5kID0gKHRvdWNoZXM6IFRvdWNoTGlzdCkgPT4gQXJyYXkuZnJvbSh0b3VjaGVzKS5maW5kKCh0KSA9PiB0LmlkZW50aWZpZXIgPT09IHRvdWNoSWQpO1xuICAgICAgICAgICAgICAgIHJldHVybiBmaW5kKGUuY2hhbmdlZFRvdWNoZXMpIHx8IGZpbmQoZS50b3VjaGVzKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZnVuY3Rpb24gZ2V0Q2xpZW50WChlOiBNb3VzZUV2ZW50IHwgVG91Y2hFdmVudCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHtjbGllbnRYfSA9IGlzVG91Y2hFdmVudFxuICAgICAgICAgICAgICAgICAgICA/IGdldFRvdWNoKGUgYXMgVG91Y2hFdmVudClcbiAgICAgICAgICAgICAgICAgICAgOiBlIGFzIE1vdXNlRXZlbnQ7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNsaWVudFg7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IHBvaW50ZXJNb3ZlRXZlbnQgPSBpc1RvdWNoRXZlbnQgPyAndG91Y2htb3ZlJyA6ICdtb3VzZW1vdmUnO1xuICAgICAgICAgICAgY29uc3QgcG9pbnRlclVwRXZlbnQgPSBpc1RvdWNoRXZlbnQgPyAndG91Y2hlbmQnIDogJ21vdXNldXAnO1xuXG4gICAgICAgICAgICByZXR1cm4ge2dldENsaWVudFgsIHBvaW50ZXJNb3ZlRXZlbnQsIHBvaW50ZXJVcEV2ZW50fTtcbiAgICAgICAgfSkoKTtcblxuICAgICAgICBjb25zdCBkeCA9ICgoKSA9PiB7XG4gICAgICAgICAgICBjb25zdCB0aHVtYlJlY3QgPSBnZXRUaHVtYk5vZGUoKS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICAgICAgICAgIGNvbnN0IHN0YXJ0Q2xpZW50WCA9IGdldENsaWVudFgoc3RhcnRFdnQpO1xuICAgICAgICAgICAgY29uc3QgaXNUaHVtYlByZXNzZWQgPSBzdGFydENsaWVudFggPj0gdGh1bWJSZWN0LmxlZnQgJiYgc3RhcnRDbGllbnRYIDw9IHRodW1iUmVjdC5yaWdodDtcbiAgICAgICAgICAgIHJldHVybiBpc1RodW1iUHJlc3NlZCA/ICh0aHVtYlJlY3QubGVmdCArIHRodW1iUmVjdC53aWR0aCAvIDIgLSBzdGFydENsaWVudFgpIDogMDtcbiAgICAgICAgfSkoKTtcblxuICAgICAgICBmdW5jdGlvbiBnZXRFdmVudFZhbHVlKGU6IE1vdXNlRXZlbnQgfCBUb3VjaEV2ZW50KSB7XG4gICAgICAgICAgICBjb25zdCB7bWluLCBtYXh9ID0gc3RvcmUuYWN0aXZlUHJvcHM7XG4gICAgICAgICAgICBjb25zdCBjbGllbnRYID0gZ2V0Q2xpZW50WChlKTtcbiAgICAgICAgICAgIGNvbnN0IHJlY3QgPSBnZXRUcmFja05vZGUoKS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICAgICAgICAgIGNvbnN0IHNjYWxlZCA9IHNjYWxlKGNsaWVudFggKyBkeCwgcmVjdC5sZWZ0LCByZWN0LnJpZ2h0LCBtaW4sIG1heCk7XG4gICAgICAgICAgICBjb25zdCBjbGFtcGVkID0gY2xhbXAoc2NhbGVkLCBtaW4sIG1heCk7XG4gICAgICAgICAgICByZXR1cm4gY2xhbXBlZDtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIG9uUG9pbnRlck1vdmUoZTogTW91c2VFdmVudCB8IFRvdWNoRXZlbnQpIHtcbiAgICAgICAgICAgIGNvbnN0IHZhbHVlID0gZ2V0RXZlbnRWYWx1ZShlKTtcbiAgICAgICAgICAgIHN0b3JlLmFjdGl2ZVZhbHVlID0gdmFsdWU7XG4gICAgICAgICAgICBjb250ZXh0LnJlZnJlc2goKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIG9uUG9pbnRlclVwKGU6IE1vdXNlRXZlbnQgfCBUb3VjaEV2ZW50KSB7XG4gICAgICAgICAgICB1bnN1YnNjcmliZSgpO1xuICAgICAgICAgICAgY29uc3QgdmFsdWUgPSBnZXRFdmVudFZhbHVlKGUpO1xuICAgICAgICAgICAgc3RvcmUuaXNBY3RpdmUgPSBmYWxzZTtcbiAgICAgICAgICAgIGNvbnRleHQucmVmcmVzaCgpO1xuICAgICAgICAgICAgc3RvcmUuYWN0aXZlVmFsdWUgPSBudWxsO1xuXG4gICAgICAgICAgICBjb25zdCB7b25DaGFuZ2UsIHN0ZXB9ID0gc3RvcmUuYWN0aXZlUHJvcHM7XG4gICAgICAgICAgICBvbkNoYW5nZShzdGlja1RvU3RlcCh2YWx1ZSwgc3RlcCkpO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gb25LZXlQcmVzcyhlOiBLZXlib2FyZEV2ZW50KSB7XG4gICAgICAgICAgICBpZiAoZS5rZXkgPT09ICdFc2NhcGUnKSB7XG4gICAgICAgICAgICAgICAgdW5zdWJzY3JpYmUoKTtcbiAgICAgICAgICAgICAgICBzdG9yZS5pc0FjdGl2ZSA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIHN0b3JlLmFjdGl2ZVZhbHVlID0gbnVsbDtcbiAgICAgICAgICAgICAgICBjb250ZXh0LnJlZnJlc2goKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIHN1YnNjcmliZSgpIHtcbiAgICAgICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKHBvaW50ZXJNb3ZlRXZlbnQsIG9uUG9pbnRlck1vdmUsIHtwYXNzaXZlOiB0cnVlfSk7XG4gICAgICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihwb2ludGVyVXBFdmVudCwgb25Qb2ludGVyVXAsIHtwYXNzaXZlOiB0cnVlfSk7XG4gICAgICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigna2V5cHJlc3MnLCBvbktleVByZXNzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIHVuc3Vic2NyaWJlKCkge1xuICAgICAgICAgICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIocG9pbnRlck1vdmVFdmVudCwgb25Qb2ludGVyTW92ZSk7XG4gICAgICAgICAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcihwb2ludGVyVXBFdmVudCwgb25Qb2ludGVyVXApO1xuICAgICAgICAgICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2tleXByZXNzJywgb25LZXlQcmVzcyk7XG4gICAgICAgIH1cblxuICAgICAgICBzdWJzY3JpYmUoKTtcbiAgICAgICAgc3RvcmUuaXNBY3RpdmUgPSB0cnVlO1xuICAgICAgICBzdG9yZS5hY3RpdmVWYWx1ZSA9IGdldEV2ZW50VmFsdWUoc3RhcnRFdnQpO1xuICAgICAgICBjb250ZXh0LnJlZnJlc2goKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRWYWx1ZSgpIHtcbiAgICAgICAgcmV0dXJuIHN0b3JlLmFjdGl2ZVZhbHVlID09IG51bGwgPyBwcm9wcy52YWx1ZSA6IHN0b3JlLmFjdGl2ZVZhbHVlO1xuICAgIH1cblxuICAgIGNvbnN0IHBlcmNlbnQgPSBzY2FsZShnZXRWYWx1ZSgpLCBwcm9wcy5taW4sIHByb3BzLm1heCwgMCwgMTAwKTtcbiAgICBjb25zdCB0aHVtYlBvc2l0aW9uU3R5bGVWYWx1ZSA9IGAke3BlcmNlbnR9JWA7XG4gICAgY29uc3Qgc2hvdWxkRmxpcFRleHQgPSBwZXJjZW50ID4gNzU7XG4gICAgY29uc3QgZm9ybWF0dGVkVmFsdWUgPSBwcm9wcy5mb3JtYXRWYWx1ZShcbiAgICAgICAgc3RpY2tUb1N0ZXAoZ2V0VmFsdWUoKSwgcHJvcHMuc3RlcClcbiAgICApO1xuXG4gICAgZnVuY3Rpb24gc2NhbGVXaGVlbERlbHRhKGRlbHRhOiBudW1iZXIpIHtcbiAgICAgICAgcmV0dXJuIHNjYWxlKGRlbHRhLCAwLCAtMTAwMCwgMCwgcHJvcHMubWF4IC0gcHJvcHMubWluKTtcbiAgICB9XG5cbiAgICBjb25zdCByZWZyZXNoT25XaGVlbCA9IHRocm90dGxlKCgpID0+IHtcbiAgICAgICAgc3RvcmUuYWN0aXZlVmFsdWUgPSBzdGlja1RvU3RlcChzdG9yZS53aGVlbFZhbHVlLCBwcm9wcy5zdGVwKTtcbiAgICAgICAgc3RvcmUud2hlZWxUaW1lb3V0SWQgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHtvbkNoYW5nZX0gPSBzdG9yZS5hY3RpdmVQcm9wcztcbiAgICAgICAgICAgIG9uQ2hhbmdlKHN0b3JlLmFjdGl2ZVZhbHVlKTtcbiAgICAgICAgICAgIHN0b3JlLmlzQWN0aXZlID0gZmFsc2U7XG4gICAgICAgICAgICBzdG9yZS5hY3RpdmVWYWx1ZSA9IG51bGw7XG4gICAgICAgICAgICBzdG9yZS53aGVlbFZhbHVlID0gbnVsbDtcbiAgICAgICAgfSwgNDAwKTtcbiAgICAgICAgY29udGV4dC5yZWZyZXNoKCk7XG4gICAgfSk7XG5cbiAgICBmdW5jdGlvbiBvbldoZWVsKGV2ZW50OiBXaGVlbEV2ZW50KSB7XG4gICAgICAgIGlmIChzdG9yZS53aGVlbFZhbHVlID09IG51bGwpIHtcbiAgICAgICAgICAgIHN0b3JlLndoZWVsVmFsdWUgPSBnZXRWYWx1ZSgpO1xuICAgICAgICB9XG4gICAgICAgIHN0b3JlLmlzQWN0aXZlID0gdHJ1ZTtcbiAgICAgICAgY2xlYXJUaW1lb3V0KHN0b3JlLndoZWVsVGltZW91dElkKTtcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgY29uc3QgYWNjdW11bGF0ZWRWYWx1ZSA9IHN0b3JlLndoZWVsVmFsdWUgKyBzY2FsZVdoZWVsRGVsdGEoZXZlbnQuZGVsdGFZKTtcbiAgICAgICAgc3RvcmUud2hlZWxWYWx1ZSA9IGNsYW1wKGFjY3VtdWxhdGVkVmFsdWUsIHByb3BzLm1pbiwgcHJvcHMubWF4KTtcbiAgICAgICAgcmVmcmVzaE9uV2hlZWwoKTtcbiAgICB9XG5cbiAgICByZXR1cm4gKFxuICAgICAgICA8c3BhblxuICAgICAgICAgICAgY2xhc3M9e3snc2xpZGVyJzogdHJ1ZSwgJ3NsaWRlci0tYWN0aXZlJzogc3RvcmUuaXNBY3RpdmV9fVxuICAgICAgICAgICAgb25jcmVhdGU9e29uUm9vdENyZWF0ZX1cbiAgICAgICAgICAgIG9ubW91c2Vkb3duPXtvblBvaW50ZXJEb3dufVxuICAgICAgICAgICAgb253aGVlbD17b25XaGVlbH1cbiAgICAgICAgPlxuICAgICAgICAgICAgPHNwYW5cbiAgICAgICAgICAgICAgICBjbGFzcz1cInNsaWRlcl9fdHJhY2tcIlxuICAgICAgICAgICAgICAgIG9uY3JlYXRlPXtzYXZlVHJhY2tOb2RlfVxuICAgICAgICAgICAgPlxuICAgICAgICAgICAgICAgIDxzcGFuXG4gICAgICAgICAgICAgICAgICAgIGNsYXNzPVwic2xpZGVyX190cmFja19fZmlsbFwiXG4gICAgICAgICAgICAgICAgICAgIHN0eWxlPXt7d2lkdGg6IHRodW1iUG9zaXRpb25TdHlsZVZhbHVlfX1cbiAgICAgICAgICAgICAgICA+PC9zcGFuPlxuICAgICAgICAgICAgPC9zcGFuPlxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJzbGlkZXJfX3RodW1iLXdyYXBwZXJcIj5cbiAgICAgICAgICAgICAgICA8c3BhblxuICAgICAgICAgICAgICAgICAgICBjbGFzcz1cInNsaWRlcl9fdGh1bWJcIlxuICAgICAgICAgICAgICAgICAgICBvbmNyZWF0ZT17c2F2ZVRodW1iTm9kZX1cbiAgICAgICAgICAgICAgICAgICAgc3R5bGU9e3tsZWZ0OiB0aHVtYlBvc2l0aW9uU3R5bGVWYWx1ZX19XG4gICAgICAgICAgICAgICAgPlxuICAgICAgICAgICAgICAgICAgICA8c3BhblxuICAgICAgICAgICAgICAgICAgICAgICAgY2xhc3M9e3tcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAnc2xpZGVyX190aHVtYl9fdmFsdWUnOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICdzbGlkZXJfX3RodW1iX192YWx1ZS0tZmxpcCc6IHNob3VsZEZsaXBUZXh0LFxuICAgICAgICAgICAgICAgICAgICAgICAgfX1cbiAgICAgICAgICAgICAgICAgICAgPlxuICAgICAgICAgICAgICAgICAgICAgICAge2Zvcm1hdHRlZFZhbHVlfVxuICAgICAgICAgICAgICAgICAgICA8L3NwYW4+XG4gICAgICAgICAgICAgICAgPC9zcGFuPlxuICAgICAgICAgICAgPC9zcGFuPlxuICAgICAgICA8L3NwYW4+XG4gICAgKTtcbn1cbiIsImltcG9ydCB7bX0gZnJvbSAnbWFsZXZpYyc7XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIFRhYih7aXNBY3RpdmV9LCAuLi5jaGlsZHJlbikge1xuXG4gICAgY29uc3QgdGFiQ2xzID0ge1xuICAgICAgICAndGFiLXBhbmVsX190YWInOiB0cnVlLFxuICAgICAgICAndGFiLXBhbmVsX190YWItLWFjdGl2ZSc6IGlzQWN0aXZlXG4gICAgfTtcblxuICAgIHJldHVybiAoXG4gICAgICAgIDxkaXYgY2xhc3M9e3RhYkNsc30+XG4gICAgICAgICAgICB7Y2hpbGRyZW59XG4gICAgICAgIDwvZGl2PlxuICAgICk7XG59XG4iLCJpbXBvcnQge219IGZyb20gJ21hbGV2aWMnO1xuaW1wb3J0IEJ1dHRvbiBmcm9tICcuLi9idXR0b24nO1xuaW1wb3J0IFRhYiBmcm9tICcuL3RhYic7XG5cbmludGVyZmFjZSBUYWJQYW5lbFByb3BzIHtcbiAgICB0YWJzOiB7XG4gICAgICAgIFtuYW1lOiBzdHJpbmddOiBNYWxldmljLkNoaWxkO1xuICAgIH07XG4gICAgdGFiTGFiZWxzOiB7XG4gICAgICAgIFtuYW1lOiBzdHJpbmddOiBzdHJpbmc7XG4gICAgfTtcbiAgICBhY3RpdmVUYWI6IHN0cmluZztcbiAgICBvblN3aXRjaFRhYjogKG5hbWU6IHN0cmluZykgPT4gdm9pZDtcbn1cblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gVGFiUGFuZWwocHJvcHM6IFRhYlBhbmVsUHJvcHMpIHtcblxuICAgIGNvbnN0IHRhYnNOYW1lcyA9IE9iamVjdC5rZXlzKHByb3BzLnRhYnMpO1xuXG4gICAgZnVuY3Rpb24gaXNBY3RpdmVUYWIobmFtZTogc3RyaW5nLCBpbmRleDogbnVtYmVyKSB7XG4gICAgICAgIHJldHVybiAobmFtZSA9PSBudWxsXG4gICAgICAgICAgICA/IGluZGV4ID09PSAwXG4gICAgICAgICAgICA6IG5hbWUgPT09IHByb3BzLmFjdGl2ZVRhYlxuICAgICAgICApO1xuICAgIH1cblxuICAgIGNvbnN0IGJ1dHRvbnMgPSB0YWJzTmFtZXMubWFwKChuYW1lLCBpKSA9PiB7XG4gICAgICAgIGNvbnN0IGJ0bkNscyA9IHtcbiAgICAgICAgICAgICd0YWItcGFuZWxfX2J1dHRvbic6IHRydWUsXG4gICAgICAgICAgICAndGFiLXBhbmVsX19idXR0b24tLWFjdGl2ZSc6IGlzQWN0aXZlVGFiKG5hbWUsIGkpXG4gICAgICAgIH07XG4gICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICA8QnV0dG9uXG4gICAgICAgICAgICAgICAgY2xhc3M9e2J0bkNsc31cbiAgICAgICAgICAgICAgICBvbmNsaWNrPXsoKSA9PiBwcm9wcy5vblN3aXRjaFRhYihuYW1lKX1cbiAgICAgICAgICAgID57cHJvcHMudGFiTGFiZWxzW25hbWVdfTwvQnV0dG9uPlxuICAgICAgICApO1xuICAgIH0pO1xuXG4gICAgY29uc3QgdGFicyA9IHRhYnNOYW1lcy5tYXAoKG5hbWUsIGkpID0+IChcbiAgICAgICAgPFRhYiBpc0FjdGl2ZT17aXNBY3RpdmVUYWIobmFtZSwgaSl9PlxuICAgICAgICAgICAge3Byb3BzLnRhYnNbbmFtZV19XG4gICAgICAgIDwvVGFiPlxuICAgICkpO1xuXG4gICAgcmV0dXJuIChcbiAgICAgICAgPGRpdiBjbGFzcz1cInRhYi1wYW5lbFwiPlxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cInRhYi1wYW5lbF9fYnV0dG9uc1wiPlxuICAgICAgICAgICAgICAgIHtidXR0b25zfVxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwidGFiLXBhbmVsX190YWJzXCI+XG4gICAgICAgICAgICAgICAge3RhYnN9XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgPC9kaXY+XG4gICAgKTtcbn1cbiIsImltcG9ydCB7bX0gZnJvbSAnbWFsZXZpYyc7XG5pbXBvcnQge2dldENvbnRleHR9IGZyb20gJ21hbGV2aWMvZG9tJztcbmltcG9ydCBUZXh0Qm94IGZyb20gJy4uL3RleHRib3gnO1xuaW1wb3J0IFZpcnR1YWxTY3JvbGwgZnJvbSAnLi4vdmlydHVhbC1zY3JvbGwnO1xuXG5pbnRlcmZhY2UgVGV4dExpc3RQcm9wcyB7XG4gICAgdmFsdWVzOiBzdHJpbmdbXTtcbiAgICBwbGFjZWhvbGRlcjogc3RyaW5nO1xuICAgIGlzRm9jdXNlZD86IGJvb2xlYW47XG4gICAgY2xhc3M/OiBzdHJpbmc7XG4gICAgb25DaGFuZ2U6ICh2YWx1ZXM6IHN0cmluZ1tdKSA9PiB2b2lkO1xufVxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBUZXh0TGlzdChwcm9wczogVGV4dExpc3RQcm9wcykge1xuICAgIGNvbnN0IGNvbnRleHQgPSBnZXRDb250ZXh0KCk7XG4gICAgY29udGV4dC5zdG9yZS5pbmRpY2VzID0gY29udGV4dC5zdG9yZS5pbmRpY2VzIHx8IG5ldyBXZWFrTWFwKCk7XG5cbiAgICBmdW5jdGlvbiBvblRleHRDaGFuZ2UoZSkge1xuICAgICAgICBjb25zdCBpbmRleCA9IGNvbnRleHQuc3RvcmUuaW5kaWNlcy5nZXQoZS50YXJnZXQpO1xuICAgICAgICBjb25zdCB2YWx1ZXMgPSBwcm9wcy52YWx1ZXMuc2xpY2UoKTtcbiAgICAgICAgY29uc3QgdmFsdWUgPSBlLnRhcmdldC52YWx1ZS50cmltKCk7XG4gICAgICAgIGlmICh2YWx1ZXMuaW5kZXhPZih2YWx1ZSkgPj0gMCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCF2YWx1ZSkge1xuICAgICAgICAgICAgdmFsdWVzLnNwbGljZShpbmRleCwgMSk7XG4gICAgICAgIH0gZWxzZSBpZiAoaW5kZXggPT09IHZhbHVlcy5sZW5ndGgpIHtcbiAgICAgICAgICAgIHZhbHVlcy5wdXNoKHZhbHVlKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhbHVlcy5zcGxpY2UoaW5kZXgsIDEsIHZhbHVlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHByb3BzLm9uQ2hhbmdlKHZhbHVlcyk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gY3JlYXRlVGV4dEJveCh0ZXh0OiBzdHJpbmcsIGluZGV4OiBudW1iZXIpIHtcbiAgICAgICAgY29uc3Qgc2F2ZUluZGV4ID0gKG5vZGU6IEVsZW1lbnQpID0+IGNvbnRleHQuc3RvcmUuaW5kaWNlcy5zZXQobm9kZSwgaW5kZXgpO1xuICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgPFRleHRCb3hcbiAgICAgICAgICAgICAgICBjbGFzcz1cInRleHQtbGlzdF9fdGV4dGJveFwiXG4gICAgICAgICAgICAgICAgdmFsdWU9e3RleHR9XG4gICAgICAgICAgICAgICAgb25yZW5kZXI9e3NhdmVJbmRleH1cbiAgICAgICAgICAgICAgICBwbGFjZWhvbGRlcj17cHJvcHMucGxhY2Vob2xkZXJ9XG4gICAgICAgICAgICAvPlxuICAgICAgICApO1xuICAgIH1cblxuICAgIGxldCBzaG91bGRGb2N1cyA9IGZhbHNlO1xuXG4gICAgY29uc3Qgbm9kZSA9IGNvbnRleHQubm9kZTtcbiAgICBjb25zdCBwcmV2UHJvcHMgPSBjb250ZXh0LnByZXYgPyBjb250ZXh0LnByZXYucHJvcHMgYXMgVGV4dExpc3RQcm9wcyA6IG51bGw7XG4gICAgaWYgKG5vZGUgJiYgcHJvcHMuaXNGb2N1c2VkICYmIChcbiAgICAgICAgIXByZXZQcm9wcyB8fFxuICAgICAgICAhcHJldlByb3BzLmlzRm9jdXNlZCB8fFxuICAgICAgICBwcmV2UHJvcHMudmFsdWVzLmxlbmd0aCA8IHByb3BzLnZhbHVlcy5sZW5ndGhcbiAgICApKSB7XG4gICAgICAgIGZvY3VzTGFzdE5vZGUoKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBkaWRNb3VudChub2RlOiBFbGVtZW50KSB7XG4gICAgICAgIGNvbnRleHQuc3RvcmUubm9kZSA9IG5vZGU7XG4gICAgICAgIGlmIChwcm9wcy5pc0ZvY3VzZWQpIHtcbiAgICAgICAgICAgIGZvY3VzTGFzdE5vZGUoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGZvY3VzTGFzdE5vZGUoKSB7XG4gICAgICAgIGNvbnN0IG5vZGUgPSBjb250ZXh0LnN0b3JlLm5vZGUgYXMgRWxlbWVudDtcbiAgICAgICAgc2hvdWxkRm9jdXMgPSB0cnVlO1xuICAgICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgaW5wdXRzID0gbm9kZS5xdWVyeVNlbGVjdG9yQWxsKCcudGV4dC1saXN0X190ZXh0Ym94Jyk7XG4gICAgICAgICAgICBjb25zdCBsYXN0ID0gaW5wdXRzLml0ZW0oaW5wdXRzLmxlbmd0aCAtIDEpIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG4gICAgICAgICAgICBsYXN0LmZvY3VzKCk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiAoXG4gICAgICAgIDxWaXJ0dWFsU2Nyb2xsXG4gICAgICAgICAgICByb290PXsoXG4gICAgICAgICAgICAgICAgPGRpdlxuICAgICAgICAgICAgICAgICAgICBjbGFzcz17Wyd0ZXh0LWxpc3QnLCBwcm9wcy5jbGFzc119XG4gICAgICAgICAgICAgICAgICAgIG9uY2hhbmdlPXtvblRleHRDaGFuZ2V9XG4gICAgICAgICAgICAgICAgICAgIG9uY3JlYXRlPXtkaWRNb3VudH1cbiAgICAgICAgICAgICAgICAvPlxuICAgICAgICAgICAgKX1cbiAgICAgICAgICAgIGl0ZW1zPXtwcm9wcy52YWx1ZXNcbiAgICAgICAgICAgICAgICAubWFwKGNyZWF0ZVRleHRCb3gpXG4gICAgICAgICAgICAgICAgLmNvbmNhdChjcmVhdGVUZXh0Qm94KCcnLCBwcm9wcy52YWx1ZXMubGVuZ3RoKSl9XG4gICAgICAgICAgICBzY3JvbGxUb0luZGV4PXtzaG91bGRGb2N1cyA/IHByb3BzLnZhbHVlcy5sZW5ndGggOiAtMX1cbiAgICAgICAgLz5cbiAgICApO1xufVxuIiwiZXhwb3J0IGZ1bmN0aW9uIGdldExvY2FsTWVzc2FnZShtZXNzYWdlTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIGNocm9tZS5pMThuLmdldE1lc3NhZ2UobWVzc2FnZU5hbWUpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0VUlMYW5ndWFnZSgpIHtcbiAgICBjb25zdCBjb2RlID0gY2hyb21lLmkxOG4uZ2V0VUlMYW5ndWFnZSgpO1xuICAgIGlmIChjb2RlLmVuZHNXaXRoKCctbWFjJykpIHtcbiAgICAgICAgcmV0dXJuIGNvZGUuc3Vic3RyaW5nKDAsIGNvZGUubGVuZ3RoIC0gNCk7XG4gICAgfVxuICAgIHJldHVybiBjb2RlO1xufVxuIiwiZXhwb3J0IGZ1bmN0aW9uIHBhcnNlVGltZSgkdGltZTogc3RyaW5nKSB7XG4gICAgY29uc3QgcGFydHMgPSAkdGltZS5zcGxpdCgnOicpLnNsaWNlKDAsIDIpO1xuICAgIGNvbnN0IGxvd2VyY2FzZWQgPSAkdGltZS50cmltKCkudG9Mb3dlckNhc2UoKTtcbiAgICBjb25zdCBpc0FNID0gbG93ZXJjYXNlZC5lbmRzV2l0aCgnYW0nKSB8fCBsb3dlcmNhc2VkLmVuZHNXaXRoKCdhLm0uJyk7XG4gICAgY29uc3QgaXNQTSA9IGxvd2VyY2FzZWQuZW5kc1dpdGgoJ3BtJykgfHwgbG93ZXJjYXNlZC5lbmRzV2l0aCgncC5tLicpO1xuXG4gICAgbGV0IGhvdXJzID0gcGFydHMubGVuZ3RoID4gMCA/IHBhcnNlSW50KHBhcnRzWzBdKSA6IDA7XG4gICAgaWYgKGlzTmFOKGhvdXJzKSB8fCBob3VycyA+IDIzKSB7XG4gICAgICAgIGhvdXJzID0gMDtcbiAgICB9XG4gICAgaWYgKGlzQU0gJiYgaG91cnMgPT09IDEyKSB7XG4gICAgICAgIGhvdXJzID0gMDtcbiAgICB9XG4gICAgaWYgKGlzUE0gJiYgaG91cnMgPCAxMikge1xuICAgICAgICBob3VycyArPSAxMjtcbiAgICB9XG5cbiAgICBsZXQgbWludXRlcyA9IHBhcnRzLmxlbmd0aCA+IDEgPyBwYXJzZUludChwYXJ0c1sxXSkgOiAwO1xuICAgIGlmIChpc05hTihtaW51dGVzKSB8fCBtaW51dGVzID4gNTkpIHtcbiAgICAgICAgbWludXRlcyA9IDA7XG4gICAgfVxuXG4gICAgcmV0dXJuIFtob3VycywgbWludXRlc107XG59XG5cbmZ1bmN0aW9uIHBhcnNlMjRIVGltZSh0aW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGltZS5zcGxpdCgnOicpLm1hcCgoeCkgPT4gcGFyc2VJbnQoeCkpO1xufVxuXG5mdW5jdGlvbiBjb21wYXJlVGltZShhOiBudW1iZXJbXSwgYjogbnVtYmVyW10pIHtcbiAgICBpZiAoYVswXSA9PT0gYlswXSAmJiBhWzFdID09PSBiWzFdKSB7XG4gICAgICAgIHJldHVybiAwO1xuICAgIH1cbiAgICBpZiAoYVswXSA8IGJbMF0gfHwgKGFbMF0gPT09IGJbMF0gJiYgYVsxXSA8IGJbMV0pKSB7XG4gICAgICAgIHJldHVybiAtMTtcbiAgICB9XG4gICAgcmV0dXJuIDE7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0luVGltZUludGVydmFsKGRhdGU6IERhdGUsIHRpbWUwOiBzdHJpbmcsIHRpbWUxOiBzdHJpbmcpIHtcbiAgICBjb25zdCBhID0gcGFyc2UyNEhUaW1lKHRpbWUwKTtcbiAgICBjb25zdCBiID0gcGFyc2UyNEhUaW1lKHRpbWUxKTtcbiAgICBjb25zdCB0ID0gW2RhdGUuZ2V0SG91cnMoKSwgZGF0ZS5nZXRNaW51dGVzKCldO1xuICAgIGlmIChjb21wYXJlVGltZShhLCBiKSA+IDApIHtcbiAgICAgICAgcmV0dXJuIGNvbXBhcmVUaW1lKGEsIHQpIDw9IDAgfHwgY29tcGFyZVRpbWUodCwgYikgPCAwO1xuICAgIH1cbiAgICByZXR1cm4gY29tcGFyZVRpbWUoYSwgdCkgPD0gMCAmJiBjb21wYXJlVGltZSh0LCBiKSA8IDA7XG59XG5cbmludGVyZmFjZSBEdXJhdGlvbiB7XG4gICAgZGF5cz86IG51bWJlcjtcbiAgICBob3Vycz86IG51bWJlcjtcbiAgICBtaW51dGVzPzogbnVtYmVyO1xuICAgIHNlY29uZHM/OiBudW1iZXI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXREdXJhdGlvbih0aW1lOiBEdXJhdGlvbikge1xuICAgIGxldCBkdXJhdGlvbiA9IDA7XG4gICAgaWYgKHRpbWUuc2Vjb25kcykge1xuICAgICAgICBkdXJhdGlvbiArPSB0aW1lLnNlY29uZHMgKiAxMDAwO1xuICAgIH1cbiAgICBpZiAodGltZS5taW51dGVzKSB7XG4gICAgICAgIGR1cmF0aW9uICs9IHRpbWUubWludXRlcyAqIDYwICogMTAwMDtcbiAgICB9XG4gICAgaWYgKHRpbWUuaG91cnMpIHtcbiAgICAgICAgZHVyYXRpb24gKz0gdGltZS5ob3VycyAqIDYwICogNjAgKiAxMDAwO1xuICAgIH1cbiAgICBpZiAodGltZS5kYXlzKSB7XG4gICAgICAgIGR1cmF0aW9uICs9IHRpbWUuZGF5cyAqIDI0ICogNjAgKiA2MCAqIDEwMDA7XG4gICAgfVxuICAgIHJldHVybiBkdXJhdGlvbjtcbn1cblxuZnVuY3Rpb24gZ2V0U3Vuc2V0U3VucmlzZVVUQ1RpbWUoXG4gICAgZGF0ZTogRGF0ZSxcbiAgICBsYXRpdHVkZTogbnVtYmVyLFxuICAgIGxvbmdpdHVkZTogbnVtYmVyLFxuKSB7XG4gICAgY29uc3QgZGVjMzEgPSBuZXcgRGF0ZShkYXRlLmdldFVUQ0Z1bGxZZWFyKCksIDAsIDApO1xuICAgIGNvbnN0IG9uZURheSA9IGdldER1cmF0aW9uKHtkYXlzOiAxfSk7XG4gICAgY29uc3QgZGF5T2ZZZWFyID0gTWF0aC5mbG9vcigoTnVtYmVyKGRhdGUpIC0gTnVtYmVyKGRlYzMxKSkgLyBvbmVEYXkpO1xuXG4gICAgY29uc3QgemVuaXRoID0gOTAuODMzMzMzMzMzMzMzMzM7XG4gICAgY29uc3QgRDJSID0gTWF0aC5QSSAvIDE4MDtcbiAgICBjb25zdCBSMkQgPSAxODAgLyBNYXRoLlBJO1xuXG4gICAgLy8gY29udmVydCB0aGUgbG9uZ2l0dWRlIHRvIGhvdXIgdmFsdWUgYW5kIGNhbGN1bGF0ZSBhbiBhcHByb3hpbWF0ZSB0aW1lXG4gICAgY29uc3QgbG5Ib3VyID0gbG9uZ2l0dWRlIC8gMTU7XG5cbiAgICBmdW5jdGlvbiBnZXRUaW1lKGlzU3VucmlzZTogYm9vbGVhbikge1xuICAgICAgICBjb25zdCB0ID0gZGF5T2ZZZWFyICsgKCgoaXNTdW5yaXNlID8gNiA6IDE4KSAtIGxuSG91cikgLyAyNCk7XG5cbiAgICAgICAgLy8gY2FsY3VsYXRlIHRoZSBTdW4ncyBtZWFuIGFub21hbHlcbiAgICAgICAgY29uc3QgTSA9ICgwLjk4NTYgKiB0KSAtIDMuMjg5O1xuXG4gICAgICAgIC8vIGNhbGN1bGF0ZSB0aGUgU3VuJ3MgdHJ1ZSBsb25naXR1ZGVcbiAgICAgICAgbGV0IEwgPSBNICsgKDEuOTE2ICogTWF0aC5zaW4oTSAqIEQyUikpICsgKDAuMDIwICogTWF0aC5zaW4oMiAqIE0gKiBEMlIpKSArIDI4Mi42MzQ7XG4gICAgICAgIGlmIChMID4gMzYwKSB7XG4gICAgICAgICAgICBMID0gTCAtIDM2MDtcbiAgICAgICAgfSBlbHNlIGlmIChMIDwgMCkge1xuICAgICAgICAgICAgTCA9IEwgKyAzNjA7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBjYWxjdWxhdGUgdGhlIFN1bidzIHJpZ2h0IGFzY2Vuc2lvblxuICAgICAgICBsZXQgUkEgPSBSMkQgKiBNYXRoLmF0YW4oMC45MTc2NCAqIE1hdGgudGFuKEwgKiBEMlIpKTtcbiAgICAgICAgaWYgKFJBID4gMzYwKSB7XG4gICAgICAgICAgICBSQSA9IFJBIC0gMzYwO1xuICAgICAgICB9IGVsc2UgaWYgKFJBIDwgMCkge1xuICAgICAgICAgICAgUkEgPSBSQSArIDM2MDtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHJpZ2h0IGFzY2Vuc2lvbiB2YWx1ZSBuZWVkcyB0byBiZSBpbiB0aGUgc2FtZSBxdWFcbiAgICAgICAgY29uc3QgTHF1YWRyYW50ID0gKE1hdGguZmxvb3IoTCAvICg5MCkpKSAqIDkwO1xuICAgICAgICBjb25zdCBSQXF1YWRyYW50ID0gKE1hdGguZmxvb3IoUkEgLyA5MCkpICogOTA7XG4gICAgICAgIFJBID0gUkEgKyAoTHF1YWRyYW50IC0gUkFxdWFkcmFudCk7XG5cbiAgICAgICAgLy8gcmlnaHQgYXNjZW5zaW9uIHZhbHVlIG5lZWRzIHRvIGJlIGNvbnZlcnRlZCBpbnRvIGhvdXJzXG4gICAgICAgIFJBID0gUkEgLyAxNTtcblxuICAgICAgICAvLyBjYWxjdWxhdGUgdGhlIFN1bidzIGRlY2xpbmF0aW9uXG4gICAgICAgIGNvbnN0IHNpbkRlYyA9IDAuMzk3ODIgKiBNYXRoLnNpbihMICogRDJSKTtcbiAgICAgICAgY29uc3QgY29zRGVjID0gTWF0aC5jb3MoTWF0aC5hc2luKHNpbkRlYykpO1xuXG4gICAgICAgIC8vIGNhbGN1bGF0ZSB0aGUgU3VuJ3MgbG9jYWwgaG91ciBhbmdsZVxuICAgICAgICBjb25zdCBjb3NIID0gKE1hdGguY29zKHplbml0aCAqIEQyUikgLSAoc2luRGVjICogTWF0aC5zaW4obGF0aXR1ZGUgKiBEMlIpKSkgLyAoY29zRGVjICogTWF0aC5jb3MobGF0aXR1ZGUgKiBEMlIpKTtcbiAgICAgICAgaWYgKGNvc0ggPiAxKSB7XG4gICAgICAgICAgICAvLyBhbHdheXMgbmlnaHRcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgYWx3YXlzRGF5OiBmYWxzZSxcbiAgICAgICAgICAgICAgICBhbHdheXNOaWdodDogdHJ1ZSxcbiAgICAgICAgICAgICAgICB0aW1lOiAwLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBlbHNlIGlmIChjb3NIIDwgLTEpIHtcbiAgICAgICAgICAgIC8vIGFsd2F5cyBkYXlcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgYWx3YXlzRGF5OiB0cnVlLFxuICAgICAgICAgICAgICAgIGFsd2F5c05pZ2h0OiBmYWxzZSxcbiAgICAgICAgICAgICAgICB0aW1lOiAwLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IEggPSAoaXNTdW5yaXNlID8gKDM2MCAtIFIyRCAqIE1hdGguYWNvcyhjb3NIKSkgOiAoUjJEICogTWF0aC5hY29zKGNvc0gpKSkgLyAxNTtcblxuICAgICAgICAvLyBjYWxjdWxhdGUgbG9jYWwgbWVhbiB0aW1lIG9mIHJpc2luZy9zZXR0aW5nXG4gICAgICAgIGNvbnN0IFQgPSBIICsgUkEgLSAoMC4wNjU3MSAqIHQpIC0gNi42MjI7XG5cbiAgICAgICAgLy8gYWRqdXN0IGJhY2sgdG8gVVRDXG4gICAgICAgIGxldCBVVCA9IFQgLSBsbkhvdXI7XG4gICAgICAgIGlmIChVVCA+IDI0KSB7XG4gICAgICAgICAgICBVVCA9IFVUIC0gMjQ7XG4gICAgICAgIH0gZWxzZSBpZiAoVVQgPCAwKSB7XG4gICAgICAgICAgICBVVCA9IFVUICsgMjQ7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBjb252ZXJ0IHRvIG1pbGxpc2Vjb25kc1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgYWx3YXlzRGF5OiBmYWxzZSxcbiAgICAgICAgICAgIGFsd2F5c05pZ2h0OiBmYWxzZSxcbiAgICAgICAgICAgIHRpbWU6IFVUICogZ2V0RHVyYXRpb24oe2hvdXJzOiAxfSksXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc3Qgc3VucmlzZVRpbWUgPSBnZXRUaW1lKHRydWUpO1xuICAgIGNvbnN0IHN1bnNldFRpbWUgPSBnZXRUaW1lKGZhbHNlKTtcblxuICAgIGlmIChzdW5yaXNlVGltZS5hbHdheXNEYXkgfHwgc3Vuc2V0VGltZS5hbHdheXNEYXkpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGFsd2F5c0RheTogdHJ1ZVxuICAgICAgICB9O1xuICAgIH0gZWxzZSBpZiAoc3VucmlzZVRpbWUuYWx3YXlzTmlnaHQgfHwgc3Vuc2V0VGltZS5hbHdheXNOaWdodCkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgYWx3YXlzTmlnaHQ6IHRydWVcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBzdW5yaXNlVGltZTogc3VucmlzZVRpbWUudGltZSxcbiAgICAgICAgc3Vuc2V0VGltZTogc3Vuc2V0VGltZS50aW1lXG4gICAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzTmlnaHRBdExvY2F0aW9uKFxuICAgIGRhdGU6IERhdGUsXG4gICAgbGF0aXR1ZGU6IG51bWJlcixcbiAgICBsb25naXR1ZGU6IG51bWJlcixcbikge1xuICAgIGNvbnN0IHRpbWUgPSBnZXRTdW5zZXRTdW5yaXNlVVRDVGltZShkYXRlLCBsYXRpdHVkZSwgbG9uZ2l0dWRlKTtcblxuICAgIGlmICh0aW1lLmFsd2F5c0RheSkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfSBlbHNlIGlmICh0aW1lLmFsd2F5c05pZ2h0KSB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIGNvbnN0IHN1bnJpc2VUaW1lID0gdGltZS5zdW5yaXNlVGltZTtcbiAgICBjb25zdCBzdW5zZXRUaW1lID0gdGltZS5zdW5zZXRUaW1lO1xuICAgIGNvbnN0IGN1cnJlbnRUaW1lID0gKFxuICAgICAgICBkYXRlLmdldFVUQ0hvdXJzKCkgKiBnZXREdXJhdGlvbih7aG91cnM6IDF9KSArXG4gICAgICAgIGRhdGUuZ2V0VVRDTWludXRlcygpICogZ2V0RHVyYXRpb24oe21pbnV0ZXM6IDF9KSArXG4gICAgICAgIGRhdGUuZ2V0VVRDU2Vjb25kcygpICogZ2V0RHVyYXRpb24oe3NlY29uZHM6IDF9KVxuICAgICk7XG5cbiAgICBpZiAoc3Vuc2V0VGltZSA+IHN1bnJpc2VUaW1lKSB7XG4gICAgICAgIHJldHVybiAoY3VycmVudFRpbWUgPiBzdW5zZXRUaW1lKSB8fCAoY3VycmVudFRpbWUgPCBzdW5yaXNlVGltZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIChjdXJyZW50VGltZSA+IHN1bnNldFRpbWUpICYmIChjdXJyZW50VGltZSA8IHN1bnJpc2VUaW1lKTtcbiAgICB9XG59XG4iLCJpbXBvcnQge219IGZyb20gJ21hbGV2aWMnO1xuaW1wb3J0IFRleHRCb3ggZnJvbSAnLi4vdGV4dGJveCc7XG5pbXBvcnQge2dldFVJTGFuZ3VhZ2V9IGZyb20gJy4uLy4uLy4uL3V0aWxzL2xvY2FsZXMnO1xuaW1wb3J0IHtwYXJzZVRpbWV9IGZyb20gJy4uLy4uLy4uL3V0aWxzL3RpbWUnO1xuXG5pbnRlcmZhY2UgVGltZVBpY2tlclByb3BzIHtcbiAgICBzdGFydFRpbWU6IHN0cmluZztcbiAgICBlbmRUaW1lOiBzdHJpbmc7XG4gICAgb25DaGFuZ2U6IChbc3RhcnQsIGVuZF06IFtzdHJpbmcsIHN0cmluZ10pID0+IHZvaWQ7XG59XG5cbmNvbnN0IGlzMTJIID0gKG5ldyBEYXRlKCkpLnRvTG9jYWxlVGltZVN0cmluZyhnZXRVSUxhbmd1YWdlKCkpLmVuZHNXaXRoKCdNJyk7XG5cbmZ1bmN0aW9uIHRvTG9jYWxlVGltZSgkdGltZTogc3RyaW5nKSB7XG4gICAgY29uc3QgW2hvdXJzLCBtaW51dGVzXSA9IHBhcnNlVGltZSgkdGltZSk7XG5cbiAgICBjb25zdCBtbSA9IGAke21pbnV0ZXMgPCAxMCA/ICcwJyA6ICcnfSR7bWludXRlc31gO1xuXG4gICAgaWYgKGlzMTJIKSB7XG4gICAgICAgIGNvbnN0IGggPSAoaG91cnMgPT09IDAgP1xuICAgICAgICAgICAgJzEyJyA6XG4gICAgICAgICAgICBob3VycyA+IDEyID9cbiAgICAgICAgICAgICAgICAoaG91cnMgLSAxMikgOlxuICAgICAgICAgICAgICAgIGhvdXJzKTtcbiAgICAgICAgcmV0dXJuIGAke2h9OiR7bW19JHtob3VycyA8IDEyID8gJ0FNJyA6ICdQTSd9YDtcbiAgICB9XG5cbiAgICByZXR1cm4gYCR7aG91cnN9OiR7bW19YDtcbn1cblxuZnVuY3Rpb24gdG8yNEhUaW1lKCR0aW1lOiBzdHJpbmcpIHtcbiAgICBjb25zdCBbaG91cnMsIG1pbnV0ZXNdID0gcGFyc2VUaW1lKCR0aW1lKTtcbiAgICBjb25zdCBtbSA9IGAke21pbnV0ZXMgPCAxMCA/ICcwJyA6ICcnfSR7bWludXRlc31gO1xuICAgIHJldHVybiBgJHtob3Vyc306JHttbX1gO1xufVxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBUaW1lUmFuZ2VQaWNrZXIocHJvcHM6IFRpbWVQaWNrZXJQcm9wcykge1xuICAgIGZ1bmN0aW9uIG9uU3RhcnRUaW1lQ2hhbmdlKCRzdGFydFRpbWU6IHN0cmluZykge1xuICAgICAgICBwcm9wcy5vbkNoYW5nZShbdG8yNEhUaW1lKCRzdGFydFRpbWUpLCBwcm9wcy5lbmRUaW1lXSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gb25FbmRUaW1lQ2hhbmdlKCRlbmRUaW1lOiBzdHJpbmcpIHtcbiAgICAgICAgcHJvcHMub25DaGFuZ2UoW3Byb3BzLnN0YXJ0VGltZSwgdG8yNEhUaW1lKCRlbmRUaW1lKV0pO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHNldFN0YXJ0VGltZShub2RlOiBIVE1MSW5wdXRFbGVtZW50KSB7XG4gICAgICAgIG5vZGUudmFsdWUgPSB0b0xvY2FsZVRpbWUocHJvcHMuc3RhcnRUaW1lKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzZXRFbmRUaW1lKG5vZGU6IEhUTUxJbnB1dEVsZW1lbnQpIHtcbiAgICAgICAgbm9kZS52YWx1ZSA9IHRvTG9jYWxlVGltZShwcm9wcy5lbmRUaW1lKTtcbiAgICB9XG5cbiAgICByZXR1cm4gKFxuICAgICAgICA8c3BhbiBjbGFzcz1cInRpbWUtcmFuZ2UtcGlja2VyXCI+XG4gICAgICAgICAgICA8VGV4dEJveFxuICAgICAgICAgICAgICAgIGNsYXNzPVwidGltZS1yYW5nZS1waWNrZXJfX2lucHV0IHRpbWUtcmFuZ2UtcGlja2VyX19pbnB1dC0tc3RhcnRcIlxuICAgICAgICAgICAgICAgIHBsYWNlaG9sZGVyPXt0b0xvY2FsZVRpbWUoJzE4OjAwJyl9XG4gICAgICAgICAgICAgICAgb25yZW5kZXI9e3NldFN0YXJ0VGltZX1cbiAgICAgICAgICAgICAgICBvbmNoYW5nZT17KGUpID0+IG9uU3RhcnRUaW1lQ2hhbmdlKChlLnRhcmdldCBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZSl9XG4gICAgICAgICAgICAgICAgb25rZXlwcmVzcz17KGUpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGUua2V5ID09PSAnRW50ZXInKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBpbnB1dCA9IGUudGFyZ2V0IGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG4gICAgICAgICAgICAgICAgICAgICAgICBpbnB1dC5ibHVyKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBvblN0YXJ0VGltZUNoYW5nZShpbnB1dC52YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9fVxuXG4gICAgICAgICAgICAvPlxuICAgICAgICAgICAgPFRleHRCb3hcbiAgICAgICAgICAgICAgICBjbGFzcz1cInRpbWUtcmFuZ2UtcGlja2VyX19pbnB1dCB0aW1lLXJhbmdlLXBpY2tlcl9faW5wdXQtLWVuZFwiXG4gICAgICAgICAgICAgICAgcGxhY2Vob2xkZXI9e3RvTG9jYWxlVGltZSgnOTowMCcpfVxuICAgICAgICAgICAgICAgIG9ucmVuZGVyPXtzZXRFbmRUaW1lfVxuICAgICAgICAgICAgICAgIG9uY2hhbmdlPXsoZSkgPT4gb25FbmRUaW1lQ2hhbmdlKChlLnRhcmdldCBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZSl9XG4gICAgICAgICAgICAgICAgb25rZXlwcmVzcz17KGUpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGUua2V5ID09PSAnRW50ZXInKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBpbnB1dCA9IGUudGFyZ2V0IGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG4gICAgICAgICAgICAgICAgICAgICAgICBpbnB1dC5ibHVyKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBvbkVuZFRpbWVDaGFuZ2UoaW5wdXQudmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfX1cbiAgICAgICAgICAgIC8+XG4gICAgICAgIDwvc3Bhbj5cbiAgICApO1xufVxuIiwiaW1wb3J0IHttLCBDaGlsZH0gZnJvbSAnbWFsZXZpYyc7XG5cbmludGVyZmFjZSBUb2dnbGVQcm9wcyB7XG4gICAgY2hlY2tlZDogYm9vbGVhbjtcbiAgICBjbGFzcz86IHN0cmluZztcbiAgICBsYWJlbE9uOiBDaGlsZDtcbiAgICBsYWJlbE9mZjogQ2hpbGQ7XG4gICAgb25DaGFuZ2U6IChjaGVja2VkOiBib29sZWFuKSA9PiB2b2lkO1xufVxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBUb2dnbGUocHJvcHM6IFRvZ2dsZVByb3BzKSB7XG4gICAgY29uc3Qge2NoZWNrZWQsIG9uQ2hhbmdlfSA9IHByb3BzO1xuXG4gICAgY29uc3QgY2xzID0gW1xuICAgICAgICAndG9nZ2xlJyxcbiAgICAgICAgY2hlY2tlZCA/ICd0b2dnbGUtLWNoZWNrZWQnIDogbnVsbCxcbiAgICAgICAgcHJvcHMuY2xhc3MsXG4gICAgXTtcblxuICAgIGNvbnN0IGNsc09uID0ge1xuICAgICAgICAndG9nZ2xlX19idG4nOiB0cnVlLFxuICAgICAgICAndG9nZ2xlX19vbic6IHRydWUsXG4gICAgICAgICd0b2dnbGVfX2J0bi0tYWN0aXZlJzogY2hlY2tlZFxuICAgIH07XG5cbiAgICBjb25zdCBjbHNPZmYgPSB7XG4gICAgICAgICd0b2dnbGVfX2J0bic6IHRydWUsXG4gICAgICAgICd0b2dnbGVfX29mZic6IHRydWUsXG4gICAgICAgICd0b2dnbGVfX2J0bi0tYWN0aXZlJzogIWNoZWNrZWRcbiAgICB9O1xuXG4gICAgcmV0dXJuIChcbiAgICAgICAgPHNwYW4gY2xhc3M9e2Nsc30+XG4gICAgICAgICAgICA8c3BhblxuICAgICAgICAgICAgICAgIGNsYXNzPXtjbHNPbn1cbiAgICAgICAgICAgICAgICBvbmNsaWNrPXtvbkNoYW5nZSA/ICgpID0+ICFjaGVja2VkICYmIG9uQ2hhbmdlKHRydWUpIDogbnVsbH1cbiAgICAgICAgICAgID5cbiAgICAgICAgICAgICAgICB7cHJvcHMubGFiZWxPbn1cbiAgICAgICAgICAgIDwvc3Bhbj5cbiAgICAgICAgICAgIDxzcGFuXG4gICAgICAgICAgICAgICAgY2xhc3M9e2Nsc09mZn1cbiAgICAgICAgICAgICAgICBvbmNsaWNrPXtvbkNoYW5nZSA/ICgpID0+IGNoZWNrZWQgJiYgb25DaGFuZ2UoZmFsc2UpIDogbnVsbH1cbiAgICAgICAgICAgID5cbiAgICAgICAgICAgICAgICB7cHJvcHMubGFiZWxPZmZ9XG4gICAgICAgICAgICA8L3NwYW4+XG4gICAgICAgIDwvc3Bhbj5cbiAgICApO1xufVxuIiwiaW1wb3J0IHttfSBmcm9tICdtYWxldmljJztcblxuaW50ZXJmYWNlIFRyYWNrUHJvcHMge1xuICAgIHZhbHVlOiBudW1iZXI7XG4gICAgbGFiZWw6IHN0cmluZztcbiAgICBvbkNoYW5nZT86ICh2YWx1ZTogbnVtYmVyKSA9PiB2b2lkO1xufVxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBUcmFjayhwcm9wczogVHJhY2tQcm9wcykge1xuICAgIGNvbnN0IHZhbHVlU3R5bGUgPSB7J3dpZHRoJzogYCR7cHJvcHMudmFsdWUgKiAxMDB9JWB9O1xuICAgIGNvbnN0IGlzQ2xpY2thYmxlID0gcHJvcHMub25DaGFuZ2UgIT0gbnVsbDtcblxuICAgIGZ1bmN0aW9uIG9uTW91c2VEb3duKGU6IE1vdXNlRXZlbnQpIHtcbiAgICAgICAgY29uc3QgdGFyZ2V0Tm9kZSA9IGUuY3VycmVudFRhcmdldCBhcyBIVE1MRWxlbWVudDtcbiAgICAgICAgY29uc3QgdmFsdWVOb2RlID0gdGFyZ2V0Tm9kZS5maXJzdEVsZW1lbnRDaGlsZCBhcyBIVE1MRWxlbWVudDtcbiAgICAgICAgdGFyZ2V0Tm9kZS5jbGFzc0xpc3QuYWRkKCd0cmFjay0tYWN0aXZlJyk7XG5cbiAgICAgICAgZnVuY3Rpb24gZ2V0VmFsdWUoY2xpZW50WDogbnVtYmVyKSB7XG4gICAgICAgICAgICBjb25zdCByZWN0ID0gdGFyZ2V0Tm9kZS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICAgICAgICAgIHJldHVybiAoY2xpZW50WCAtIHJlY3QubGVmdCkgLyByZWN0LndpZHRoO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gc2V0V2lkdGgodmFsdWU6IG51bWJlcikge1xuICAgICAgICAgICAgdmFsdWVOb2RlLnN0eWxlLndpZHRoID0gYCR7dmFsdWUgKiAxMDB9JWA7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBvbk1vdXNlTW92ZShlOiBNb3VzZUV2ZW50KSB7XG4gICAgICAgICAgICBjb25zdCB2YWx1ZSA9IGdldFZhbHVlKGUuY2xpZW50WCk7XG4gICAgICAgICAgICBzZXRXaWR0aCh2YWx1ZSk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBvbk1vdXNlVXAoZTogTW91c2VFdmVudCkge1xuICAgICAgICAgICAgY29uc3QgdmFsdWUgPSBnZXRWYWx1ZShlLmNsaWVudFgpO1xuICAgICAgICAgICAgcHJvcHMub25DaGFuZ2UodmFsdWUpO1xuICAgICAgICAgICAgY2xlYW51cCgpO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gb25LZXlQcmVzcyhlOiBLZXlib2FyZEV2ZW50KSB7XG4gICAgICAgICAgICBpZiAoZS5rZXkgPT09ICdFc2NhcGUnKSB7XG4gICAgICAgICAgICAgICAgc2V0V2lkdGgocHJvcHMudmFsdWUpO1xuICAgICAgICAgICAgICAgIGNsZWFudXAoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGNsZWFudXAoKSB7XG4gICAgICAgICAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcignbW91c2Vtb3ZlJywgb25Nb3VzZU1vdmUpO1xuICAgICAgICAgICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21vdXNldXAnLCBvbk1vdXNlVXApO1xuICAgICAgICAgICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2tleXByZXNzJywgb25LZXlQcmVzcyk7XG4gICAgICAgICAgICB0YXJnZXROb2RlLmNsYXNzTGlzdC5yZW1vdmUoJ3RyYWNrLS1hY3RpdmUnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdtb3VzZW1vdmUnLCBvbk1vdXNlTW92ZSk7XG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdtb3VzZXVwJywgb25Nb3VzZVVwKTtcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2tleXByZXNzJywgb25LZXlQcmVzcyk7XG5cbiAgICAgICAgY29uc3QgdmFsdWUgPSBnZXRWYWx1ZShlLmNsaWVudFgpO1xuICAgICAgICBzZXRXaWR0aCh2YWx1ZSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIChcbiAgICAgICAgPHNwYW5cbiAgICAgICAgICAgIGNsYXNzPXt7XG4gICAgICAgICAgICAgICAgJ3RyYWNrJzogdHJ1ZSxcbiAgICAgICAgICAgICAgICAndHJhY2stLWNsaWNrYWJsZSc6IEJvb2xlYW4ocHJvcHMub25DaGFuZ2UpLFxuICAgICAgICAgICAgfX1cbiAgICAgICAgICAgIG9ubW91c2Vkb3duPXtpc0NsaWNrYWJsZSA/IG9uTW91c2VEb3duIDogbnVsbH1cbiAgICAgICAgPlxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJ0cmFja19fdmFsdWVcIiBzdHlsZT17dmFsdWVTdHlsZX0+PC9zcGFuPlxuICAgICAgICAgICAgPGxhYmVsIGNsYXNzPVwidHJhY2tfX2xhYmVsXCI+XG4gICAgICAgICAgICAgICAge3Byb3BzLmxhYmVsfVxuICAgICAgICAgICAgPC9sYWJlbD5cbiAgICAgICAgPC9zcGFuID5cbiAgICApO1xufVxuIiwiaW1wb3J0IHttfSBmcm9tICdtYWxldmljJztcbmltcG9ydCBCdXR0b24gZnJvbSAnLi4vYnV0dG9uJztcbmltcG9ydCBUcmFjayBmcm9tICcuL3RyYWNrJztcbmltcG9ydCB7Z2V0TG9jYWxNZXNzYWdlfSBmcm9tICcuLi8uLi8uLi91dGlscy9sb2NhbGVzJztcblxuaW50ZXJmYWNlIFVwRG93blByb3BzIHtcbiAgICB2YWx1ZTogbnVtYmVyO1xuICAgIG1pbjogbnVtYmVyO1xuICAgIG1heDogbnVtYmVyO1xuICAgIHN0ZXA6IG51bWJlcjtcbiAgICBkZWZhdWx0OiBudW1iZXI7XG4gICAgbmFtZTogc3RyaW5nO1xuICAgIG9uQ2hhbmdlOiAodmFsdWU6IG51bWJlcikgPT4gdm9pZDtcbn1cblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gVXBEb3duKHByb3BzOiBVcERvd25Qcm9wcykge1xuXG4gICAgY29uc3QgYnV0dG9uRG93bkNscyA9IHtcbiAgICAgICAgJ3VwZG93bl9fYnV0dG9uJzogdHJ1ZSxcbiAgICAgICAgJ3VwZG93bl9fYnV0dG9uLS1kaXNhYmxlZCc6IHByb3BzLnZhbHVlID09PSBwcm9wcy5taW5cbiAgICB9O1xuXG4gICAgY29uc3QgYnV0dG9uVXBDbHMgPSB7XG4gICAgICAgICd1cGRvd25fX2J1dHRvbic6IHRydWUsXG4gICAgICAgICd1cGRvd25fX2J1dHRvbi0tZGlzYWJsZWQnOiBwcm9wcy52YWx1ZSA9PT0gcHJvcHMubWF4XG4gICAgfTtcblxuICAgIGZ1bmN0aW9uIG5vcm1hbGl6ZSh4OiBudW1iZXIpIHtcbiAgICAgICAgY29uc3QgcyA9IE1hdGgucm91bmQoeCAvIHByb3BzLnN0ZXApICogcHJvcHMuc3RlcDtcbiAgICAgICAgY29uc3QgZXhwID0gTWF0aC5mbG9vcihNYXRoLmxvZzEwKHByb3BzLnN0ZXApKTtcbiAgICAgICAgaWYgKGV4cCA+PSAwKSB7XG4gICAgICAgICAgICBjb25zdCBtID0gTWF0aC5wb3coMTAsIGV4cCk7XG4gICAgICAgICAgICByZXR1cm4gTWF0aC5yb3VuZChzIC8gbSkgKiBtO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3QgbSA9IE1hdGgucG93KDEwLCAtZXhwKTtcbiAgICAgICAgICAgIHJldHVybiBNYXRoLnJvdW5kKHMgKiBtKSAvIG07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjbGFtcCh4OiBudW1iZXIpIHtcbiAgICAgICAgcmV0dXJuIE1hdGgubWF4KHByb3BzLm1pbiwgTWF0aC5taW4ocHJvcHMubWF4LCB4KSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gb25CdXR0b25Eb3duQ2xpY2soKSB7XG4gICAgICAgIHByb3BzLm9uQ2hhbmdlKGNsYW1wKG5vcm1hbGl6ZShwcm9wcy52YWx1ZSAtIHByb3BzLnN0ZXApKSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gb25CdXR0b25VcENsaWNrKCkge1xuICAgICAgICBwcm9wcy5vbkNoYW5nZShjbGFtcChub3JtYWxpemUocHJvcHMudmFsdWUgKyBwcm9wcy5zdGVwKSkpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIG9uVHJhY2tWYWx1ZUNoYW5nZSh0cmFja1ZhbHVlOiBudW1iZXIpIHtcbiAgICAgICAgcHJvcHMub25DaGFuZ2UoY2xhbXAobm9ybWFsaXplKHRyYWNrVmFsdWUgKiAocHJvcHMubWF4IC0gcHJvcHMubWluKSArIHByb3BzLm1pbikpKTtcbiAgICB9XG5cbiAgICBjb25zdCB0cmFja1ZhbHVlID0gKHByb3BzLnZhbHVlIC0gcHJvcHMubWluKSAvIChwcm9wcy5tYXggLSBwcm9wcy5taW4pO1xuICAgIGNvbnN0IHZhbHVlVGV4dCA9IChwcm9wcy52YWx1ZSA9PT0gcHJvcHMuZGVmYXVsdFxuICAgICAgICA/IGdldExvY2FsTWVzc2FnZSgnb2ZmJykudG9Mb2NhbGVMb3dlckNhc2UoKVxuICAgICAgICA6IHByb3BzLnZhbHVlID4gcHJvcHMuZGVmYXVsdFxuICAgICAgICAgICAgPyBgKyR7bm9ybWFsaXplKHByb3BzLnZhbHVlIC0gcHJvcHMuZGVmYXVsdCl9YFxuICAgICAgICAgICAgOiBgLSR7bm9ybWFsaXplKHByb3BzLmRlZmF1bHQgLSBwcm9wcy52YWx1ZSl9YFxuICAgICk7XG5cbiAgICByZXR1cm4gKFxuICAgICAgICA8ZGl2IGNsYXNzPVwidXBkb3duXCI+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwidXBkb3duX19saW5lXCI+XG4gICAgICAgICAgICAgICAgPEJ1dHRvbiBjbGFzcz17YnV0dG9uRG93bkNsc30gb25jbGljaz17b25CdXR0b25Eb3duQ2xpY2t9ID5cbiAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJ1cGRvd25fX2ljb24gdXBkb3duX19pY29uLWRvd25cIj48L3NwYW4+XG4gICAgICAgICAgICAgICAgPC9CdXR0b24+XG4gICAgICAgICAgICAgICAgPFRyYWNrXG4gICAgICAgICAgICAgICAgICAgIHZhbHVlPXt0cmFja1ZhbHVlfVxuICAgICAgICAgICAgICAgICAgICBsYWJlbD17cHJvcHMubmFtZX1cbiAgICAgICAgICAgICAgICAgICAgb25DaGFuZ2U9e29uVHJhY2tWYWx1ZUNoYW5nZX1cbiAgICAgICAgICAgICAgICAvPlxuICAgICAgICAgICAgICAgIDxCdXR0b24gY2xhc3M9e2J1dHRvblVwQ2xzfSBvbmNsaWNrPXtvbkJ1dHRvblVwQ2xpY2t9ID5cbiAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJ1cGRvd25fX2ljb24gdXBkb3duX19pY29uLXVwXCI+PC9zcGFuPlxuICAgICAgICAgICAgICAgIDwvQnV0dG9uPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8bGFiZWwgY2xhc3M9XCJ1cGRvd25fX3ZhbHVlLXRleHRcIj5cbiAgICAgICAgICAgICAgICB7dmFsdWVUZXh0fVxuICAgICAgICAgICAgPC9sYWJlbD5cbiAgICAgICAgPC9kaXY+XG4gICAgKTtcbn1cbiIsImltcG9ydCB7bX0gZnJvbSAnbWFsZXZpYyc7XG5pbXBvcnQge0J1dHRvbn0gZnJvbSAnLi4vLi4vLi4vY29udHJvbHMnO1xuaW1wb3J0IHtnZXRVUkxIb3N0T3JQcm90b2NvbCwgaXNVUkxJbkxpc3R9IGZyb20gJy4uLy4uLy4uLy4uL3V0aWxzL3VybCc7XG5pbXBvcnQge2dldExvY2FsTWVzc2FnZX0gZnJvbSAnLi4vLi4vLi4vLi4vdXRpbHMvbG9jYWxlcyc7XG5pbXBvcnQge0V4dFdyYXBwZXIsIFRhYkluZm99IGZyb20gJy4uLy4uLy4uLy4uL2RlZmluaXRpb25zJztcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gQ3VzdG9tU2V0dGluZ3NUb2dnbGUoe2RhdGEsIHRhYiwgYWN0aW9uc306IEV4dFdyYXBwZXIgJiB7dGFiOiBUYWJJbmZvfSkge1xuICAgIGNvbnN0IGhvc3QgPSBnZXRVUkxIb3N0T3JQcm90b2NvbCh0YWIudXJsKTtcblxuICAgIGNvbnN0IGlzQ3VzdG9tID0gZGF0YS5zZXR0aW5ncy5jdXN0b21UaGVtZXMuc29tZSgoe3VybH0pID0+IGlzVVJMSW5MaXN0KHRhYi51cmwsIHVybCkpO1xuXG4gICAgY29uc3QgdXJsVGV4dCA9IGhvc3RcbiAgICAgICAgLnNwbGl0KCcuJylcbiAgICAgICAgLnJlZHVjZSgoZWxlbWVudHMsIHBhcnQsIGkpID0+IGVsZW1lbnRzLmNvbmNhdChcbiAgICAgICAgICAgIDx3YnIgLz4sXG4gICAgICAgICAgICBgJHtpID4gMCA/ICcuJyA6ICcnfSR7cGFydH1gXG4gICAgICAgICksIFtdKTtcblxuICAgIHJldHVybiAoXG4gICAgICAgIDxCdXR0b25cbiAgICAgICAgICAgIGNsYXNzPXt7XG4gICAgICAgICAgICAgICAgJ2N1c3RvbS1zZXR0aW5ncy10b2dnbGUnOiB0cnVlLFxuICAgICAgICAgICAgICAgICdjdXN0b20tc2V0dGluZ3MtdG9nZ2xlLS1jaGVja2VkJzogaXNDdXN0b20sXG4gICAgICAgICAgICAgICAgJ2N1c3RvbS1zZXR0aW5ncy10b2dnbGUtLWRpc2FibGVkJzogdGFiLmlzUHJvdGVjdGVkLFxuICAgICAgICAgICAgfX1cbiAgICAgICAgICAgIG9uY2xpY2s9eyhlKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGlzQ3VzdG9tKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGZpbHRlcmVkID0gZGF0YS5zZXR0aW5ncy5jdXN0b21UaGVtZXMuZmlsdGVyKCh7dXJsfSkgPT4gIWlzVVJMSW5MaXN0KHRhYi51cmwsIHVybCkpO1xuICAgICAgICAgICAgICAgICAgICBhY3Rpb25zLmNoYW5nZVNldHRpbmdzKHtjdXN0b21UaGVtZXM6IGZpbHRlcmVkfSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZXh0ZW5kZWQgPSBkYXRhLnNldHRpbmdzLmN1c3RvbVRoZW1lcy5jb25jYXQoe1xuICAgICAgICAgICAgICAgICAgICAgICAgdXJsOiBbaG9zdF0sXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGVtZTogey4uLmRhdGEuc2V0dGluZ3MudGhlbWV9LFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgYWN0aW9ucy5jaGFuZ2VTZXR0aW5ncyh7Y3VzdG9tVGhlbWVzOiBleHRlbmRlZH0pO1xuICAgICAgICAgICAgICAgICAgICAoZS5jdXJyZW50VGFyZ2V0IGFzIEhUTUxFbGVtZW50KS5jbGFzc0xpc3QuYWRkKCdjdXN0b20tc2V0dGluZ3MtdG9nZ2xlLS1jaGVja2VkJyk7IC8vIFNwZWVkLXVwIHJlYWN0aW9uXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfX1cbiAgICAgICAgPlxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJjdXN0b20tc2V0dGluZ3MtdG9nZ2xlX193cmFwcGVyXCI+XG4gICAgICAgICAgICAgICAge2dldExvY2FsTWVzc2FnZSgnb25seV9mb3InKX0gPHNwYW4gY2xhc3M9XCJjdXN0b20tc2V0dGluZ3MtdG9nZ2xlX191cmxcIiA+e3VybFRleHR9PC9zcGFuPlxuICAgICAgICAgICAgPC9zcGFuPlxuICAgICAgICA8L0J1dHRvbj5cbiAgICApO1xufVxuIiwiaW1wb3J0IHttfSBmcm9tICdtYWxldmljJztcbmltcG9ydCB7QnV0dG9uLCBUb2dnbGV9IGZyb20gJy4uLy4uLy4uL2NvbnRyb2xzJztcbmltcG9ydCB7Z2V0TG9jYWxNZXNzYWdlfSBmcm9tICcuLi8uLi8uLi8uLi91dGlscy9sb2NhbGVzJztcblxuaW50ZXJmYWNlIE1vZGVUb2dnbGVQcm9wcyB7XG4gICAgbW9kZTogbnVtYmVyO1xuICAgIG9uQ2hhbmdlOiAobW9kZTogbnVtYmVyKSA9PiB2b2lkO1xufVxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBNb2RlVG9nZ2xlKHttb2RlLCBvbkNoYW5nZX06IE1vZGVUb2dnbGVQcm9wcykge1xuICAgIHJldHVybiAoXG4gICAgICAgIDxkaXYgY2xhc3M9XCJtb2RlLXRvZ2dsZVwiPlxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cIm1vZGUtdG9nZ2xlX19saW5lXCI+XG4gICAgICAgICAgICAgICAgPEJ1dHRvblxuICAgICAgICAgICAgICAgICAgICBjbGFzcz17eydtb2RlLXRvZ2dsZV9fYnV0dG9uLS1hY3RpdmUnOiBtb2RlID09PSAxfX1cbiAgICAgICAgICAgICAgICAgICAgb25jbGljaz17KCkgPT4gb25DaGFuZ2UoMSl9XG4gICAgICAgICAgICAgICAgPlxuICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz1cImljb24gaWNvbi0tZGFyay1tb2RlXCI+PC9zcGFuPlxuICAgICAgICAgICAgICAgIDwvQnV0dG9uPlxuICAgICAgICAgICAgICAgIDxUb2dnbGVcbiAgICAgICAgICAgICAgICAgICAgY2hlY2tlZD17bW9kZSA9PT0gMX1cbiAgICAgICAgICAgICAgICAgICAgbGFiZWxPbj17Z2V0TG9jYWxNZXNzYWdlKCdkYXJrJyl9XG4gICAgICAgICAgICAgICAgICAgIGxhYmVsT2ZmPXtnZXRMb2NhbE1lc3NhZ2UoJ2xpZ2h0Jyl9XG4gICAgICAgICAgICAgICAgICAgIG9uQ2hhbmdlPXsoY2hlY2tlZCkgPT4gb25DaGFuZ2UoY2hlY2tlZCA/IDEgOiAwKX1cbiAgICAgICAgICAgICAgICAvPlxuICAgICAgICAgICAgICAgIDxCdXR0b25cbiAgICAgICAgICAgICAgICAgICAgY2xhc3M9e3snbW9kZS10b2dnbGVfX2J1dHRvbi0tYWN0aXZlJzogbW9kZSA9PT0gMH19XG4gICAgICAgICAgICAgICAgICAgIG9uY2xpY2s9eygpID0+IG9uQ2hhbmdlKDApfVxuICAgICAgICAgICAgICAgID5cbiAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJpY29uIGljb24tLWxpZ2h0LW1vZGVcIj48L3NwYW4+XG4gICAgICAgICAgICAgICAgPC9CdXR0b24+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDxsYWJlbCBjbGFzcz1cIm1vZGUtdG9nZ2xlX19sYWJlbFwiPntnZXRMb2NhbE1lc3NhZ2UoJ21vZGUnKX08L2xhYmVsPlxuICAgICAgICA8L2Rpdj5cbiAgICApO1xufVxuIiwiaW1wb3J0IHttfSBmcm9tICdtYWxldmljJztcbmltcG9ydCB7VXBEb3dufSBmcm9tICcuLi8uLi8uLi9jb250cm9scyc7XG5pbXBvcnQgQ3VzdG9tU2V0dGluZ3NUb2dnbGUgZnJvbSAnLi4vY3VzdG9tLXNldHRpbmdzLXRvZ2dsZSc7XG5pbXBvcnQgTW9kZVRvZ2dsZSBmcm9tICcuL21vZGUtdG9nZ2xlJztcbmltcG9ydCB7Z2V0TG9jYWxNZXNzYWdlfSBmcm9tICcuLi8uLi8uLi8uLi91dGlscy9sb2NhbGVzJztcbmltcG9ydCB7aXNVUkxJbkxpc3R9IGZyb20gJy4uLy4uLy4uLy4uL3V0aWxzL3VybCc7XG5pbXBvcnQge0V4dFdyYXBwZXIsIFRhYkluZm8sIEZpbHRlckNvbmZpZ30gZnJvbSAnLi4vLi4vLi4vLi4vZGVmaW5pdGlvbnMnO1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBGaWx0ZXJTZXR0aW5ncyh7ZGF0YSwgYWN0aW9ucywgdGFifTogRXh0V3JhcHBlciAmIHt0YWI6IFRhYkluZm99KSB7XG5cbiAgICBjb25zdCBjdXN0b20gPSBkYXRhLnNldHRpbmdzLmN1c3RvbVRoZW1lcy5maW5kKCh7dXJsfSkgPT4gaXNVUkxJbkxpc3QodGFiLnVybCwgdXJsKSk7XG4gICAgY29uc3QgZmlsdGVyQ29uZmlnID0gY3VzdG9tID8gY3VzdG9tLnRoZW1lIDogZGF0YS5zZXR0aW5ncy50aGVtZTtcblxuICAgIGZ1bmN0aW9uIHNldENvbmZpZyhjb25maWc6IFBhcnRpYWw8RmlsdGVyQ29uZmlnPikge1xuICAgICAgICBpZiAoY3VzdG9tKSB7XG4gICAgICAgICAgICBjdXN0b20udGhlbWUgPSB7Li4uY3VzdG9tLnRoZW1lLCAuLi5jb25maWd9O1xuICAgICAgICAgICAgYWN0aW9ucy5jaGFuZ2VTZXR0aW5ncyh7Y3VzdG9tVGhlbWVzOiBkYXRhLnNldHRpbmdzLmN1c3RvbVRoZW1lc30pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgYWN0aW9ucy5zZXRUaGVtZShjb25maWcpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgYnJpZ2h0bmVzcyA9IChcbiAgICAgICAgPFVwRG93blxuICAgICAgICAgICAgdmFsdWU9e2ZpbHRlckNvbmZpZy5icmlnaHRuZXNzfVxuICAgICAgICAgICAgbWluPXs1MH1cbiAgICAgICAgICAgIG1heD17MTUwfVxuICAgICAgICAgICAgc3RlcD17NX1cbiAgICAgICAgICAgIGRlZmF1bHQ9ezEwMH1cbiAgICAgICAgICAgIG5hbWU9e2dldExvY2FsTWVzc2FnZSgnYnJpZ2h0bmVzcycpfVxuICAgICAgICAgICAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4gc2V0Q29uZmlnKHticmlnaHRuZXNzOiB2YWx1ZX0pfVxuICAgICAgICAvPlxuICAgICk7XG5cbiAgICBjb25zdCBjb250cmFzdCA9IChcbiAgICAgICAgPFVwRG93blxuICAgICAgICAgICAgdmFsdWU9e2ZpbHRlckNvbmZpZy5jb250cmFzdH1cbiAgICAgICAgICAgIG1pbj17NTB9XG4gICAgICAgICAgICBtYXg9ezE1MH1cbiAgICAgICAgICAgIHN0ZXA9ezV9XG4gICAgICAgICAgICBkZWZhdWx0PXsxMDB9XG4gICAgICAgICAgICBuYW1lPXtnZXRMb2NhbE1lc3NhZ2UoJ2NvbnRyYXN0Jyl9XG4gICAgICAgICAgICBvbkNoYW5nZT17KHZhbHVlKSA9PiBzZXRDb25maWcoe2NvbnRyYXN0OiB2YWx1ZX0pfVxuICAgICAgICAvPlxuICAgICk7XG5cbiAgICBjb25zdCBncmF5c2NhbGUgPSAoXG4gICAgICAgIDxVcERvd25cbiAgICAgICAgICAgIHZhbHVlPXtmaWx0ZXJDb25maWcuZ3JheXNjYWxlfVxuICAgICAgICAgICAgbWluPXswfVxuICAgICAgICAgICAgbWF4PXsxMDB9XG4gICAgICAgICAgICBzdGVwPXs1fVxuICAgICAgICAgICAgZGVmYXVsdD17MH1cbiAgICAgICAgICAgIG5hbWU9e2dldExvY2FsTWVzc2FnZSgnZ3JheXNjYWxlJyl9XG4gICAgICAgICAgICBvbkNoYW5nZT17KHZhbHVlKSA9PiBzZXRDb25maWcoe2dyYXlzY2FsZTogdmFsdWV9KX1cbiAgICAgICAgLz5cbiAgICApO1xuXG4gICAgY29uc3Qgc2VwaWEgPSAoXG4gICAgICAgIDxVcERvd25cbiAgICAgICAgICAgIHZhbHVlPXtmaWx0ZXJDb25maWcuc2VwaWF9XG4gICAgICAgICAgICBtaW49ezB9XG4gICAgICAgICAgICBtYXg9ezEwMH1cbiAgICAgICAgICAgIHN0ZXA9ezV9XG4gICAgICAgICAgICBkZWZhdWx0PXswfVxuICAgICAgICAgICAgbmFtZT17Z2V0TG9jYWxNZXNzYWdlKCdzZXBpYScpfVxuICAgICAgICAgICAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4gc2V0Q29uZmlnKHtzZXBpYTogdmFsdWV9KX1cbiAgICAgICAgLz5cbiAgICApO1xuXG4gICAgcmV0dXJuIChcbiAgICAgICAgPHNlY3Rpb24gY2xhc3M9XCJmaWx0ZXItc2V0dGluZ3NcIj5cbiAgICAgICAgICAgIDxNb2RlVG9nZ2xlIG1vZGU9e2ZpbHRlckNvbmZpZy5tb2RlfSBvbkNoYW5nZT17KG1vZGUpID0+IHNldENvbmZpZyh7bW9kZX0pfSAvPlxuICAgICAgICAgICAge2JyaWdodG5lc3N9XG4gICAgICAgICAgICB7Y29udHJhc3R9XG4gICAgICAgICAgICB7c2VwaWF9XG4gICAgICAgICAgICB7Z3JheXNjYWxlfVxuICAgICAgICAgICAgPEN1c3RvbVNldHRpbmdzVG9nZ2xlIGRhdGE9e2RhdGF9IHRhYj17dGFifSBhY3Rpb25zPXthY3Rpb25zfSAvPlxuICAgICAgICA8L3NlY3Rpb24+XG4gICAgKTtcbn1cbiIsImltcG9ydCB7bX0gZnJvbSAnbWFsZXZpYyc7XG5pbXBvcnQge2lzTmlnaHRBdExvY2F0aW9ufSBmcm9tICcuLi8uLi8uLi91dGlscy90aW1lJztcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gU3VuTW9vbkljb24oe2RhdGUsIGxhdGl0dWRlLCBsb25naXR1ZGV9KSB7XG4gICAgaWYgKGxhdGl0dWRlID09IG51bGwgfHwgbG9uZ2l0dWRlID09IG51bGwpIHtcbiAgICAgICAgLy8gcXVlc3Rpb24gbWFyayBpY29uXG4gICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICA8c3ZnIHZpZXdCb3g9XCIwIDAgMTYgMTZcIj5cbiAgICAgICAgICAgICAgICA8dGV4dFxuICAgICAgICAgICAgICAgICAgICBmaWxsPVwid2hpdGVcIlxuICAgICAgICAgICAgICAgICAgICBmb250LXNpemU9XCIxNlwiXG4gICAgICAgICAgICAgICAgICAgIGZvbnQtd2VpZ2h0PVwiYm9sZFwiXG4gICAgICAgICAgICAgICAgICAgIHRleHQtYW5jaG9yPVwibWlkZGxlXCJcbiAgICAgICAgICAgICAgICAgICAgeD1cIjhcIlxuICAgICAgICAgICAgICAgICAgICB5PVwiMTRcIlxuICAgICAgICAgICAgICAgID4/PC90ZXh0PlxuICAgICAgICAgICAgPC9zdmc+XG4gICAgICAgICk7XG4gICAgfVxuXG4gICAgaWYgKGlzTmlnaHRBdExvY2F0aW9uKGRhdGUsIGxhdGl0dWRlLCBsb25naXR1ZGUpKSB7XG4gICAgICAgIC8vIG1vb24gaWNvblxuICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgPHN2ZyB2aWV3Qm94PVwiMCAwIDE2IDE2XCI+XG4gICAgICAgICAgICAgICAgPHBhdGggZmlsbD1cIndoaXRlXCIgc3Ryb2tlPVwibm9uZVwiIGQ9XCJNIDYgMyBRIDEwIDggNiAxMyBRIDEyIDEzIDEyIDggUSAxMiAzIDYgM1wiIC8+XG4gICAgICAgICAgICA8L3N2Zz5cbiAgICAgICAgKTtcbiAgICB9XG5cbiAgICAvLyBzdW4gaWNvblxuICAgIHJldHVybiAoXG4gICAgICAgIDxzdmcgdmlld0JveD1cIjAgMCAxNiAxNlwiPlxuICAgICAgICAgICAgPGNpcmNsZSBmaWxsPVwid2hpdGVcIiBzdHJva2U9XCJub25lXCIgY3g9XCI4XCIgY3k9XCI4XCIgcj1cIjNcIiAvPlxuICAgICAgICAgICAgPGcgZmlsbD1cIm5vbmVcIiBzdHJva2U9XCJ3aGl0ZVwiIHN0cm9rZS1saW5lY2FwPVwicm91bmRcIiBzdHJva2Utd2lkdGg9XCIxLjVcIj5cbiAgICAgICAgICAgICAgICB7Li4uKEFycmF5LmZyb20oe2xlbmd0aDogOH0pLm1hcCgoXywgaSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBjeCA9IDg7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGN5ID0gODtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYW5nbGUgPSBpICogTWF0aC5QSSAvIDQgKyBNYXRoLlBJIC8gODtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcHQgPSBbNSwgNl0ubWFwKChsKSA9PiBbXG4gICAgICAgICAgICAgICAgICAgICAgICBjeCArIGwgKiBNYXRoLmNvcyhhbmdsZSksXG4gICAgICAgICAgICAgICAgICAgICAgICBjeSArIGwgKiBNYXRoLnNpbihhbmdsZSksXG4gICAgICAgICAgICAgICAgICAgIF0pO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgICAgICAgICAgICAgPGxpbmVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB4MT17cHRbMF1bMF19XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgeTE9e3B0WzBdWzFdfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHgyPXtwdFsxXVswXX1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB5Mj17cHRbMV1bMV19XG4gICAgICAgICAgICAgICAgICAgICAgICAvPlxuICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIH0pKX1cbiAgICAgICAgICAgIDwvZz5cbiAgICAgICAgPC9zdmc+XG4gICAgKTtcbn1cbiIsImltcG9ydCB7bX0gZnJvbSAnbWFsZXZpYyc7XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIFN5c3RlbUljb24oKSB7XG4gICAgcmV0dXJuIChcbiAgICAgICAgPHN2ZyB2aWV3Qm94PVwiMCAwIDE2IDE2XCI+XG4gICAgICAgICAgICA8cGF0aFxuICAgICAgICAgICAgICAgIGZpbGw9XCJ3aGl0ZVwiXG4gICAgICAgICAgICAgICAgc3Ryb2tlPVwibm9uZVwiXG4gICAgICAgICAgICAgICAgZD1cIk0zLDMgaDEwIHY3IGgtMyB2MiBoMSB2MSBoLTYgdi0xIGgxIHYtMiBoLTMgeiBNNC41LDQuNSB2NCBoNyB2LTQgelwiXG4gICAgICAgICAgICAvPlxuICAgICAgICA8L3N2Zz5cbiAgICApO1xufVxuIiwiaW1wb3J0IHttfSBmcm9tICdtYWxldmljJztcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gV2F0Y2hJY29uKHtob3VycywgbWludXRlc30pIHtcbiAgICBjb25zdCBjeCA9IDg7XG4gICAgY29uc3QgY3kgPSA4LjU7XG4gICAgY29uc3QgbGVuSG91ciA9IDM7XG4gICAgY29uc3QgbGVuTWludXRlID0gNDtcbiAgICBjb25zdCBjbG9ja1IgPSA1LjU7XG4gICAgY29uc3QgYnRuU2l6ZSA9IDI7XG4gICAgY29uc3QgYnRuUGFkID0gMS41O1xuICAgIGNvbnN0IGFoID0gKChob3VycyA+IDExID8gaG91cnMgLSAxMiA6IGhvdXJzKSArIG1pbnV0ZXMgLyA2MCkgLyAxMiAqIE1hdGguUEkgKiAyO1xuICAgIGNvbnN0IGFtID0gbWludXRlcyAvIDYwICogTWF0aC5QSSAqIDI7XG4gICAgY29uc3QgaHggPSBjeCArIGxlbkhvdXIgKiBNYXRoLnNpbihhaCk7XG4gICAgY29uc3QgaHkgPSBjeSAtIGxlbkhvdXIgKiBNYXRoLmNvcyhhaCk7XG4gICAgY29uc3QgbXggPSBjeCArIGxlbk1pbnV0ZSAqIE1hdGguc2luKGFtKTtcbiAgICBjb25zdCBteSA9IGN5IC0gbGVuTWludXRlICogTWF0aC5jb3MoYW0pO1xuXG4gICAgcmV0dXJuIChcbiAgICAgICAgPHN2ZyB2aWV3Qm94PVwiMCAwIDE2IDE2XCI+XG4gICAgICAgICAgICA8Y2lyY2xlIGZpbGw9XCJub25lXCIgc3Ryb2tlPVwid2hpdGVcIiBzdHJva2Utd2lkdGg9XCIxLjVcIiBjeD17Y3h9IGN5PXtjeX0gcj17Y2xvY2tSfSAvPlxuICAgICAgICAgICAgPGxpbmUgc3Ryb2tlPVwid2hpdGVcIiBzdHJva2Utd2lkdGg9XCIxLjVcIiB4MT17Y3h9IHkxPXtjeX0geDI9e2h4fSB5Mj17aHl9IC8+XG4gICAgICAgICAgICA8bGluZSBzdHJva2U9XCJ3aGl0ZVwiIHN0cm9rZS13aWR0aD1cIjEuNVwiIG9wYWNpdHk9XCIwLjY3XCIgeDE9e2N4fSB5MT17Y3l9IHgyPXtteH0geTI9e215fSAvPlxuICAgICAgICAgICAge1szMCwgLTMwXS5tYXAoKGFuZ2xlKSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgICAgICAgICAgPHBhdGhcbiAgICAgICAgICAgICAgICAgICAgICAgIGZpbGw9XCJ3aGl0ZVwiXG4gICAgICAgICAgICAgICAgICAgICAgICB0cmFuc2Zvcm09e2Byb3RhdGUoJHthbmdsZX0pYH1cbiAgICAgICAgICAgICAgICAgICAgICAgIHRyYW5zZm9ybS1vcmlnaW49e2Ake2N4fSAke2N5fWB9XG4gICAgICAgICAgICAgICAgICAgICAgICBkPXtgTSR7Y3ggLSBidG5TaXplfSwke2N5IC0gY2xvY2tSIC0gYnRuUGFkfSBhJHtidG5TaXplfSwke2J0blNpemV9IDAgMCAxICR7MiAqIGJ0blNpemV9LDAgemB9IC8+XG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH0pfVxuICAgICAgICA8L3N2Zz5cbiAgICApO1xufVxuIiwiaW1wb3J0IHttfSBmcm9tICdtYWxldmljJztcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gQ2hlY2ttYXJrSWNvbih7aXNDaGVja2VkfSkge1xuICAgIHJldHVybiAoXG4gICAgICAgIDxzdmcgdmlld0JveD1cIjAgMCA4IDhcIj5cbiAgICAgICAgICAgIDxwYXRoXG4gICAgICAgICAgICAgICAgZD17KGlzQ2hlY2tlZCA/XG4gICAgICAgICAgICAgICAgICAgICdNMSw0IGwyLDIgbDQsLTQgdjEgbC00LDQgbC0yLC0yIFonIDpcbiAgICAgICAgICAgICAgICAgICAgJ00yLDIgbDQsNCB2MSBsLTQsLTQgWiBNMiw2IGw0LC00IHYxIGwtNCw0IFonXG4gICAgICAgICAgICAgICAgKX0gLz5cbiAgICAgICAgPC9zdmc+XG4gICAgKTtcbn1cbiIsImltcG9ydCB7bX0gZnJvbSAnbWFsZXZpYyc7XG5pbXBvcnQgQ2hlY2ttYXJrSWNvbiBmcm9tICcuL2NoZWNrbWFyay1pY29uJztcbmltcG9ydCB7QnV0dG9ufSBmcm9tICcuLi8uLi8uLi9jb250cm9scyc7XG5pbXBvcnQge2dldFVSTEhvc3RPclByb3RvY29sLCBpc1VSTEVuYWJsZWQsIGlzUERGfSBmcm9tICcuLi8uLi8uLi8uLi91dGlscy91cmwnO1xuaW1wb3J0IHtFeHRXcmFwcGVyLCBUYWJJbmZvfSBmcm9tICcuLi8uLi8uLi8uLi9kZWZpbml0aW9ucyc7XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIFNpdGVUb2dnbGVCdXR0b24oe2RhdGEsIHRhYiwgYWN0aW9uc306IEV4dFdyYXBwZXIgJiB7dGFiOiBUYWJJbmZvfSkge1xuXG4gICAgZnVuY3Rpb24gb25TaXRlVG9nZ2xlQ2xpY2soKSB7XG4gICAgICAgIGlmIChwZGYpIHtcbiAgICAgICAgICAgIGFjdGlvbnMuY2hhbmdlU2V0dGluZ3Moe2VuYWJsZUZvclBERjogIWRhdGEuc2V0dGluZ3MuZW5hYmxlRm9yUERGfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBhY3Rpb25zLnRvZ2dsZVVSTCh0YWIudXJsKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBjb25zdCB0b2dnbGVIYXNFZmZlY3QgPSAoXG4gICAgICAgIGRhdGEuc2V0dGluZ3MuZW5hYmxlRm9yUHJvdGVjdGVkUGFnZXMgfHxcbiAgICAgICAgIXRhYi5pc1Byb3RlY3RlZFxuICAgICk7XG4gICAgY29uc3QgcGRmID0gaXNQREYodGFiLnVybCk7XG4gICAgY29uc3QgaXNTaXRlRW5hYmxlZCA9IGlzVVJMRW5hYmxlZCh0YWIudXJsLCBkYXRhLnNldHRpbmdzLCB0YWIpO1xuICAgIGNvbnN0IGhvc3QgPSBnZXRVUkxIb3N0T3JQcm90b2NvbCh0YWIudXJsKTtcblxuICAgIGNvbnN0IHVybFRleHQgPSBob3N0XG4gICAgICAgIC5zcGxpdCgnLicpXG4gICAgICAgIC5yZWR1Y2UoKGVsZW1lbnRzLCBwYXJ0LCBpKSA9PiBlbGVtZW50cy5jb25jYXQoXG4gICAgICAgICAgICA8d2JyIC8+LFxuICAgICAgICAgICAgYCR7aSA+IDAgPyAnLicgOiAnJ30ke3BhcnR9YFxuICAgICAgICApLCBbXSk7XG5cbiAgICByZXR1cm4gKFxuICAgICAgICA8QnV0dG9uXG4gICAgICAgICAgICBjbGFzcz17e1xuICAgICAgICAgICAgICAgICdzaXRlLXRvZ2dsZSc6IHRydWUsXG4gICAgICAgICAgICAgICAgJ3NpdGUtdG9nZ2xlLS1hY3RpdmUnOiBpc1NpdGVFbmFibGVkLFxuICAgICAgICAgICAgICAgICdzaXRlLXRvZ2dsZS0tZGlzYWJsZWQnOiAhdG9nZ2xlSGFzRWZmZWN0XG4gICAgICAgICAgICB9fVxuICAgICAgICAgICAgb25jbGljaz17b25TaXRlVG9nZ2xlQ2xpY2t9XG4gICAgICAgID5cbiAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwic2l0ZS10b2dnbGVfX21hcmtcIj48Q2hlY2ttYXJrSWNvbiBpc0NoZWNrZWQ9e2lzU2l0ZUVuYWJsZWR9IC8+PC9zcGFuPlxuICAgICAgICAgICAgeycgJ31cbiAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwic2l0ZS10b2dnbGVfX3VybFwiID57cGRmID8gJ1BERicgOiB1cmxUZXh0fTwvc3Bhbj5cbiAgICAgICAgPC9CdXR0b24+XG4gICAgKTtcbn1cbiIsImltcG9ydCB7bX0gZnJvbSAnbWFsZXZpYyc7XG5pbXBvcnQge0J1dHRvbiwgQ2hlY2tCb3gsIFRleHRCb3gsIFRpbWVSYW5nZVBpY2tlcn0gZnJvbSAnLi4vLi4vLi4vY29udHJvbHMnO1xuaW1wb3J0IHtnZXRMb2NhbE1lc3NhZ2V9IGZyb20gJy4uLy4uLy4uLy4uL3V0aWxzL2xvY2FsZXMnO1xuaW1wb3J0IHtFeHRXcmFwcGVyfSBmcm9tICcuLi8uLi8uLi8uLi9kZWZpbml0aW9ucyc7XG5cbnR5cGUgTW9yZVRvZ2dsZVNldHRpbmdzUHJvcHMgPSBFeHRXcmFwcGVyICYge1xuICAgIGlzRXhwYW5kZWQ6IGJvb2xlYW47XG4gICAgb25DbG9zZTogKCkgPT4gdm9pZDtcbn07XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIE1vcmVUb2dnbGVTZXR0aW5ncyh7ZGF0YSwgYWN0aW9ucywgaXNFeHBhbmRlZCwgb25DbG9zZX06IE1vcmVUb2dnbGVTZXR0aW5nc1Byb3BzKSB7XG4gICAgY29uc3QgaXNTeXN0ZW1BdXRvbWF0aW9uID0gZGF0YS5zZXR0aW5ncy5hdXRvbWF0aW9uID09PSAnc3lzdGVtJztcbiAgICBjb25zdCBsb2NhdGlvblNldHRpbmdzID0gZGF0YS5zZXR0aW5ncy5sb2NhdGlvbjtcbiAgICBjb25zdCB2YWx1ZXMgPSB7XG4gICAgICAgICdsYXRpdHVkZSc6IHtcbiAgICAgICAgICAgIG1pbjogLTkwLFxuICAgICAgICAgICAgbWF4OiA5MFxuICAgICAgICB9LFxuICAgICAgICAnbG9uZ2l0dWRlJzoge1xuICAgICAgICAgICAgbWluOiAtMTgwLFxuICAgICAgICAgICAgbWF4OiAxODAsXG4gICAgICAgIH0sXG4gICAgfTtcblxuICAgIGZ1bmN0aW9uIGdldExvY2F0aW9uU3RyaW5nKGxvY2F0aW9uOiBudW1iZXIpIHtcbiAgICAgICAgaWYgKGxvY2F0aW9uID09IG51bGwpIHtcbiAgICAgICAgICAgIHJldHVybiAnJztcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBgJHtsb2NhdGlvbn3CsGA7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbG9jYXRpb25DaGFuZ2VkKGlucHV0RWxlbWVudDogSFRNTElucHV0RWxlbWVudCwgbmV3VmFsdWU6IHN0cmluZywgdHlwZTogc3RyaW5nKSB7XG4gICAgICAgIGlmIChuZXdWYWx1ZS50cmltKCkgPT09ICcnKSB7XG4gICAgICAgICAgICBpbnB1dEVsZW1lbnQudmFsdWUgPSAnJztcblxuICAgICAgICAgICAgYWN0aW9ucy5jaGFuZ2VTZXR0aW5ncyh7XG4gICAgICAgICAgICAgICAgbG9jYXRpb246IHtcbiAgICAgICAgICAgICAgICAgICAgLi4ubG9jYXRpb25TZXR0aW5ncyxcbiAgICAgICAgICAgICAgICAgICAgW3R5cGVdOiBudWxsLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgbWluOiBudW1iZXIgPSB2YWx1ZXNbdHlwZV0ubWluO1xuICAgICAgICBjb25zdCBtYXg6IG51bWJlciA9IHZhbHVlc1t0eXBlXS5tYXg7XG5cbiAgICAgICAgbmV3VmFsdWUgPSBuZXdWYWx1ZS5yZXBsYWNlKCcsJywgJy4nKS5yZXBsYWNlKCfCsCcsICcnKTtcblxuICAgICAgICBsZXQgbnVtID0gTnVtYmVyKG5ld1ZhbHVlKTtcbiAgICAgICAgaWYgKGlzTmFOKG51bSkpIHtcbiAgICAgICAgICAgIG51bSA9IDA7XG4gICAgICAgIH0gZWxzZSBpZiAobnVtID4gbWF4KSB7XG4gICAgICAgICAgICBudW0gPSBtYXg7XG4gICAgICAgIH0gZWxzZSBpZiAobnVtIDwgbWluKSB7XG4gICAgICAgICAgICBudW0gPSBtaW47XG4gICAgICAgIH1cblxuICAgICAgICBpbnB1dEVsZW1lbnQudmFsdWUgPSBnZXRMb2NhdGlvblN0cmluZyhudW0pO1xuXG4gICAgICAgIGFjdGlvbnMuY2hhbmdlU2V0dGluZ3Moe1xuICAgICAgICAgICAgbG9jYXRpb246IHtcbiAgICAgICAgICAgICAgICAuLi5sb2NhdGlvblNldHRpbmdzLFxuICAgICAgICAgICAgICAgIFt0eXBlXTogbnVtLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIChcbiAgICAgICAgPGRpdlxuICAgICAgICAgICAgY2xhc3M9e3tcbiAgICAgICAgICAgICAgICAnaGVhZGVyX19hcHAtdG9nZ2xlX19tb3JlLXNldHRpbmdzJzogdHJ1ZSxcbiAgICAgICAgICAgICAgICAnaGVhZGVyX19hcHAtdG9nZ2xlX19tb3JlLXNldHRpbmdzLS1leHBhbmRlZCc6IGlzRXhwYW5kZWQsXG4gICAgICAgICAgICB9fVxuICAgICAgICA+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiaGVhZGVyX19hcHAtdG9nZ2xlX19tb3JlLXNldHRpbmdzX190b3BcIj5cbiAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz1cImhlYWRlcl9fYXBwLXRvZ2dsZV9fbW9yZS1zZXR0aW5nc19fdG9wX190ZXh0XCI+e2dldExvY2FsTWVzc2FnZSgnYXV0b21hdGlvbicpfTwvc3Bhbj5cbiAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz1cImhlYWRlcl9fYXBwLXRvZ2dsZV9fbW9yZS1zZXR0aW5nc19fdG9wX19jbG9zZVwiIHJvbGU9XCJidXR0b25cIiBvbmNsaWNrPXtvbkNsb3NlfT7inJU8L3NwYW4+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJoZWFkZXJfX2FwcC10b2dnbGVfX21vcmUtc2V0dGluZ3NfX2NvbnRlbnRcIj5cbiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiaGVhZGVyX19hcHAtdG9nZ2xlX19tb3JlLXNldHRpbmdzX19saW5lXCI+XG4gICAgICAgICAgICAgICAgICAgIDxDaGVja0JveFxuICAgICAgICAgICAgICAgICAgICAgICAgY2hlY2tlZD17ZGF0YS5zZXR0aW5ncy5hdXRvbWF0aW9uID09PSAndGltZSd9XG4gICAgICAgICAgICAgICAgICAgICAgICBvbmNoYW5nZT17KGUpID0+IGFjdGlvbnMuY2hhbmdlU2V0dGluZ3Moe2F1dG9tYXRpb246IGUudGFyZ2V0LmNoZWNrZWQgPyAndGltZScgOiAnJ30pfVxuICAgICAgICAgICAgICAgICAgICAvPlxuICAgICAgICAgICAgICAgICAgICA8VGltZVJhbmdlUGlja2VyXG4gICAgICAgICAgICAgICAgICAgICAgICBzdGFydFRpbWU9e2RhdGEuc2V0dGluZ3MudGltZS5hY3RpdmF0aW9ufVxuICAgICAgICAgICAgICAgICAgICAgICAgZW5kVGltZT17ZGF0YS5zZXR0aW5ncy50aW1lLmRlYWN0aXZhdGlvbn1cbiAgICAgICAgICAgICAgICAgICAgICAgIG9uQ2hhbmdlPXsoW3N0YXJ0LCBlbmRdKSA9PiBhY3Rpb25zLmNoYW5nZVNldHRpbmdzKHt0aW1lOiB7YWN0aXZhdGlvbjogc3RhcnQsIGRlYWN0aXZhdGlvbjogZW5kfX0pfVxuICAgICAgICAgICAgICAgICAgICAvPlxuICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgIDxwIGNsYXNzPVwiaGVhZGVyX19hcHAtdG9nZ2xlX19tb3JlLXNldHRpbmdzX19kZXNjcmlwdGlvblwiPlxuICAgICAgICAgICAgICAgICAgICB7Z2V0TG9jYWxNZXNzYWdlKCdzZXRfYWN0aXZlX2hvdXJzJyl9XG4gICAgICAgICAgICAgICAgPC9wPlxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJoZWFkZXJfX2FwcC10b2dnbGVfX21vcmUtc2V0dGluZ3NfX2xpbmUgaGVhZGVyX19hcHAtdG9nZ2xlX19tb3JlLXNldHRpbmdzX19sb2NhdGlvblwiPlxuICAgICAgICAgICAgICAgICAgICA8Q2hlY2tCb3hcbiAgICAgICAgICAgICAgICAgICAgICAgIGNoZWNrZWQ9e2RhdGEuc2V0dGluZ3MuYXV0b21hdGlvbiA9PT0gJ2xvY2F0aW9uJ31cbiAgICAgICAgICAgICAgICAgICAgICAgIG9uY2hhbmdlPXsoZSkgPT4gYWN0aW9ucy5jaGFuZ2VTZXR0aW5ncyh7YXV0b21hdGlvbjogZS50YXJnZXQuY2hlY2tlZCA/ICdsb2NhdGlvbicgOiAnJ30pfVxuICAgICAgICAgICAgICAgICAgICAvPlxuICAgICAgICAgICAgICAgICAgICA8VGV4dEJveFxuICAgICAgICAgICAgICAgICAgICAgICAgY2xhc3M9XCJoZWFkZXJfX2FwcC10b2dnbGVfX21vcmUtc2V0dGluZ3NfX2xvY2F0aW9uX19sYXRpdHVkZVwiXG4gICAgICAgICAgICAgICAgICAgICAgICBwbGFjZWhvbGRlcj17Z2V0TG9jYWxNZXNzYWdlKCdsYXRpdHVkZScpfVxuICAgICAgICAgICAgICAgICAgICAgICAgb25jaGFuZ2U9eyhlKSA9PiBsb2NhdGlvbkNoYW5nZWQoZS50YXJnZXQsIGUudGFyZ2V0LnZhbHVlLCAnbGF0aXR1ZGUnKX1cbiAgICAgICAgICAgICAgICAgICAgICAgIG9uY3JlYXRlPXsobm9kZTogSFRNTElucHV0RWxlbWVudCkgPT4gbm9kZS52YWx1ZSA9IGdldExvY2F0aW9uU3RyaW5nKGxvY2F0aW9uU2V0dGluZ3MubGF0aXR1ZGUpfVxuICAgICAgICAgICAgICAgICAgICAgICAgb25rZXlwcmVzcz17KGUpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoZS5rZXkgPT09ICdFbnRlcicpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKGUudGFyZ2V0IGFzIEhUTUxJbnB1dEVsZW1lbnQpLmJsdXIoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9fVxuICAgICAgICAgICAgICAgICAgICAvPlxuICAgICAgICAgICAgICAgICAgICA8VGV4dEJveFxuICAgICAgICAgICAgICAgICAgICAgICAgY2xhc3M9XCJoZWFkZXJfX2FwcC10b2dnbGVfX21vcmUtc2V0dGluZ3NfX2xvY2F0aW9uX19sb25naXR1ZGVcIlxuICAgICAgICAgICAgICAgICAgICAgICAgcGxhY2Vob2xkZXI9e2dldExvY2FsTWVzc2FnZSgnbG9uZ2l0dWRlJyl9XG4gICAgICAgICAgICAgICAgICAgICAgICBvbmNoYW5nZT17KGUpID0+IGxvY2F0aW9uQ2hhbmdlZChlLnRhcmdldCwgZS50YXJnZXQudmFsdWUsICdsb25naXR1ZGUnKX1cbiAgICAgICAgICAgICAgICAgICAgICAgIG9uY3JlYXRlPXsobm9kZTogSFRNTElucHV0RWxlbWVudCkgPT4gbm9kZS52YWx1ZSA9IGdldExvY2F0aW9uU3RyaW5nKGxvY2F0aW9uU2V0dGluZ3MubG9uZ2l0dWRlKX1cbiAgICAgICAgICAgICAgICAgICAgICAgIG9ua2V5cHJlc3M9eyhlKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGUua2V5ID09PSAnRW50ZXInKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIChlLnRhcmdldCBhcyBIVE1MSW5wdXRFbGVtZW50KS5ibHVyKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfX1cbiAgICAgICAgICAgICAgICAgICAgLz5cbiAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICA8cCBjbGFzcz1cImhlYWRlcl9fYXBwLXRvZ2dsZV9fbW9yZS1zZXR0aW5nc19fbG9jYXRpb24tZGVzY3JpcHRpb25cIj5cbiAgICAgICAgICAgICAgICAgICAge2dldExvY2FsTWVzc2FnZSgnc2V0X2xvY2F0aW9uJyl9XG4gICAgICAgICAgICAgICAgPC9wPlxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9e1tcbiAgICAgICAgICAgICAgICAgICAgJ2hlYWRlcl9fYXBwLXRvZ2dsZV9fbW9yZS1zZXR0aW5nc19fbGluZScsXG4gICAgICAgICAgICAgICAgICAgICdoZWFkZXJfX2FwcC10b2dnbGVfX21vcmUtc2V0dGluZ3NfX3N5c3RlbS1kYXJrLW1vZGUnLFxuICAgICAgICAgICAgICAgIF19XG4gICAgICAgICAgICAgICAgPlxuICAgICAgICAgICAgICAgICAgICA8Q2hlY2tCb3hcbiAgICAgICAgICAgICAgICAgICAgICAgIGNsYXNzPVwiaGVhZGVyX19hcHAtdG9nZ2xlX19tb3JlLXNldHRpbmdzX19zeXN0ZW0tZGFyay1tb2RlX19jaGVja2JveFwiXG4gICAgICAgICAgICAgICAgICAgICAgICBjaGVja2VkPXtpc1N5c3RlbUF1dG9tYXRpb259XG4gICAgICAgICAgICAgICAgICAgICAgICBvbmNoYW5nZT17KGUpID0+IGFjdGlvbnMuY2hhbmdlU2V0dGluZ3Moe2F1dG9tYXRpb246IGUudGFyZ2V0LmNoZWNrZWQgPyAnc3lzdGVtJyA6ICcnfSl9XG4gICAgICAgICAgICAgICAgICAgIC8+XG4gICAgICAgICAgICAgICAgICAgIDxCdXR0b25cbiAgICAgICAgICAgICAgICAgICAgICAgIGNsYXNzPXt7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgJ2hlYWRlcl9fYXBwLXRvZ2dsZV9fbW9yZS1zZXR0aW5nc19fc3lzdGVtLWRhcmstbW9kZV9fYnV0dG9uJzogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAnaGVhZGVyX19hcHAtdG9nZ2xlX19tb3JlLXNldHRpbmdzX19zeXN0ZW0tZGFyay1tb2RlX19idXR0b24tLWFjdGl2ZSc6IGlzU3lzdGVtQXV0b21hdGlvbixcbiAgICAgICAgICAgICAgICAgICAgICAgIH19XG4gICAgICAgICAgICAgICAgICAgICAgICBvbmNsaWNrPXsoKSA9PiBhY3Rpb25zLmNoYW5nZVNldHRpbmdzKHthdXRvbWF0aW9uOiBpc1N5c3RlbUF1dG9tYXRpb24gPyAnJyA6ICdzeXN0ZW0nfSl9XG4gICAgICAgICAgICAgICAgICAgID57Z2V0TG9jYWxNZXNzYWdlKCdzeXN0ZW1fZGFya19tb2RlJyl9PC9CdXR0b24+XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgPHAgY2xhc3M9XCJoZWFkZXJfX2FwcC10b2dnbGVfX21vcmUtc2V0dGluZ3NfX2Rlc2NyaXB0aW9uXCI+XG4gICAgICAgICAgICAgICAgICAgIHtnZXRMb2NhbE1lc3NhZ2UoJ3N5c3RlbV9kYXJrX21vZGVfZGVzY3JpcHRpb24nKX1cbiAgICAgICAgICAgICAgICA8L3A+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgPC9kaXY+XG4gICAgKTtcbn1cbiIsImltcG9ydCB7bX0gZnJvbSAnbWFsZXZpYyc7XG5pbXBvcnQge1Nob3J0Y3V0LCBUb2dnbGV9IGZyb20gJy4uLy4uLy4uL2NvbnRyb2xzJztcbmltcG9ydCB7Z2V0TG9jYWxNZXNzYWdlfSBmcm9tICcuLi8uLi8uLi8uLi91dGlscy9sb2NhbGVzJztcbmltcG9ydCB7RXh0V3JhcHBlciwgVGFiSW5mb30gZnJvbSAnLi4vLi4vLi4vLi4vZGVmaW5pdGlvbnMnO1xuaW1wb3J0IFN1bk1vb25JY29uIGZyb20gJy4uLy4uL21haW4tcGFnZS9zdW4tbW9vbi1pY29uJztcbmltcG9ydCBTeXN0ZW1JY29uIGZyb20gJy4uLy4uL21haW4tcGFnZS9zeXN0ZW0taWNvbic7XG5pbXBvcnQgV2F0Y2hJY29uIGZyb20gJy4uLy4uL21haW4tcGFnZS93YXRjaC1pY29uJztcbmltcG9ydCBTaXRlVG9nZ2xlIGZyb20gJy4uL3NpdGUtdG9nZ2xlJztcbmltcG9ydCBNb3JlVG9nZ2xlU2V0dGluZ3MgZnJvbSAnLi9tb3JlLXRvZ2dsZS1zZXR0aW5ncyc7XG5cbmZ1bmN0aW9uIG11bHRpbGluZSguLi5saW5lczogc3RyaW5nW10pIHtcbiAgICByZXR1cm4gbGluZXMuam9pbignXFxuJyk7XG59XG5cbnR5cGUgSGVhZGVyUHJvcHMgPSBFeHRXcmFwcGVyICYge1xuICAgIHRhYjogVGFiSW5mbztcbiAgICBvbk1vcmVUb2dnbGVTZXR0aW5nc0NsaWNrOiAoKSA9PiB2b2lkO1xufTtcblxuZnVuY3Rpb24gSGVhZGVyKHtkYXRhLCBhY3Rpb25zLCB0YWIsIG9uTW9yZVRvZ2dsZVNldHRpbmdzQ2xpY2t9OiBIZWFkZXJQcm9wcykge1xuXG4gICAgZnVuY3Rpb24gdG9nZ2xlRXh0ZW5zaW9uKGVuYWJsZWQpIHtcbiAgICAgICAgYWN0aW9ucy5jaGFuZ2VTZXR0aW5ncyh7XG4gICAgICAgICAgICBlbmFibGVkLFxuICAgICAgICAgICAgYXV0b21hdGlvbjogJycsXG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGNvbnN0IGlzQXV0b21hdGlvbiA9IEJvb2xlYW4oZGF0YS5zZXR0aW5ncy5hdXRvbWF0aW9uKTtcbiAgICBjb25zdCBpc1RpbWVBdXRvbWF0aW9uID0gZGF0YS5zZXR0aW5ncy5hdXRvbWF0aW9uID09PSAndGltZSc7XG4gICAgY29uc3QgaXNMb2NhdGlvbkF1dG9tYXRpb24gPSBkYXRhLnNldHRpbmdzLmF1dG9tYXRpb24gPT09ICdsb2NhdGlvbic7XG4gICAgY29uc3Qgbm93ID0gbmV3IERhdGUoKTtcblxuICAgIHJldHVybiAoXG4gICAgICAgIDxoZWFkZXIgY2xhc3M9XCJoZWFkZXJcIj5cbiAgICAgICAgICAgIDxhIGNsYXNzPVwiaGVhZGVyX19sb2dvXCIgaHJlZj1cImh0dHBzOi8vZGFya3JlYWRlci5vcmcvXCIgdGFyZ2V0PVwiX2JsYW5rXCIgcmVsPVwibm9vcGVuZXIgbm9yZWZlcnJlclwiPlxuICAgICAgICAgICAgICAgIERhcmsgUmVhZGVyXG4gICAgICAgICAgICA8L2E+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiaGVhZGVyX19jb250cm9sIGhlYWRlcl9fc2l0ZS10b2dnbGVcIj5cbiAgICAgICAgICAgICAgICA8U2l0ZVRvZ2dsZVxuICAgICAgICAgICAgICAgICAgICBkYXRhPXtkYXRhfVxuICAgICAgICAgICAgICAgICAgICB0YWI9e3RhYn1cbiAgICAgICAgICAgICAgICAgICAgYWN0aW9ucz17YWN0aW9uc31cbiAgICAgICAgICAgICAgICAvPlxuICAgICAgICAgICAgICAgIHt0YWIuaXNQcm90ZWN0ZWQgPyAoXG4gICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwiaGVhZGVyX19zaXRlLXRvZ2dsZV9fdW5hYmxlLXRleHRcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgIHtnZXRMb2NhbE1lc3NhZ2UoJ3BhZ2VfcHJvdGVjdGVkJyl9XG4gICAgICAgICAgICAgICAgICAgIDwvc3Bhbj5cbiAgICAgICAgICAgICAgICApIDogdGFiLmlzSW5EYXJrTGlzdCA/IChcbiAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJoZWFkZXJfX3NpdGUtdG9nZ2xlX191bmFibGUtdGV4dFwiPlxuICAgICAgICAgICAgICAgICAgICAgICAge2dldExvY2FsTWVzc2FnZSgncGFnZV9pbl9kYXJrX2xpc3QnKX1cbiAgICAgICAgICAgICAgICAgICAgPC9zcGFuPlxuICAgICAgICAgICAgICAgICkgOiAoXG4gICAgICAgICAgICAgICAgICAgIDxTaG9ydGN1dFxuICAgICAgICAgICAgICAgICAgICAgICAgY29tbWFuZE5hbWU9XCJhZGRTaXRlXCJcbiAgICAgICAgICAgICAgICAgICAgICAgIHNob3J0Y3V0cz17ZGF0YS5zaG9ydGN1dHN9XG4gICAgICAgICAgICAgICAgICAgICAgICB0ZXh0VGVtcGxhdGU9eyhob3RrZXkpID0+IChob3RrZXlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA/IG11bHRpbGluZShnZXRMb2NhbE1lc3NhZ2UoJ3RvZ2dsZV9jdXJyZW50X3NpdGUnKSwgaG90a2V5KVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDogZ2V0TG9jYWxNZXNzYWdlKCdzZXR1cF9ob3RrZXlfdG9nZ2xlX3NpdGUnKVxuICAgICAgICAgICAgICAgICAgICAgICAgKX1cbiAgICAgICAgICAgICAgICAgICAgICAgIG9uU2V0U2hvcnRjdXQ9eyhzaG9ydGN1dCkgPT4gYWN0aW9ucy5zZXRTaG9ydGN1dCgnYWRkU2l0ZScsIHNob3J0Y3V0KX1cbiAgICAgICAgICAgICAgICAgICAgLz5cbiAgICAgICAgICAgICAgICApfVxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiaGVhZGVyX19jb250cm9sIGhlYWRlcl9fYXBwLXRvZ2dsZVwiPlxuICAgICAgICAgICAgICAgIDxUb2dnbGUgY2hlY2tlZD17ZGF0YS5pc0VuYWJsZWR9IGxhYmVsT249e2dldExvY2FsTWVzc2FnZSgnb24nKX0gbGFiZWxPZmY9e2dldExvY2FsTWVzc2FnZSgnb2ZmJyl9IG9uQ2hhbmdlPXt0b2dnbGVFeHRlbnNpb259IC8+XG4gICAgICAgICAgICAgICAgPFNob3J0Y3V0XG4gICAgICAgICAgICAgICAgICAgIGNvbW1hbmROYW1lPVwidG9nZ2xlXCJcbiAgICAgICAgICAgICAgICAgICAgc2hvcnRjdXRzPXtkYXRhLnNob3J0Y3V0c31cbiAgICAgICAgICAgICAgICAgICAgdGV4dFRlbXBsYXRlPXsoaG90a2V5KSA9PiAoaG90a2V5XG4gICAgICAgICAgICAgICAgICAgICAgICA/IG11bHRpbGluZShnZXRMb2NhbE1lc3NhZ2UoJ3RvZ2dsZV9leHRlbnNpb24nKSwgaG90a2V5KVxuICAgICAgICAgICAgICAgICAgICAgICAgOiBnZXRMb2NhbE1lc3NhZ2UoJ3NldHVwX2hvdGtleV90b2dnbGVfZXh0ZW5zaW9uJylcbiAgICAgICAgICAgICAgICAgICAgKX1cbiAgICAgICAgICAgICAgICAgICAgb25TZXRTaG9ydGN1dD17KHNob3J0Y3V0KSA9PiBhY3Rpb25zLnNldFNob3J0Y3V0KCd0b2dnbGUnLCBzaG9ydGN1dCl9XG4gICAgICAgICAgICAgICAgLz5cbiAgICAgICAgICAgICAgICA8c3BhblxuICAgICAgICAgICAgICAgICAgICBjbGFzcz1cImhlYWRlcl9fYXBwLXRvZ2dsZV9fbW9yZS1idXR0b25cIlxuICAgICAgICAgICAgICAgICAgICBvbmNsaWNrPXtvbk1vcmVUb2dnbGVTZXR0aW5nc0NsaWNrfVxuICAgICAgICAgICAgICAgID48L3NwYW4+XG4gICAgICAgICAgICAgICAgPHNwYW5cbiAgICAgICAgICAgICAgICAgICAgY2xhc3M9e3tcbiAgICAgICAgICAgICAgICAgICAgICAgICdoZWFkZXJfX2FwcC10b2dnbGVfX3RpbWUnOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgJ2hlYWRlcl9fYXBwLXRvZ2dsZV9fdGltZS0tYWN0aXZlJzogaXNBdXRvbWF0aW9uLFxuICAgICAgICAgICAgICAgICAgICB9fVxuICAgICAgICAgICAgICAgID5cbiAgICAgICAgICAgICAgICAgICAgeyhpc1RpbWVBdXRvbWF0aW9uXG4gICAgICAgICAgICAgICAgICAgICAgICA/IDxXYXRjaEljb24gaG91cnM9e25vdy5nZXRIb3VycygpfSBtaW51dGVzPXtub3cuZ2V0TWludXRlcygpfSAvPlxuICAgICAgICAgICAgICAgICAgICAgICAgOiAoaXNMb2NhdGlvbkF1dG9tYXRpb25cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA/ICg8U3VuTW9vbkljb24gZGF0ZT17bm93fSBsYXRpdHVkZT17ZGF0YS5zZXR0aW5ncy5sb2NhdGlvbi5sYXRpdHVkZX0gbG9uZ2l0dWRlPXtkYXRhLnNldHRpbmdzLmxvY2F0aW9uLmxvbmdpdHVkZX0gLz4pXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgOiA8U3lzdGVtSWNvbiAvPikpfVxuICAgICAgICAgICAgICAgIDwvc3Bhbj5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICA8L2hlYWRlcj5cbiAgICApO1xufVxuXG5leHBvcnQge1xuICAgIEhlYWRlcixcbiAgICBNb3JlVG9nZ2xlU2V0dGluZ3MsIC8vIFRPRE86IEltcGxlbWVudCBwb3J0YWxzIHRvIHBsYWNlIGVsZW1lbnRzIGludG8gPGJvZHk+LlxufTtcbiIsImltcG9ydCB7bX0gZnJvbSAnbWFsZXZpYyc7XG5pbXBvcnQge2dldExvY2FsTWVzc2FnZX0gZnJvbSAnLi4vLi4vLi4vLi4vdXRpbHMvbG9jYWxlcyc7XG5pbXBvcnQge3dpdGhTdGF0ZSwgdXNlU3RhdGV9IGZyb20gJ21hbGV2aWMvc3RhdGUnO1xuXG5pbnRlcmZhY2UgTG9hZGVyUHJvcHMge1xuICAgIGNvbXBsZXRlOiBib29sZWFuO1xufVxuXG5pbnRlcmZhY2UgTG9hZGVyU3RhdGUge1xuICAgIGZpbmlzaGVkOiBib29sZWFuO1xufVxuXG5mdW5jdGlvbiBMb2FkZXIoe2NvbXBsZXRlID0gZmFsc2V9OiBMb2FkZXJQcm9wcykge1xuICAgIGNvbnN0IHtzdGF0ZSwgc2V0U3RhdGV9ID0gdXNlU3RhdGU8TG9hZGVyU3RhdGU+KHtmaW5pc2hlZDogZmFsc2V9KTtcbiAgICByZXR1cm4gKFxuICAgICAgICA8ZGl2XG4gICAgICAgICAgICBjbGFzcz17e1xuICAgICAgICAgICAgICAgICdsb2FkZXInOiB0cnVlLFxuICAgICAgICAgICAgICAgICdsb2FkZXItLWNvbXBsZXRlJzogY29tcGxldGUsXG4gICAgICAgICAgICAgICAgJ2xvYWRlci0tdHJhbnNpdGlvbi1lbmQnOiBzdGF0ZS5maW5pc2hlZCxcbiAgICAgICAgICAgIH19XG4gICAgICAgICAgICBvbnRyYW5zaXRpb25lbmQ9eygpID0+IHNldFN0YXRlKHtmaW5pc2hlZDogdHJ1ZX0pfVxuICAgICAgICA+XG4gICAgICAgICAgICA8bGFiZWwgY2xhc3M9XCJsb2FkZXJfX21lc3NhZ2VcIj57Z2V0TG9jYWxNZXNzYWdlKCdsb2FkaW5nX3BsZWFzZV93YWl0Jyl9PC9sYWJlbD5cbiAgICAgICAgPC9kaXY+XG4gICAgKTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgd2l0aFN0YXRlKExvYWRlcik7XG4iLCJpbXBvcnQge2dldFVJTGFuZ3VhZ2V9IGZyb20gJy4vbG9jYWxlcyc7XG5cbmV4cG9ydCBjb25zdCBCTE9HX1VSTCA9ICdodHRwczovL2RhcmtyZWFkZXIub3JnL2Jsb2cvJztcbmV4cG9ydCBjb25zdCBERVZUT09MU19ET0NTX1VSTCA9ICdodHRwczovL2dpdGh1Yi5jb20vYWxleGFuZGVyYnkvZGFya3JlYWRlciNob3ctdG8tY29udHJpYnV0ZSc7XG5leHBvcnQgY29uc3QgRE9OQVRFX1VSTCA9ICdodHRwczovL29wZW5jb2xsZWN0aXZlLmNvbS9kYXJrcmVhZGVyJztcbmV4cG9ydCBjb25zdCBHSVRIVUJfVVJMID0gJ2h0dHBzOi8vZ2l0aHViLmNvbS9kYXJrcmVhZGVyL2RhcmtyZWFkZXInO1xuZXhwb3J0IGNvbnN0IFBSSVZBQ1lfVVJMID0gJ2h0dHBzOi8vZGFya3JlYWRlci5vcmcvcHJpdmFjeS8nO1xuZXhwb3J0IGNvbnN0IFRXSVRURVJfVVJMID0gJ2h0dHBzOi8vdHdpdHRlci5jb20vZGFya3JlYWRlcmFwcCc7XG5leHBvcnQgY29uc3QgVU5JTlNUQUxMX1VSTCA9ICdodHRwczovL2RhcmtyZWFkZXIub3JnL2dvb2RsdWNrLyc7XG5cbmNvbnN0IGhlbHBMb2NhbGVzID0gW1xuICAgICdiZScsXG4gICAgJ2NzJyxcbiAgICAnZGUnLFxuICAgICdlbicsXG4gICAgJ2VzJyxcbiAgICAnZnInLFxuICAgICdubCcsXG4gICAgJ2l0JyxcbiAgICAncHQnLFxuICAgICdydScsXG4gICAgJ3poLUNOJyxcbiAgICAnemgtVFcnLFxuXTtcblxuZXhwb3J0IGZ1bmN0aW9uIGdldEhlbHBVUkwoKSB7XG4gICAgY29uc3QgbG9jYWxlID0gZ2V0VUlMYW5ndWFnZSgpO1xuICAgIGNvbnN0IG1hdGNoTG9jYWxlID0gaGVscExvY2FsZXMuZmluZCgoaGwpID0+IGhsID09PSBsb2NhbGUpIHx8IGhlbHBMb2NhbGVzLmZpbmQoKGhsKSA9PiBsb2NhbGUuc3RhcnRzV2l0aChobCkpIHx8ICdlbic7XG4gICAgcmV0dXJuIGBodHRwczovL2RhcmtyZWFkZXIub3JnL2hlbHAvJHttYXRjaExvY2FsZX0vYDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEJsb2dQb3N0VVJMKHBvc3RJZDogc3RyaW5nKSB7XG4gICAgcmV0dXJuIGAke0JMT0dfVVJMfSR7cG9zdElkfS9gO1xufVxuIiwiaW1wb3J0IHttfSBmcm9tICdtYWxldmljJztcbmltcG9ydCB7Z2V0TG9jYWxNZXNzYWdlfSBmcm9tICcuLi8uLi8uLi91dGlscy9sb2NhbGVzJztcbmltcG9ydCB7Q2hlY2tCb3gsIFRpbWVSYW5nZVBpY2tlciwgVGV4dEJveCwgQnV0dG9ufSBmcm9tICcuLi8uLi9jb250cm9scyc7XG5pbXBvcnQge1ZpZXdQcm9wc30gZnJvbSAnLi4vdHlwZXMnO1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBBdXRvbWF0aW9uUGFnZShwcm9wczogVmlld1Byb3BzKSB7XG4gICAgY29uc3QgaXNTeXN0ZW1BdXRvbWF0aW9uID0gcHJvcHMuZGF0YS5zZXR0aW5ncy5hdXRvbWF0aW9uID09PSAnc3lzdGVtJztcbiAgICBjb25zdCBsb2NhdGlvblNldHRpbmdzID0gcHJvcHMuZGF0YS5zZXR0aW5ncy5sb2NhdGlvbjtcbiAgICBjb25zdCB2YWx1ZXMgPSB7XG4gICAgICAgICdsYXRpdHVkZSc6IHtcbiAgICAgICAgICAgIG1pbjogLTkwLFxuICAgICAgICAgICAgbWF4OiA5MFxuICAgICAgICB9LFxuICAgICAgICAnbG9uZ2l0dWRlJzoge1xuICAgICAgICAgICAgbWluOiAtMTgwLFxuICAgICAgICAgICAgbWF4OiAxODAsXG4gICAgICAgIH0sXG4gICAgfTtcblxuICAgIGZ1bmN0aW9uIGdldExvY2F0aW9uU3RyaW5nKGxvY2F0aW9uOiBudW1iZXIpIHtcbiAgICAgICAgaWYgKGxvY2F0aW9uID09IG51bGwpIHtcbiAgICAgICAgICAgIHJldHVybiAnJztcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBgJHtsb2NhdGlvbn3CsGA7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbG9jYXRpb25DaGFuZ2VkKGlucHV0RWxlbWVudDogSFRNTElucHV0RWxlbWVudCwgbmV3VmFsdWU6IHN0cmluZywgdHlwZTogc3RyaW5nKSB7XG4gICAgICAgIGlmIChuZXdWYWx1ZS50cmltKCkgPT09ICcnKSB7XG4gICAgICAgICAgICBpbnB1dEVsZW1lbnQudmFsdWUgPSAnJztcblxuICAgICAgICAgICAgcHJvcHMuYWN0aW9ucy5jaGFuZ2VTZXR0aW5ncyh7XG4gICAgICAgICAgICAgICAgbG9jYXRpb246IHtcbiAgICAgICAgICAgICAgICAgICAgLi4ubG9jYXRpb25TZXR0aW5ncyxcbiAgICAgICAgICAgICAgICAgICAgW3R5cGVdOiBudWxsLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgbWluOiBudW1iZXIgPSB2YWx1ZXNbdHlwZV0ubWluO1xuICAgICAgICBjb25zdCBtYXg6IG51bWJlciA9IHZhbHVlc1t0eXBlXS5tYXg7XG5cbiAgICAgICAgbmV3VmFsdWUgPSBuZXdWYWx1ZS5yZXBsYWNlKCcsJywgJy4nKS5yZXBsYWNlKCfCsCcsICcnKTtcblxuICAgICAgICBsZXQgbnVtID0gTnVtYmVyKG5ld1ZhbHVlKTtcbiAgICAgICAgaWYgKGlzTmFOKG51bSkpIHtcbiAgICAgICAgICAgIG51bSA9IDA7XG4gICAgICAgIH0gZWxzZSBpZiAobnVtID4gbWF4KSB7XG4gICAgICAgICAgICBudW0gPSBtYXg7XG4gICAgICAgIH0gZWxzZSBpZiAobnVtIDwgbWluKSB7XG4gICAgICAgICAgICBudW0gPSBtaW47XG4gICAgICAgIH1cblxuICAgICAgICBpbnB1dEVsZW1lbnQudmFsdWUgPSBnZXRMb2NhdGlvblN0cmluZyhudW0pO1xuXG4gICAgICAgIHByb3BzLmFjdGlvbnMuY2hhbmdlU2V0dGluZ3Moe1xuICAgICAgICAgICAgbG9jYXRpb246IHtcbiAgICAgICAgICAgICAgICAuLi5sb2NhdGlvblNldHRpbmdzLFxuICAgICAgICAgICAgICAgIFt0eXBlXTogbnVtLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIChcbiAgICAgICAgPGRpdlxuICAgICAgICAgICAgY2xhc3M9eydhdXRvbWF0aW9uLXBhZ2UnfVxuICAgICAgICA+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXV0b21hdGlvbi1wYWdlX19saW5lXCI+XG4gICAgICAgICAgICAgICAgPENoZWNrQm94XG4gICAgICAgICAgICAgICAgICAgIGNoZWNrZWQ9e3Byb3BzLmRhdGEuc2V0dGluZ3MuYXV0b21hdGlvbiA9PT0gJ3RpbWUnfVxuICAgICAgICAgICAgICAgICAgICBvbmNoYW5nZT17KGU6IHsgdGFyZ2V0OiB7IGNoZWNrZWQ6IGFueSB9IH0pID0+IHByb3BzLmFjdGlvbnMuY2hhbmdlU2V0dGluZ3Moe2F1dG9tYXRpb246IGUudGFyZ2V0LmNoZWNrZWQgPyAndGltZScgOiAnJ30pfVxuICAgICAgICAgICAgICAgIC8+XG4gICAgICAgICAgICAgICAgPFRpbWVSYW5nZVBpY2tlclxuICAgICAgICAgICAgICAgICAgICBzdGFydFRpbWU9e3Byb3BzLmRhdGEuc2V0dGluZ3MudGltZS5hY3RpdmF0aW9ufVxuICAgICAgICAgICAgICAgICAgICBlbmRUaW1lPXtwcm9wcy5kYXRhLnNldHRpbmdzLnRpbWUuZGVhY3RpdmF0aW9ufVxuICAgICAgICAgICAgICAgICAgICBvbkNoYW5nZT17KFtzdGFydCwgZW5kXSkgPT4gcHJvcHMuYWN0aW9ucy5jaGFuZ2VTZXR0aW5ncyh7dGltZToge2FjdGl2YXRpb246IHN0YXJ0LCBkZWFjdGl2YXRpb246IGVuZH19KX1cbiAgICAgICAgICAgICAgICAvPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8cCBjbGFzcz1cImF1dG9tYXRpb24tcGFnZV9fZGVzY3JpcHRpb25cIj5cbiAgICAgICAgICAgICAgICB7Z2V0TG9jYWxNZXNzYWdlKCdzZXRfYWN0aXZlX2hvdXJzJyl9XG4gICAgICAgICAgICA8L3A+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiYXV0b21hdGlvbi1wYWdlX19saW5lIGF1dG9tYXRpb24tcGFnZV9fbG9jYXRpb25cIj5cbiAgICAgICAgICAgICAgICA8Q2hlY2tCb3hcbiAgICAgICAgICAgICAgICAgICAgY2hlY2tlZD17cHJvcHMuZGF0YS5zZXR0aW5ncy5hdXRvbWF0aW9uID09PSAnbG9jYXRpb24nfVxuICAgICAgICAgICAgICAgICAgICBvbmNoYW5nZT17KGU6IHsgdGFyZ2V0OiB7IGNoZWNrZWQ6IGFueSB9IH0pID0+IHByb3BzLmFjdGlvbnMuY2hhbmdlU2V0dGluZ3Moe2F1dG9tYXRpb246IGUudGFyZ2V0LmNoZWNrZWQgPyAnbG9jYXRpb24nIDogJyd9KX1cbiAgICAgICAgICAgICAgICAvPlxuICAgICAgICAgICAgICAgIDxUZXh0Qm94XG4gICAgICAgICAgICAgICAgICAgIGNsYXNzPVwiYXV0b21hdGlvbi1wYWdlX19sb2NhdGlvbl9fbGF0aXR1ZGVcIlxuICAgICAgICAgICAgICAgICAgICBwbGFjZWhvbGRlcj17Z2V0TG9jYWxNZXNzYWdlKCdsYXRpdHVkZScpfVxuICAgICAgICAgICAgICAgICAgICBvbmNoYW5nZT17KGU6IHsgdGFyZ2V0OiBIVE1MSW5wdXRFbGVtZW50IH0pID0+IGxvY2F0aW9uQ2hhbmdlZChlLnRhcmdldCwgZS50YXJnZXQudmFsdWUsICdsYXRpdHVkZScpfVxuICAgICAgICAgICAgICAgICAgICBvbmNyZWF0ZT17KG5vZGU6IEhUTUxJbnB1dEVsZW1lbnQpID0+IG5vZGUudmFsdWUgPSBnZXRMb2NhdGlvblN0cmluZyhsb2NhdGlvblNldHRpbmdzLmxhdGl0dWRlKX1cbiAgICAgICAgICAgICAgICAgICAgb25rZXlwcmVzcz17KGUpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChlLmtleSA9PT0gJ0VudGVyJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIChlLnRhcmdldCBhcyBIVE1MSW5wdXRFbGVtZW50KS5ibHVyKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH19XG4gICAgICAgICAgICAgICAgLz5cbiAgICAgICAgICAgICAgICA8VGV4dEJveFxuICAgICAgICAgICAgICAgICAgICBjbGFzcz1cImF1dG9tYXRpb24tcGFnZV9fbG9jYXRpb25fX2xvbmdpdHVkZVwiXG4gICAgICAgICAgICAgICAgICAgIHBsYWNlaG9sZGVyPXtnZXRMb2NhbE1lc3NhZ2UoJ2xvbmdpdHVkZScpfVxuICAgICAgICAgICAgICAgICAgICBvbmNoYW5nZT17KGU6IHsgdGFyZ2V0OiBIVE1MSW5wdXRFbGVtZW50IH0pID0+IGxvY2F0aW9uQ2hhbmdlZChlLnRhcmdldCwgZS50YXJnZXQudmFsdWUsICdsb25naXR1ZGUnKX1cbiAgICAgICAgICAgICAgICAgICAgb25jcmVhdGU9eyhub2RlOiBIVE1MSW5wdXRFbGVtZW50KSA9PiBub2RlLnZhbHVlID0gZ2V0TG9jYXRpb25TdHJpbmcobG9jYXRpb25TZXR0aW5ncy5sb25naXR1ZGUpfVxuICAgICAgICAgICAgICAgICAgICBvbmtleXByZXNzPXsoZSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGUua2V5ID09PSAnRW50ZXInKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgKGUudGFyZ2V0IGFzIEhUTUxJbnB1dEVsZW1lbnQpLmJsdXIoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfX1cbiAgICAgICAgICAgICAgICAvPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8cCBjbGFzcz1cImF1dG9tYXRpb24tcGFnZV9fbG9jYXRpb24tZGVzY3JpcHRpb25cIj5cbiAgICAgICAgICAgICAgICB7Z2V0TG9jYWxNZXNzYWdlKCdzZXRfbG9jYXRpb24nKX1cbiAgICAgICAgICAgIDwvcD5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9e1tcbiAgICAgICAgICAgICAgICAnYXV0b21hdGlvbi1wYWdlX19saW5lJyxcbiAgICAgICAgICAgICAgICAnYXV0b21hdGlvbi1wYWdlX19zeXN0ZW0tZGFyay1tb2RlJyxcbiAgICAgICAgICAgIF19XG4gICAgICAgICAgICA+XG4gICAgICAgICAgICAgICAgPENoZWNrQm94XG4gICAgICAgICAgICAgICAgICAgIGNsYXNzPVwiYXV0b21hdGlvbi1wYWdlX19zeXN0ZW0tZGFyay1tb2RlX19jaGVja2JveFwiXG4gICAgICAgICAgICAgICAgICAgIGNoZWNrZWQ9e2lzU3lzdGVtQXV0b21hdGlvbn1cbiAgICAgICAgICAgICAgICAgICAgb25jaGFuZ2U9eyhlOiB7IHRhcmdldDogeyBjaGVja2VkOiBhbnkgfSB9KSA9PiBwcm9wcy5hY3Rpb25zLmNoYW5nZVNldHRpbmdzKHthdXRvbWF0aW9uOiBlLnRhcmdldC5jaGVja2VkID8gJ3N5c3RlbScgOiAnJ30pfVxuICAgICAgICAgICAgICAgIC8+XG4gICAgICAgICAgICAgICAgPEJ1dHRvblxuICAgICAgICAgICAgICAgICAgICBjbGFzcz17e1xuICAgICAgICAgICAgICAgICAgICAgICAgJ2F1dG9tYXRpb24tcGFnZV9fc3lzdGVtLWRhcmstbW9kZV9fYnV0dG9uJzogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICdhdXRvbWF0aW9uLXBhZ2VfX3N5c3RlbS1kYXJrLW1vZGVfX2J1dHRvbi0tYWN0aXZlJzogaXNTeXN0ZW1BdXRvbWF0aW9uLFxuICAgICAgICAgICAgICAgICAgICB9fVxuICAgICAgICAgICAgICAgICAgICBvbmNsaWNrPXsoKSA9PiBwcm9wcy5hY3Rpb25zLmNoYW5nZVNldHRpbmdzKHthdXRvbWF0aW9uOiBpc1N5c3RlbUF1dG9tYXRpb24gPyAnJyA6ICdzeXN0ZW0nfSl9XG4gICAgICAgICAgICAgICAgPntnZXRMb2NhbE1lc3NhZ2UoJ3N5c3RlbV9kYXJrX21vZGUnKX1cbiAgICAgICAgICAgICAgICA8L0J1dHRvbj5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgPHAgY2xhc3M9XCJhdXRvbWF0aW9uLXBhZ2VfX2Rlc2NyaXB0aW9uXCI+XG4gICAgICAgICAgICAgICAge2dldExvY2FsTWVzc2FnZSgnc3lzdGVtX2RhcmtfbW9kZV9kZXNjcmlwdGlvbicpfVxuICAgICAgICAgICAgPC9wPlxuICAgICAgICA8L2Rpdj5cbiAgICApO1xufVxuIiwiaW1wb3J0IHttfSBmcm9tICdtYWxldmljJztcblxuZnVuY3Rpb24gQ29udHJvbEdyb3VwKFxuICAgIHByb3BzOiB7Y2xhc3M/OiBzdHJpbmd9LFxuICAgIGNvbnRyb2w6IE1hbGV2aWMuU3BlYyxcbiAgICBkZXNjcmlwdGlvbjogTWFsZXZpYy5TcGVjLFxuKSB7XG4gICAgcmV0dXJuIChcbiAgICAgICAgPHNwYW4gY2xhc3M9e1snY29udHJvbC1ncm91cCcsIHByb3BzLmNsYXNzXX0+XG4gICAgICAgICAgICB7Y29udHJvbH1cbiAgICAgICAgICAgIHtkZXNjcmlwdGlvbn1cbiAgICAgICAgPC9zcGFuPlxuICAgICk7XG59XG5cbmZ1bmN0aW9uIENvbnRyb2wocHJvcHM6IHtjbGFzcz86IHN0cmluZ30sIGNvbnRyb2w6IE1hbGV2aWMuQ2hpbGQpIHtcbiAgICByZXR1cm4gKFxuICAgICAgICA8c3BhbiBjbGFzcz17Wydjb250cm9sLWdyb3VwX19jb250cm9sJywgcHJvcHMuY2xhc3NdfSA+XG4gICAgICAgICAgICB7Y29udHJvbH1cbiAgICAgICAgPC9zcGFuPlxuICAgICk7XG59XG5cbmZ1bmN0aW9uIERlc2NyaXB0aW9uKHByb3BzOiB7Y2xhc3M/OiBzdHJpbmd9LCBkZXNjcmlwdGlvbjogTWFsZXZpYy5DaGlsZCkge1xuICAgIHJldHVybiAoXG4gICAgICAgIDxzcGFuIGNsYXNzPXtbJ2NvbnRyb2wtZ3JvdXBfX2Rlc2NyaXB0aW9uJywgcHJvcHMuY2xhc3NdfSA+XG4gICAgICAgICAgICB7ZGVzY3JpcHRpb259XG4gICAgICAgIDwvc3Bhbj5cbiAgICApO1xufVxuXG5leHBvcnQgZGVmYXVsdCBPYmplY3QuYXNzaWduKENvbnRyb2xHcm91cCwge0NvbnRyb2wsIERlc2NyaXB0aW9ufSk7XG4iLCJpbXBvcnQge219IGZyb20gJ21hbGV2aWMnO1xuaW1wb3J0IHtnZXRMb2NhbE1lc3NhZ2V9IGZyb20gJy4uLy4uLy4uL3V0aWxzL2xvY2FsZXMnO1xuaW1wb3J0IHtNdWx0aVN3aXRjaH0gZnJvbSAnLi4vLi4vY29udHJvbHMnO1xuaW1wb3J0IENvbnRyb2xHcm91cCBmcm9tICcuLi9jb250cm9sLWdyb3VwJztcbmltcG9ydCB7Vmlld1Byb3BzfSBmcm9tICcuLi90eXBlcyc7XG5pbXBvcnQgV2F0Y2hJY29uIGZyb20gJy4vd2F0Y2gtaWNvbic7XG5pbXBvcnQgU3VuTW9vbkljb24gZnJvbSAnLi9zdW4tbW9vbi1pY29uJztcbmltcG9ydCBTeXN0ZW1JY29uIGZyb20gJy4vc3lzdGVtLWljb24nO1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBBcHBTd2l0Y2gocHJvcHM6IFZpZXdQcm9wcykge1xuICAgIGNvbnN0IGlzT24gPSBwcm9wcy5kYXRhLnNldHRpbmdzLmVuYWJsZWQgPT09IHRydWUgJiYgIXByb3BzLmRhdGEuc2V0dGluZ3MuYXV0b21hdGlvbjtcbiAgICBjb25zdCBpc09mZiA9IHByb3BzLmRhdGEuc2V0dGluZ3MuZW5hYmxlZCA9PT0gZmFsc2UgJiYgIXByb3BzLmRhdGEuc2V0dGluZ3MuYXV0b21hdGlvbjtcbiAgICBjb25zdCBpc0F1dG9tYXRpb24gPSBCb29sZWFuKHByb3BzLmRhdGEuc2V0dGluZ3MuYXV0b21hdGlvbik7XG4gICAgY29uc3QgaXNUaW1lQXV0b21hdGlvbiA9IHByb3BzLmRhdGEuc2V0dGluZ3MuYXV0b21hdGlvbiA9PT0gJ3RpbWUnO1xuICAgIGNvbnN0IGlzTG9jYXRpb25BdXRvbWF0aW9uID0gcHJvcHMuZGF0YS5zZXR0aW5ncy5hdXRvbWF0aW9uID09PSAnbG9jYXRpb24nO1xuICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCk7XG5cbiAgICAvLyBUT0RPOiBSZXBsYWNlIG1lc3NhZ2VzIHdpdGggc29tZSBJRHMuXG4gICAgY29uc3QgdmFsdWVzID0gW1xuICAgICAgICBnZXRMb2NhbE1lc3NhZ2UoJ29uJyksXG4gICAgICAgICdBdXRvJyxcbiAgICAgICAgZ2V0TG9jYWxNZXNzYWdlKCdvZmYnKSxcbiAgICBdO1xuICAgIGNvbnN0IHZhbHVlID0gaXNPbiA/IHZhbHVlc1swXSA6IGlzT2ZmID8gdmFsdWVzWzJdIDogdmFsdWVzWzFdO1xuXG4gICAgZnVuY3Rpb24gb25Td2l0Y2hDaGFuZ2Uodjogc3RyaW5nKSB7XG4gICAgICAgIGNvbnN0IGluZGV4ID0gdmFsdWVzLmluZGV4T2Yodik7XG4gICAgICAgIGlmIChpbmRleCA9PT0gMCkge1xuICAgICAgICAgICAgcHJvcHMuYWN0aW9ucy5jaGFuZ2VTZXR0aW5ncyh7XG4gICAgICAgICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICAgICAgICBhdXRvbWF0aW9uOiAnJyxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2UgaWYgKGluZGV4ID09PSAyKSB7XG4gICAgICAgICAgICBwcm9wcy5hY3Rpb25zLmNoYW5nZVNldHRpbmdzKHtcbiAgICAgICAgICAgICAgICBlbmFibGVkOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBhdXRvbWF0aW9uOiAnJyxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2UgaWYgKGluZGV4ID09PSAxKSB7XG4gICAgICAgICAgICBwcm9wcy5hY3Rpb25zLmNoYW5nZVNldHRpbmdzKHtcbiAgICAgICAgICAgICAgICBhdXRvbWF0aW9uOiAnc3lzdGVtJyxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgZGVzY3JpcHRpb25UZXh0ID0gaXNPbiA/XG4gICAgICAgICdFeHRlbnNpb24gaXMgZW5hYmxlZCcgOlxuICAgICAgICBpc09mZiA/XG4gICAgICAgICAgICAnRXh0ZW5zaW9uIGlzIGRpc2FibGVkJyA6XG4gICAgICAgICAgICBpc1RpbWVBdXRvbWF0aW9uID9cbiAgICAgICAgICAgICAgICAnU3dpdGNoZXMgYWNjb3JkaW5nIHRvIHNwZWNpZmllZCB0aW1lJyA6XG4gICAgICAgICAgICAgICAgaXNMb2NhdGlvbkF1dG9tYXRpb24gP1xuICAgICAgICAgICAgICAgICAgICAnU3dpdGNoZWQgYWNjb3JkaW5nIHRvIGxvY2F0aW9uJyA6XG4gICAgICAgICAgICAgICAgICAgICdTd2l0Y2hlcyBhY2NvcmRpbmcgdG8gc3lzdGVtIGRhcmsgbW9kZSc7XG4gICAgY29uc3QgZGVzY3JpcHRpb24gPSAoXG4gICAgICAgIDxzcGFuXG4gICAgICAgICAgICBjbGFzcz17e1xuICAgICAgICAgICAgICAgICdhcHAtc3dpdGNoX19kZXNjcmlwdGlvbic6IHRydWUsXG4gICAgICAgICAgICAgICAgJ2FwcC1zd2l0Y2hfX2Rlc2NyaXB0aW9uLS1vbic6IHByb3BzLmRhdGEuaXNFbmFibGVkLFxuICAgICAgICAgICAgICAgICdhcHAtc3dpdGNoX19kZXNjcmlwdGlvbi0tb2ZmJzogIXByb3BzLmRhdGEuaXNFbmFibGVkLFxuICAgICAgICAgICAgfX1cbiAgICAgICAgPlxuICAgICAgICAgICAge2Rlc2NyaXB0aW9uVGV4dH1cbiAgICAgICAgPC9zcGFuPlxuICAgICk7XG5cbiAgICByZXR1cm4gKFxuICAgICAgICA8Q29udHJvbEdyb3VwIGNsYXNzPVwiYXBwLXN3aXRjaFwiPlxuICAgICAgICAgICAgPENvbnRyb2xHcm91cC5Db250cm9sPlxuICAgICAgICAgICAgICAgIDxNdWx0aVN3aXRjaFxuICAgICAgICAgICAgICAgICAgICBjbGFzcz1cImFwcC1zd2l0Y2hfX2NvbnRyb2xcIlxuICAgICAgICAgICAgICAgICAgICBvcHRpb25zPXt2YWx1ZXN9XG4gICAgICAgICAgICAgICAgICAgIHZhbHVlPXt2YWx1ZX1cbiAgICAgICAgICAgICAgICAgICAgb25DaGFuZ2U9e29uU3dpdGNoQ2hhbmdlfVxuICAgICAgICAgICAgICAgID5cbiAgICAgICAgICAgICAgICAgICAgPHNwYW5cbiAgICAgICAgICAgICAgICAgICAgICAgIGNsYXNzPXt7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgJ2FwcC1zd2l0Y2hfX3RpbWUnOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICdhcHAtc3dpdGNoX190aW1lLS1hY3RpdmUnOiBpc0F1dG9tYXRpb24sXG4gICAgICAgICAgICAgICAgICAgICAgICB9fVxuICAgICAgICAgICAgICAgICAgICA+XG4gICAgICAgICAgICAgICAgICAgICAgICB7KGlzVGltZUF1dG9tYXRpb25cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA/IDxXYXRjaEljb24gaG91cnM9e25vdy5nZXRIb3VycygpfSBtaW51dGVzPXtub3cuZ2V0TWludXRlcygpfSAvPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDogKGlzTG9jYXRpb25BdXRvbWF0aW9uXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgID8gKDxTdW5Nb29uSWNvbiBkYXRlPXtub3d9IGxhdGl0dWRlPXtwcm9wcy5kYXRhLnNldHRpbmdzLmxvY2F0aW9uLmxhdGl0dWRlfSBsb25naXR1ZGU9e3Byb3BzLmRhdGEuc2V0dGluZ3MubG9jYXRpb24ubG9uZ2l0dWRlfSAvPilcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgOiA8U3lzdGVtSWNvbiAvPikpfVxuICAgICAgICAgICAgICAgICAgICA8L3NwYW4+XG4gICAgICAgICAgICAgICAgPC9NdWx0aVN3aXRjaD5cbiAgICAgICAgICAgIDwvQ29udHJvbEdyb3VwLkNvbnRyb2w+XG4gICAgICAgICAgICA8Q29udHJvbEdyb3VwLkRlc2NyaXB0aW9uPlxuICAgICAgICAgICAgICAgIHtkZXNjcmlwdGlvbn1cbiAgICAgICAgICAgIDwvQ29udHJvbEdyb3VwLkRlc2NyaXB0aW9uPlxuICAgICAgICA8L0NvbnRyb2xHcm91cD5cbiAgICApO1xufVxuIiwiaW1wb3J0IHttfSBmcm9tICdtYWxldmljJztcbmltcG9ydCB7Z2V0SGVscFVSTH0gZnJvbSAnLi4vLi4vLi4vdXRpbHMvbGlua3MnO1xuaW1wb3J0IHtnZXRMb2NhbE1lc3NhZ2V9IGZyb20gJy4uLy4uLy4uL3V0aWxzL2xvY2FsZXMnO1xuaW1wb3J0IENvbnRyb2xHcm91cCBmcm9tICcuLi9jb250cm9sLWdyb3VwJztcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gSGVscEdyb3VwKCkge1xuICAgIHJldHVybiAoXG4gICAgICAgIDxDb250cm9sR3JvdXA+XG4gICAgICAgICAgICA8Q29udHJvbEdyb3VwLkNvbnRyb2w+XG4gICAgICAgICAgICAgICAgPGEgY2xhc3M9XCJtLWhlbHAtYnV0dG9uXCIgaHJlZj17Z2V0SGVscFVSTCgpfSB0YXJnZXQ9XCJfYmxhbmtcIiByZWw9XCJub29wZW5lciBub3JlZmVycmVyXCI+XG4gICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwibS1oZWxwLWJ1dHRvbl9fdGV4dFwiPlxuICAgICAgICAgICAgICAgICAgICAgICAge2dldExvY2FsTWVzc2FnZSgnaGVscCcpfVxuICAgICAgICAgICAgICAgICAgICA8L3NwYW4+XG4gICAgICAgICAgICAgICAgPC9hPlxuICAgICAgICAgICAgPC9Db250cm9sR3JvdXAuQ29udHJvbD5cbiAgICAgICAgPC9Db250cm9sR3JvdXA+XG4gICAgKTtcbn1cbiIsImltcG9ydCB7bX0gZnJvbSAnbWFsZXZpYyc7XG5pbXBvcnQge2lzVVJMRW5hYmxlZCwgaXNQREZ9IGZyb20gJy4uLy4uLy4uL3V0aWxzL3VybCc7XG5pbXBvcnQgU2l0ZVRvZ2dsZSBmcm9tICcuLi9jb21wb25lbnRzL3NpdGUtdG9nZ2xlJztcbmltcG9ydCBDb250cm9sR3JvdXAgZnJvbSAnLi4vY29udHJvbC1ncm91cCc7XG5pbXBvcnQge1ZpZXdQcm9wc30gZnJvbSAnLi4vdHlwZXMnO1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBTaXRlVG9nZ2xlR3JvdXAocHJvcHM6IFZpZXdQcm9wcykge1xuICAgIGNvbnN0IGlzUGFnZUVuYWJsZWQgPSBpc1VSTEVuYWJsZWQocHJvcHMudGFiLnVybCwgcHJvcHMuZGF0YS5zZXR0aW5ncywgcHJvcHMudGFiKTtcbiAgICBjb25zdCBkZXNjcmlwdGlvblRleHQgPSBpc1BERihwcm9wcy50YWIudXJsKSA/XG4gICAgICAgIGlzUGFnZUVuYWJsZWQgP1xuICAgICAgICAgICAgJ0VuYWJsZWQgZm9yIFBERiBmaWxlcycgOlxuICAgICAgICAgICAgJ0Rpc2FibGVkIGZvciBQREYgZmlsZXMnIDpcbiAgICAgICAgaXNQYWdlRW5hYmxlZCA/XG4gICAgICAgICAgICAnRW5hYmxlZCBmb3IgY3VycmVudCB3ZWJzaXRlJyA6XG4gICAgICAgICAgICAnRGlzYWJsZWQgZm9yIGN1cnJlbnQgd2Vic2l0ZSc7XG4gICAgY29uc3QgZGVzY3JpcHRpb24gPSAoXG4gICAgICAgIDxzcGFuXG4gICAgICAgICAgICBjbGFzcz17e1xuICAgICAgICAgICAgICAgICdzaXRlLXRvZ2dsZS1ncm91cF9fZGVzY3JpcHRpb24nOiB0cnVlLFxuICAgICAgICAgICAgICAgICdzaXRlLXRvZ2dsZS1ncm91cF9fZGVzY3JpcHRpb24tLW9uJzogaXNQYWdlRW5hYmxlZCxcbiAgICAgICAgICAgICAgICAnc2l0ZS10b2dnbGUtZ3JvdXBfX2Rlc2NyaXB0aW9uLS1vZmYnOiAhaXNQYWdlRW5hYmxlZCxcbiAgICAgICAgICAgIH19XG4gICAgICAgID57ZGVzY3JpcHRpb25UZXh0fTwvc3Bhbj5cbiAgICApO1xuXG4gICAgcmV0dXJuIChcbiAgICAgICAgPENvbnRyb2xHcm91cCBjbGFzcz1cInNpdGUtdG9nZ2xlLWdyb3VwXCI+XG4gICAgICAgICAgICA8Q29udHJvbEdyb3VwLkNvbnRyb2wgY2xhc3M9XCJzaXRlLXRvZ2dsZS1ncm91cF9fY29udHJvbFwiPlxuICAgICAgICAgICAgICAgIDxTaXRlVG9nZ2xlIHsuLi5wcm9wc30gLz5cbiAgICAgICAgICAgIDwvQ29udHJvbEdyb3VwLkNvbnRyb2w+XG4gICAgICAgICAgICA8Q29udHJvbEdyb3VwLkRlc2NyaXB0aW9uPlxuICAgICAgICAgICAgICAgIHtkZXNjcmlwdGlvbn1cbiAgICAgICAgICAgIDwvQ29udHJvbEdyb3VwLkRlc2NyaXB0aW9uPlxuICAgICAgICA8L0NvbnRyb2xHcm91cD5cbiAgICApO1xufVxuIiwiaW1wb3J0IHttfSBmcm9tICdtYWxldmljJztcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gVGhlbWVDb250cm9sKHByb3BzOiB7bGFiZWw6IE1hbGV2aWMuQ2hpbGR9LCBjb250cm9sczogTWFsZXZpYy5DaGlsZFtdKSB7XG4gICAgcmV0dXJuIChcbiAgICAgICAgPHNwYW4gY2xhc3M9XCJ0aGVtZS1jb250cm9sXCI+XG4gICAgICAgICAgICA8bGFiZWwgY2xhc3M9XCJ0aGVtZS1jb250cm9sX19sYWJlbFwiPlxuICAgICAgICAgICAgICAgIHtwcm9wcy5sYWJlbH1cbiAgICAgICAgICAgIDwvbGFiZWw+XG4gICAgICAgICAgICB7Y29udHJvbHN9XG4gICAgICAgIDwvc3Bhbj5cbiAgICApO1xufVxuIiwiaW1wb3J0IHttfSBmcm9tICdtYWxldmljJztcbmltcG9ydCB7Q29sb3JQaWNrZXJ9IGZyb20gJy4uLy4uLy4uL2NvbnRyb2xzJztcbmltcG9ydCBUaGVtZUNvbnRyb2wgZnJvbSAnLi90aGVtZS1jb250cm9sJztcblxudHlwZSBCZ0NvbG9yVmFsdWUgPSAnYXV0bycgfCBzdHJpbmc7XG5cbmludGVyZmFjZSBCZ0NvbG9yRWRpdG9yUHJvcHMge1xuICAgIHZhbHVlOiBCZ0NvbG9yVmFsdWU7XG4gICAgb25DaGFuZ2U6ICh2YWx1ZTogQmdDb2xvclZhbHVlKSA9PiB2b2lkO1xuICAgIGNhblJlc2V0OiBib29sZWFuO1xuICAgIG9uUmVzZXQ6ICgpID0+IHZvaWQ7XG59XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIEJhY2tncm91bmRDb2xvckVkaXRvcihwcm9wczogQmdDb2xvckVkaXRvclByb3BzKSB7XG4gICAgcmV0dXJuIChcbiAgICAgICAgPFRoZW1lQ29udHJvbCBsYWJlbD1cIkJhY2tncm91bmRcIj5cbiAgICAgICAgICAgIDxDb2xvclBpY2tlclxuICAgICAgICAgICAgICAgIGNvbG9yPXtwcm9wcy52YWx1ZX1cbiAgICAgICAgICAgICAgICBvbkNoYW5nZT17cHJvcHMub25DaGFuZ2V9XG4gICAgICAgICAgICAgICAgY2FuUmVzZXQ9e3Byb3BzLmNhblJlc2V0fVxuICAgICAgICAgICAgICAgIG9uUmVzZXQ9e3Byb3BzLm9uUmVzZXR9XG4gICAgICAgICAgICAvPlxuICAgICAgICA8L1RoZW1lQ29udHJvbD5cbiAgICApO1xufVxuIiwiZXhwb3J0IGZ1bmN0aW9uIGZvcm1hdFBlcmNlbnQodjogbnVtYmVyKSB7XG4gICAgcmV0dXJuIGAke3Z9JWA7XG59XG4iLCJpbXBvcnQge219IGZyb20gJ21hbGV2aWMnO1xuaW1wb3J0IHtnZXRMb2NhbE1lc3NhZ2V9IGZyb20gJy4uLy4uLy4uLy4uL3V0aWxzL2xvY2FsZXMnO1xuaW1wb3J0IHtTbGlkZXJ9IGZyb20gJy4uLy4uLy4uL2NvbnRyb2xzJztcbmltcG9ydCB7Zm9ybWF0UGVyY2VudH0gZnJvbSAnLi9mb3JtYXQnO1xuaW1wb3J0IFRoZW1lQ29udHJvbCBmcm9tICcuL3RoZW1lLWNvbnRyb2wnO1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBCcmlnaHRuZXNzKHByb3BzOiB7dmFsdWU6IG51bWJlcjsgb25DaGFuZ2U6ICh2OiBudW1iZXIpID0+IHZvaWR9KSB7XG4gICAgcmV0dXJuIChcbiAgICAgICAgPFRoZW1lQ29udHJvbCBsYWJlbD17Z2V0TG9jYWxNZXNzYWdlKCdicmlnaHRuZXNzJyl9PlxuICAgICAgICAgICAgPFNsaWRlclxuICAgICAgICAgICAgICAgIHZhbHVlPXtwcm9wcy52YWx1ZX1cbiAgICAgICAgICAgICAgICBtaW49ezUwfVxuICAgICAgICAgICAgICAgIG1heD17MTUwfVxuICAgICAgICAgICAgICAgIHN0ZXA9ezF9XG4gICAgICAgICAgICAgICAgZm9ybWF0VmFsdWU9e2Zvcm1hdFBlcmNlbnR9XG4gICAgICAgICAgICAgICAgb25DaGFuZ2U9e3Byb3BzLm9uQ2hhbmdlfVxuICAgICAgICAgICAgLz5cbiAgICAgICAgPC9UaGVtZUNvbnRyb2w+XG4gICAgKTtcbn1cbiIsImltcG9ydCB7bX0gZnJvbSAnbWFsZXZpYyc7XG5pbXBvcnQge2dldExvY2FsTWVzc2FnZX0gZnJvbSAnLi4vLi4vLi4vLi4vdXRpbHMvbG9jYWxlcyc7XG5pbXBvcnQge1NsaWRlcn0gZnJvbSAnLi4vLi4vLi4vY29udHJvbHMnO1xuaW1wb3J0IHtmb3JtYXRQZXJjZW50fSBmcm9tICcuL2Zvcm1hdCc7XG5pbXBvcnQgVGhlbWVDb250cm9sIGZyb20gJy4vdGhlbWUtY29udHJvbCc7XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIENvbnRyYXN0KHByb3BzOiB7dmFsdWU6IG51bWJlcjsgb25DaGFuZ2U6ICh2OiBudW1iZXIpID0+IHZvaWR9KSB7XG4gICAgcmV0dXJuIChcbiAgICAgICAgPFRoZW1lQ29udHJvbCBsYWJlbD17Z2V0TG9jYWxNZXNzYWdlKCdjb250cmFzdCcpfT5cbiAgICAgICAgICAgIDxTbGlkZXJcbiAgICAgICAgICAgICAgICB2YWx1ZT17cHJvcHMudmFsdWV9XG4gICAgICAgICAgICAgICAgbWluPXs1MH1cbiAgICAgICAgICAgICAgICBtYXg9ezE1MH1cbiAgICAgICAgICAgICAgICBzdGVwPXsxfVxuICAgICAgICAgICAgICAgIGZvcm1hdFZhbHVlPXtmb3JtYXRQZXJjZW50fVxuICAgICAgICAgICAgICAgIG9uQ2hhbmdlPXtwcm9wcy5vbkNoYW5nZX1cbiAgICAgICAgICAgIC8+XG4gICAgICAgIDwvVGhlbWVDb250cm9sPlxuICAgICk7XG59XG4iLCJpbXBvcnQge219IGZyb20gJ21hbGV2aWMnO1xuaW1wb3J0IHtTZWxlY3R9IGZyb20gJy4uLy4uLy4uL2NvbnRyb2xzJztcbmltcG9ydCBUaGVtZUNvbnRyb2wgZnJvbSAnLi90aGVtZS1jb250cm9sJztcbmltcG9ydCB7VGhlbWV9IGZyb20gJy4uLy4uLy4uLy4uL2RlZmluaXRpb25zJztcblxuaW50ZXJmYWNlIEZvbnRQaWNrZXJQcm9wcyB7XG4gICAgdGhlbWU6IFRoZW1lO1xuICAgIGZvbnRzOiBzdHJpbmdbXTtcbiAgICBvbkNoYW5nZTogKGZvbnQ6IHN0cmluZykgPT4gdm9pZDtcbn1cblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gRm9udFBpY2tlcihwcm9wczogRm9udFBpY2tlclByb3BzKSB7XG4gICAgcmV0dXJuIChcbiAgICAgICAgPFRoZW1lQ29udHJvbCBsYWJlbD1cIkZvbnQgbmFtZVwiPlxuICAgICAgICAgICAgPFNlbGVjdFxuICAgICAgICAgICAgICAgIGNsYXNzPXt7XG4gICAgICAgICAgICAgICAgICAgICdmb250LXBpY2tlcic6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICdmb250LXBpY2tlci0tZGlzYWJsZWQnOiAhcHJvcHMudGhlbWUudXNlRm9udCxcbiAgICAgICAgICAgICAgICB9fVxuICAgICAgICAgICAgICAgIHZhbHVlPXtwcm9wcy50aGVtZS5mb250RmFtaWx5fVxuICAgICAgICAgICAgICAgIG9uQ2hhbmdlPXtwcm9wcy5vbkNoYW5nZX1cbiAgICAgICAgICAgICAgICBvcHRpb25zPXtwcm9wcy5mb250cy5yZWR1Y2UoKG1hcCwgZm9udCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBtYXBbZm9udF0gPSAoXG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPXt7J2ZvbnQtZmFtaWx5JzogZm9udH19PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHtmb250fVxuICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBtYXA7XG4gICAgICAgICAgICAgICAgfSwge30gYXMge1tmb250OiBzdHJpbmddOiBNYWxldmljLlNwZWN9KX1cbiAgICAgICAgICAgIC8+XG4gICAgICAgIDwvVGhlbWVDb250cm9sPlxuICAgICk7XG59XG4iLCJpbXBvcnQge219IGZyb20gJ21hbGV2aWMnO1xuaW1wb3J0IHtnZXRMb2NhbE1lc3NhZ2V9IGZyb20gJy4uLy4uLy4uLy4uL3V0aWxzL2xvY2FsZXMnO1xuaW1wb3J0IHtTbGlkZXJ9IGZyb20gJy4uLy4uLy4uL2NvbnRyb2xzJztcbmltcG9ydCB7Zm9ybWF0UGVyY2VudH0gZnJvbSAnLi9mb3JtYXQnO1xuaW1wb3J0IFRoZW1lQ29udHJvbCBmcm9tICcuL3RoZW1lLWNvbnRyb2wnO1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBHcmF5c2NhbGUocHJvcHM6IHt2YWx1ZTogbnVtYmVyOyBvbkNoYW5nZTogKHY6IG51bWJlcikgPT4gdm9pZH0pIHtcbiAgICByZXR1cm4gKFxuICAgICAgICA8VGhlbWVDb250cm9sIGxhYmVsPXtnZXRMb2NhbE1lc3NhZ2UoJ2dyYXlzY2FsZScpfT5cbiAgICAgICAgICAgIDxTbGlkZXJcbiAgICAgICAgICAgICAgICB2YWx1ZT17cHJvcHMudmFsdWV9XG4gICAgICAgICAgICAgICAgbWluPXswfVxuICAgICAgICAgICAgICAgIG1heD17MTAwfVxuICAgICAgICAgICAgICAgIHN0ZXA9ezF9XG4gICAgICAgICAgICAgICAgZm9ybWF0VmFsdWU9e2Zvcm1hdFBlcmNlbnR9XG4gICAgICAgICAgICAgICAgb25DaGFuZ2U9e3Byb3BzLm9uQ2hhbmdlfVxuICAgICAgICAgICAgLz5cbiAgICAgICAgPC9UaGVtZUNvbnRyb2w+XG4gICAgKTtcbn1cbiIsImV4cG9ydCBkZWZhdWx0IHtcbiAgICBjc3NGaWx0ZXI6ICdjc3NGaWx0ZXInLFxuICAgIHN2Z0ZpbHRlcjogJ3N2Z0ZpbHRlcicsXG4gICAgc3RhdGljVGhlbWU6ICdzdGF0aWNUaGVtZScsXG4gICAgZHluYW1pY1RoZW1lOiAnZHluYW1pY1RoZW1lJyxcbn07XG4iLCJpbXBvcnQge219IGZyb20gJ21hbGV2aWMnO1xuaW1wb3J0IFRoZW1lRW5naW5lcyBmcm9tICcuLi8uLi8uLi8uLi9nZW5lcmF0b3JzL3RoZW1lLWVuZ2luZXMnO1xuaW1wb3J0IHtnZXRMb2NhbE1lc3NhZ2V9IGZyb20gJy4uLy4uLy4uLy4uL3V0aWxzL2xvY2FsZXMnO1xuaW1wb3J0IHtEcm9wRG93bn0gZnJvbSAnLi4vLi4vLi4vY29udHJvbHMnO1xuaW1wb3J0IFRoZW1lQ29udHJvbCBmcm9tICcuL3RoZW1lLWNvbnRyb2wnO1xuaW1wb3J0IHtpc0ZpcmVmb3h9IGZyb20gJy4uLy4uLy4uLy4uL3V0aWxzL3BsYXRmb3JtJztcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gTW9kZShwcm9wczoge21vZGU6IHN0cmluZzsgb25DaGFuZ2U6IChtb2RlOiBzdHJpbmcpID0+IHZvaWR9KSB7XG5cbiAgICBmdW5jdGlvbiBvcGVuQ1NTRWRpdG9yKCkge1xuICAgICAgICBjaHJvbWUud2luZG93cy5jcmVhdGUoe1xuICAgICAgICAgICAgdHlwZTogJ3BhbmVsJyxcbiAgICAgICAgICAgIHVybDogaXNGaXJlZm94KCkgPyAnLi4vc3R5bGVzaGVldC1lZGl0b3IvaW5kZXguaHRtbCcgOiAndWkvc3R5bGVzaGVldC1lZGl0b3IvaW5kZXguaHRtbCcsXG4gICAgICAgICAgICB3aWR0aDogNjAwLFxuICAgICAgICAgICAgaGVpZ2h0OiA2MDAsXG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGNvbnN0IG1vZGVzID0gW1xuICAgICAgICB7aWQ6IFRoZW1lRW5naW5lcy5keW5hbWljVGhlbWUsIGNvbnRlbnQ6IGdldExvY2FsTWVzc2FnZSgnZW5naW5lX2R5bmFtaWMnKX0sXG4gICAgICAgIHtpZDogVGhlbWVFbmdpbmVzLmNzc0ZpbHRlciwgY29udGVudDogZ2V0TG9jYWxNZXNzYWdlKCdlbmdpbmVfZmlsdGVyJyl9LFxuICAgICAgICB7aWQ6IFRoZW1lRW5naW5lcy5zdmdGaWx0ZXIsIGNvbnRlbnQ6IGdldExvY2FsTWVzc2FnZSgnZW5naW5lX2ZpbHRlcl9wbHVzJyl9LFxuICAgICAgICB7aWQ6IFRoZW1lRW5naW5lcy5zdGF0aWNUaGVtZSwgY29udGVudDogZ2V0TG9jYWxNZXNzYWdlKCdlbmdpbmVfc3RhdGljJyl9LFxuICAgIF07XG4gICAgcmV0dXJuIChcbiAgICAgICAgPFRoZW1lQ29udHJvbCBsYWJlbD1cIk1vZGVcIj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJtb2RlLWNvbnRyb2wtY29udGFpbmVyXCI+XG4gICAgICAgICAgICAgICAgPERyb3BEb3duXG4gICAgICAgICAgICAgICAgICAgIHNlbGVjdGVkPXttb2Rlcy5maW5kKChtKSA9PiBtLmlkID09PSBwcm9wcy5tb2RlKS5pZH1cbiAgICAgICAgICAgICAgICAgICAgb3B0aW9ucz17bW9kZXN9XG4gICAgICAgICAgICAgICAgICAgIG9uQ2hhbmdlPXtwcm9wcy5vbkNoYW5nZX1cbiAgICAgICAgICAgICAgICAvPlxuICAgICAgICAgICAgICAgIDxzcGFuXG4gICAgICAgICAgICAgICAgICAgIGNsYXNzPXt7XG4gICAgICAgICAgICAgICAgICAgICAgICAnc3RhdGljLWVkaXQtYnV0dG9uJzogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICdzdGF0aWMtZWRpdC1idXR0b24tLWhpZGRlbic6IHByb3BzLm1vZGUgIT09IFRoZW1lRW5naW5lcy5zdGF0aWNUaGVtZSxcbiAgICAgICAgICAgICAgICAgICAgfX1cbiAgICAgICAgICAgICAgICAgICAgb25jbGljaz17b3BlbkNTU0VkaXRvcn1cbiAgICAgICAgICAgICAgICAvPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgIDwvVGhlbWVDb250cm9sPlxuICAgICk7XG59XG4iLCJpbXBvcnQge1RoZW1lLCBVc2VyU2V0dGluZ3N9IGZyb20gJy4vZGVmaW5pdGlvbnMnO1xuaW1wb3J0IFRoZW1lRW5naW5lcyBmcm9tICcuL2dlbmVyYXRvcnMvdGhlbWUtZW5naW5lcyc7XG5pbXBvcnQge2lzTWFjT1MsIGlzV2luZG93c30gZnJvbSAnLi91dGlscy9wbGF0Zm9ybSc7XG5cbmV4cG9ydCBjb25zdCBERUZBVUxUX0NPTE9SUyA9IHtcbiAgICBkYXJrU2NoZW1lOiB7XG4gICAgICAgIGJhY2tncm91bmQ6ICcjMTgxYTFiJyxcbiAgICAgICAgdGV4dDogJyNlOGU2ZTMnLFxuICAgIH0sXG4gICAgbGlnaHRTY2hlbWU6IHtcbiAgICAgICAgYmFja2dyb3VuZDogJyNkY2RhZDcnLFxuICAgICAgICB0ZXh0OiAnIzE4MWExYicsXG4gICAgfSxcbn07XG5cbmV4cG9ydCBjb25zdCBERUZBVUxUX1RIRU1FOiBUaGVtZSA9IHtcbiAgICBtb2RlOiAxLFxuICAgIGJyaWdodG5lc3M6IDEwMCxcbiAgICBjb250cmFzdDogMTAwLFxuICAgIGdyYXlzY2FsZTogMCxcbiAgICBzZXBpYTogMCxcbiAgICB1c2VGb250OiBmYWxzZSxcbiAgICBmb250RmFtaWx5OiBpc01hY09TKCkgPyAnSGVsdmV0aWNhIE5ldWUnIDogaXNXaW5kb3dzKCkgPyAnU2Vnb2UgVUknIDogJ09wZW4gU2FucycsXG4gICAgdGV4dFN0cm9rZTogMCxcbiAgICBlbmdpbmU6IFRoZW1lRW5naW5lcy5keW5hbWljVGhlbWUsXG4gICAgc3R5bGVzaGVldDogJycsXG4gICAgZGFya1NjaGVtZUJhY2tncm91bmRDb2xvcjogREVGQVVMVF9DT0xPUlMuZGFya1NjaGVtZS5iYWNrZ3JvdW5kLFxuICAgIGRhcmtTY2hlbWVUZXh0Q29sb3I6IERFRkFVTFRfQ09MT1JTLmRhcmtTY2hlbWUudGV4dCxcbiAgICBsaWdodFNjaGVtZUJhY2tncm91bmRDb2xvcjogREVGQVVMVF9DT0xPUlMubGlnaHRTY2hlbWUuYmFja2dyb3VuZCxcbiAgICBsaWdodFNjaGVtZVRleHRDb2xvcjogREVGQVVMVF9DT0xPUlMubGlnaHRTY2hlbWUudGV4dCxcbiAgICBzY3JvbGxiYXJDb2xvcjogaXNNYWNPUygpID8gJycgOiAnYXV0bycsXG4gICAgc2VsZWN0aW9uQ29sb3I6ICdhdXRvJyxcbiAgICBzdHlsZVN5c3RlbUNvbnRyb2xzOiB0cnVlLFxufTtcblxuZXhwb3J0IGNvbnN0IERFRkFVTFRfU0VUVElOR1M6IFVzZXJTZXR0aW5ncyA9IHtcbiAgICBlbmFibGVkOiB0cnVlLFxuICAgIHRoZW1lOiBERUZBVUxUX1RIRU1FLFxuICAgIHByZXNldHM6IFtdLFxuICAgIGN1c3RvbVRoZW1lczogW10sXG4gICAgc2l0ZUxpc3Q6IFtdLFxuICAgIHNpdGVMaXN0RW5hYmxlZDogW10sXG4gICAgYXBwbHlUb0xpc3RlZE9ubHk6IGZhbHNlLFxuICAgIGNoYW5nZUJyb3dzZXJUaGVtZTogZmFsc2UsXG4gICAgbm90aWZ5T2ZOZXdzOiBmYWxzZSxcbiAgICBzeW5jU2V0dGluZ3M6IHRydWUsXG4gICAgc3luY1NpdGVzRml4ZXM6IGZhbHNlLFxuICAgIGF1dG9tYXRpb246ICcnLFxuICAgIHRpbWU6IHtcbiAgICAgICAgYWN0aXZhdGlvbjogJzE4OjAwJyxcbiAgICAgICAgZGVhY3RpdmF0aW9uOiAnOTowMCcsXG4gICAgfSxcbiAgICBsb2NhdGlvbjoge1xuICAgICAgICBsYXRpdHVkZTogbnVsbCxcbiAgICAgICAgbG9uZ2l0dWRlOiBudWxsLFxuICAgIH0sXG4gICAgcHJldmlld05ld0Rlc2lnbjogZmFsc2UsXG4gICAgZW5hYmxlRm9yUERGOiB0cnVlLFxuICAgIGVuYWJsZUZvclByb3RlY3RlZFBhZ2VzOiBmYWxzZSxcbn07XG4iLCJpbXBvcnQge219IGZyb20gJ21hbGV2aWMnO1xuaW1wb3J0IHtERUZBVUxUX1NFVFRJTkdTfSBmcm9tICcuLi8uLi8uLi8uLi9kZWZhdWx0cyc7XG5pbXBvcnQge1Jlc2V0QnV0dG9ufSBmcm9tICcuLi8uLi8uLi9jb250cm9scyc7XG5pbXBvcnQgQ29udHJvbEdyb3VwIGZyb20gJy4uLy4uL2NvbnRyb2wtZ3JvdXAnO1xuaW1wb3J0IHtWaWV3UHJvcHN9IGZyb20gJy4uLy4uL3R5cGVzJztcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gUmVzZXRCdXR0b25Hcm91cChwcm9wczogVmlld1Byb3BzKSB7XG4gICAgZnVuY3Rpb24gcmVzZXQoKSB7XG4gICAgICAgIHByb3BzLmFjdGlvbnMuc2V0VGhlbWUoREVGQVVMVF9TRVRUSU5HUy50aGVtZSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIChcbiAgICAgICAgPENvbnRyb2xHcm91cD5cbiAgICAgICAgICAgIDxDb250cm9sR3JvdXAuQ29udHJvbD5cbiAgICAgICAgICAgICAgICA8UmVzZXRCdXR0b24gb25DbGljaz17cmVzZXR9PlxuICAgICAgICAgICAgICAgICAgICBSZXNldCB0byBkZWZhdWx0c1xuICAgICAgICAgICAgICAgIDwvUmVzZXRCdXR0b24+XG4gICAgICAgICAgICA8L0NvbnRyb2xHcm91cC5Db250cm9sPlxuICAgICAgICAgICAgPENvbnRyb2xHcm91cC5EZXNjcmlwdGlvbj5cbiAgICAgICAgICAgICAgICBSZXN0b3JlIGN1cnJlbnQgdGhlbWUgdmFsdWVzIHRvIGRlZmF1bHRzXG4gICAgICAgICAgICA8L0NvbnRyb2xHcm91cC5EZXNjcmlwdGlvbj5cbiAgICAgICAgPC9Db250cm9sR3JvdXA+XG4gICAgKTtcbn1cbiIsImltcG9ydCB7bX0gZnJvbSAnbWFsZXZpYyc7XG5pbXBvcnQge2dldExvY2FsTWVzc2FnZX0gZnJvbSAnLi4vLi4vLi4vLi4vdXRpbHMvbG9jYWxlcyc7XG5pbXBvcnQge0Ryb3BEb3dufSBmcm9tICcuLi8uLi8uLi9jb250cm9scyc7XG5pbXBvcnQgVGhlbWVDb250cm9sIGZyb20gJy4vdGhlbWUtY29udHJvbCc7XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIFNjaGVtZShwcm9wczoge2lzRGFyazogYm9vbGVhbjsgb25DaGFuZ2U6IChkYXJrOiBib29sZWFuKSA9PiB2b2lkfSkge1xuICAgIHJldHVybiAoXG4gICAgICAgIDxUaGVtZUNvbnRyb2wgbGFiZWw9XCJTY2hlbWVcIj5cbiAgICAgICAgICAgIDxEcm9wRG93blxuICAgICAgICAgICAgICAgIHNlbGVjdGVkPXtwcm9wcy5pc0Rhcmt9XG4gICAgICAgICAgICAgICAgb3B0aW9ucz17W1xuICAgICAgICAgICAgICAgICAgICB7aWQ6IHRydWUsIGNvbnRlbnQ6IGdldExvY2FsTWVzc2FnZSgnZGFyaycpfSxcbiAgICAgICAgICAgICAgICAgICAge2lkOiBmYWxzZSwgY29udGVudDogZ2V0TG9jYWxNZXNzYWdlKCdsaWdodCcpfSxcbiAgICAgICAgICAgICAgICBdfVxuICAgICAgICAgICAgICAgIG9uQ2hhbmdlPXtwcm9wcy5vbkNoYW5nZX1cbiAgICAgICAgICAgIC8+XG4gICAgICAgIDwvVGhlbWVDb250cm9sPlxuICAgICk7XG59XG4iLCJpbXBvcnQge219IGZyb20gJ21hbGV2aWMnO1xuaW1wb3J0IFRoZW1lQ29udHJvbCBmcm9tICcuL3RoZW1lLWNvbnRyb2wnO1xuaW1wb3J0IHtDb2xvckRyb3BEb3dufSBmcm9tICcuLi8uLi8uLi9jb250cm9scyc7XG5cbnR5cGUgU2Nyb2xsYmFyQ29sb3JWYWx1ZSA9ICcnIHwgJ2F1dG8nIHwgc3RyaW5nO1xuXG5pbnRlcmZhY2UgU2Nyb2xsYmFyRWRpdG9yUHJvcHMge1xuICAgIHZhbHVlOiBTY3JvbGxiYXJDb2xvclZhbHVlO1xuICAgIG9uQ2hhbmdlOiAodmFsdWU6IFNjcm9sbGJhckNvbG9yVmFsdWUpID0+IHZvaWQ7XG4gICAgb25SZXNldDogKCkgPT4gdm9pZDtcbn1cblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gU2Nyb2xsYmFyRWRpdG9yKHByb3BzOiBTY3JvbGxiYXJFZGl0b3JQcm9wcykge1xuICAgIHJldHVybiAoXG4gICAgICAgIDxUaGVtZUNvbnRyb2wgbGFiZWw9XCJTY3JvbGxiYXJcIj5cbiAgICAgICAgICAgIDxDb2xvckRyb3BEb3duXG4gICAgICAgICAgICAgICAgdmFsdWU9e3Byb3BzLnZhbHVlfVxuICAgICAgICAgICAgICAgIGNvbG9yU3VnZ2VzdGlvbj17JyM5NTk3OTknfVxuICAgICAgICAgICAgICAgIG9uQ2hhbmdlPXtwcm9wcy5vbkNoYW5nZX1cbiAgICAgICAgICAgICAgICBvblJlc2V0PXtwcm9wcy5vblJlc2V0fVxuICAgICAgICAgICAgICAgIGhhc0F1dG9PcHRpb25cbiAgICAgICAgICAgICAgICBoYXNEZWZhdWx0T3B0aW9uXG4gICAgICAgICAgICAvPlxuICAgICAgICA8L1RoZW1lQ29udHJvbD5cbiAgICApO1xufVxuIiwiaW1wb3J0IHttfSBmcm9tICdtYWxldmljJztcbmltcG9ydCBUaGVtZUNvbnRyb2wgZnJvbSAnLi90aGVtZS1jb250cm9sJztcbmltcG9ydCB7Q29sb3JEcm9wRG93bn0gZnJvbSAnLi4vLi4vLi4vY29udHJvbHMnO1xuXG50eXBlIFNlbGVjdGlvbkNvbG9yVmFsdWUgPSAnJyB8ICdhdXRvJyB8IHN0cmluZztcblxuaW50ZXJmYWNlIFNlbGVjdGlvbkVkaXRvclByb3BzIHtcbiAgICB2YWx1ZTogU2VsZWN0aW9uQ29sb3JWYWx1ZTtcbiAgICBvbkNoYW5nZTogKHZhbHVlOiBTZWxlY3Rpb25Db2xvclZhbHVlKSA9PiB2b2lkO1xuICAgIG9uUmVzZXQ6ICgpID0+IHZvaWQ7XG59XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIFNlbGVjdGlvbkNvbG9yRWRpdG9yKHByb3BzOiBTZWxlY3Rpb25FZGl0b3JQcm9wcykge1xuICAgIHJldHVybiAoXG4gICAgICAgIDxUaGVtZUNvbnRyb2wgbGFiZWw9XCJTZWxlY3Rpb25cIj5cbiAgICAgICAgICAgIDxDb2xvckRyb3BEb3duXG4gICAgICAgICAgICAgICAgdmFsdWU9e3Byb3BzLnZhbHVlfVxuICAgICAgICAgICAgICAgIGNvbG9yU3VnZ2VzdGlvbj17JyMwMDVjY2MnfVxuICAgICAgICAgICAgICAgIG9uQ2hhbmdlPXtwcm9wcy5vbkNoYW5nZX1cbiAgICAgICAgICAgICAgICBvblJlc2V0PXtwcm9wcy5vblJlc2V0fVxuICAgICAgICAgICAgICAgIGhhc0F1dG9PcHRpb25cbiAgICAgICAgICAgICAgICBoYXNEZWZhdWx0T3B0aW9uXG4gICAgICAgICAgICAvPlxuICAgICAgICA8L1RoZW1lQ29udHJvbD5cbiAgICApO1xufVxuIiwiaW1wb3J0IHttfSBmcm9tICdtYWxldmljJztcbmltcG9ydCB7Z2V0TG9jYWxNZXNzYWdlfSBmcm9tICcuLi8uLi8uLi8uLi91dGlscy9sb2NhbGVzJztcbmltcG9ydCB7U2xpZGVyfSBmcm9tICcuLi8uLi8uLi9jb250cm9scyc7XG5pbXBvcnQge2Zvcm1hdFBlcmNlbnR9IGZyb20gJy4vZm9ybWF0JztcbmltcG9ydCBUaGVtZUNvbnRyb2wgZnJvbSAnLi90aGVtZS1jb250cm9sJztcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gU2VwaWEocHJvcHM6IHt2YWx1ZTogbnVtYmVyOyBvbkNoYW5nZTogKHY6IG51bWJlcikgPT4gdm9pZH0pIHtcbiAgICByZXR1cm4gKFxuICAgICAgICA8VGhlbWVDb250cm9sIGxhYmVsPXtnZXRMb2NhbE1lc3NhZ2UoJ3NlcGlhJyl9PlxuICAgICAgICAgICAgPFNsaWRlclxuICAgICAgICAgICAgICAgIHZhbHVlPXtwcm9wcy52YWx1ZX1cbiAgICAgICAgICAgICAgICBtaW49ezB9XG4gICAgICAgICAgICAgICAgbWF4PXsxMDB9XG4gICAgICAgICAgICAgICAgc3RlcD17MX1cbiAgICAgICAgICAgICAgICBmb3JtYXRWYWx1ZT17Zm9ybWF0UGVyY2VudH1cbiAgICAgICAgICAgICAgICBvbkNoYW5nZT17cHJvcHMub25DaGFuZ2V9XG4gICAgICAgICAgICAvPlxuICAgICAgICA8L1RoZW1lQ29udHJvbD5cbiAgICApO1xufVxuIiwiaW1wb3J0IHttfSBmcm9tICdtYWxldmljJztcbmltcG9ydCB7RHJvcERvd259IGZyb20gJy4uLy4uLy4uL2NvbnRyb2xzJztcbmltcG9ydCBUaGVtZUNvbnRyb2wgZnJvbSAnLi90aGVtZS1jb250cm9sJztcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gU3R5bGVTeXN0ZW1Db250cm9scyhwcm9wczoge3ZhbHVlOiBib29sZWFuOyBvbkNoYW5nZTogKGJvb2xlYW46IGFueSkgPT4gdm9pZH0pIHtcbiAgICBjb25zdCBvcHRpb25zID0gW3tpZDogdHJ1ZSwgY29udGVudDogJ1llcyd9LCB7aWQ6IGZhbHNlLCBjb250ZW50OiAnTm8nfV07XG4gICAgcmV0dXJuIChcbiAgICAgICAgPFRoZW1lQ29udHJvbCBsYWJlbD1cIlN0eWxlIHN5c3RlbSBjb250cm9sc1wiPlxuICAgICAgICAgICAgPERyb3BEb3duXG4gICAgICAgICAgICAgICAgb3B0aW9ucz17b3B0aW9uc31cbiAgICAgICAgICAgICAgICBvbkNoYW5nZT17cHJvcHMub25DaGFuZ2V9XG4gICAgICAgICAgICAgICAgc2VsZWN0ZWQ9e3Byb3BzLnZhbHVlfVxuICAgICAgICAgICAgLz5cbiAgICAgICAgPC9UaGVtZUNvbnRyb2w+XG4gICAgKTtcbn1cbiIsImltcG9ydCB7bX0gZnJvbSAnbWFsZXZpYyc7XG5pbXBvcnQge0NvbG9yUGlja2VyfSBmcm9tICcuLi8uLi8uLi9jb250cm9scyc7XG5pbXBvcnQgVGhlbWVDb250cm9sIGZyb20gJy4vdGhlbWUtY29udHJvbCc7XG5cbnR5cGUgVGV4dENvbG9yVmFsdWUgPSAnYXV0bycgfCBzdHJpbmc7XG5cbmludGVyZmFjZSBUZXh0Q29sb3JFZGl0b3JQcm9wcyB7XG4gICAgdmFsdWU6IFRleHRDb2xvclZhbHVlO1xuICAgIG9uQ2hhbmdlOiAodmFsdWU6IFRleHRDb2xvclZhbHVlKSA9PiB2b2lkO1xuICAgIGNhblJlc2V0OiBib29sZWFuO1xuICAgIG9uUmVzZXQ6ICgpID0+IHZvaWQ7XG59XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIFRleHRDb2xvckVkaXRvcihwcm9wczogVGV4dENvbG9yRWRpdG9yUHJvcHMpIHtcbiAgICByZXR1cm4gKFxuICAgICAgICA8VGhlbWVDb250cm9sIGxhYmVsPVwiVGV4dFwiPlxuICAgICAgICAgICAgPENvbG9yUGlja2VyXG4gICAgICAgICAgICAgICAgY29sb3I9e3Byb3BzLnZhbHVlfVxuICAgICAgICAgICAgICAgIG9uQ2hhbmdlPXtwcm9wcy5vbkNoYW5nZX1cbiAgICAgICAgICAgICAgICBjYW5SZXNldD17cHJvcHMuY2FuUmVzZXR9XG4gICAgICAgICAgICAgICAgb25SZXNldD17cHJvcHMub25SZXNldH1cbiAgICAgICAgICAgIC8+XG4gICAgICAgIDwvVGhlbWVDb250cm9sPlxuICAgICk7XG59XG4iLCJpbXBvcnQge219IGZyb20gJ21hbGV2aWMnO1xuaW1wb3J0IHtTbGlkZXJ9IGZyb20gJy4uLy4uLy4uL2NvbnRyb2xzJztcbmltcG9ydCBUaGVtZUNvbnRyb2wgZnJvbSAnLi90aGVtZS1jb250cm9sJztcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gVGV4dFN0cm9rZShwcm9wczoge3ZhbHVlOiBudW1iZXI7IG9uQ2hhbmdlOiAodjogbnVtYmVyKSA9PiB2b2lkfSkge1xuICAgIHJldHVybiAoXG4gICAgICAgIDxUaGVtZUNvbnRyb2wgbGFiZWw9XCJUZXh0IHN0cm9rZVwiPlxuICAgICAgICAgICAgPFNsaWRlclxuICAgICAgICAgICAgICAgIHZhbHVlPXtwcm9wcy52YWx1ZX1cbiAgICAgICAgICAgICAgICBtaW49ezB9XG4gICAgICAgICAgICAgICAgbWF4PXsxfVxuICAgICAgICAgICAgICAgIHN0ZXA9ezAuMX1cbiAgICAgICAgICAgICAgICBmb3JtYXRWYWx1ZT17U3RyaW5nfVxuICAgICAgICAgICAgICAgIG9uQ2hhbmdlPXtwcm9wcy5vbkNoYW5nZX1cbiAgICAgICAgICAgIC8+XG4gICAgICAgIDwvVGhlbWVDb250cm9sPlxuICAgICk7XG59XG4iLCJpbXBvcnQge219IGZyb20gJ21hbGV2aWMnO1xuaW1wb3J0IHtEcm9wRG93bn0gZnJvbSAnLi4vLi4vLi4vY29udHJvbHMnO1xuaW1wb3J0IFRoZW1lQ29udHJvbCBmcm9tICcuL3RoZW1lLWNvbnRyb2wnO1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBVc2VGb250KHByb3BzOiB7dmFsdWU6IGJvb2xlYW47IG9uQ2hhbmdlOiAoYm9vbGVhbjogYW55KSA9PiB2b2lkfSkge1xuICAgIGNvbnN0IG9wdGlvbnMgPSBbe2lkOiB0cnVlLCBjb250ZW50OiAnWWVzJ30sIHtpZDogZmFsc2UsIGNvbnRlbnQ6ICdObyd9XTtcbiAgICByZXR1cm4gKFxuICAgICAgICA8VGhlbWVDb250cm9sIGxhYmVsPVwiQ2hhbmdlIGZvbnRcIj5cbiAgICAgICAgICAgIDxEcm9wRG93blxuICAgICAgICAgICAgICAgIG9wdGlvbnM9e29wdGlvbnN9XG4gICAgICAgICAgICAgICAgb25DaGFuZ2U9e3Byb3BzLm9uQ2hhbmdlfVxuICAgICAgICAgICAgICAgIHNlbGVjdGVkPXtwcm9wcy52YWx1ZX1cbiAgICAgICAgICAgIC8+XG4gICAgICAgIDwvVGhlbWVDb250cm9sPlxuICAgICk7XG59XG4iLCJmdW5jdGlvbiBoZXhpZnkobnVtYmVyOiBudW1iZXIpIHtcbiAgICByZXR1cm4gKChudW1iZXIgPCAxNiA/ICcwJyA6ICcnKSArIG51bWJlci50b1N0cmluZygxNikpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2VuZXJhdGVVSUQoKSB7XG4gICAgcmV0dXJuIEFycmF5LmZyb20oY3J5cHRvLmdldFJhbmRvbVZhbHVlcyhuZXcgVWludDhBcnJheSgxNikpKS5tYXAoKHgpID0+IGhleGlmeSh4KSkuam9pbignJyk7XG59XG4iLCJpbXBvcnQge219IGZyb20gJ21hbGV2aWMnO1xuaW1wb3J0IHtnZXRDb250ZXh0fSBmcm9tICdtYWxldmljL2RvbSc7XG5pbXBvcnQge1RoZW1lUHJlc2V0fSBmcm9tICcuLi8uLi8uLi8uLi9kZWZpbml0aW9ucyc7XG5pbXBvcnQge2lzVVJMSW5MaXN0LCBpc1VSTE1hdGNoZWQsIGdldFVSTEhvc3RPclByb3RvY29sfSBmcm9tICcuLi8uLi8uLi8uLi91dGlscy91cmwnO1xuaW1wb3J0IHtEcm9wRG93biwgTWVzc2FnZUJveH0gZnJvbSAnLi4vLi4vLi4vY29udHJvbHMnO1xuaW1wb3J0IHtWaWV3UHJvcHN9IGZyb20gJy4uLy4uL3R5cGVzJztcbmltcG9ydCB7Z2VuZXJhdGVVSUR9IGZyb20gJy4uLy4uLy4uLy4uL3V0aWxzL3VpZCc7XG5cbmZ1bmN0aW9uIFByZXNldEl0ZW0ocHJvcHM6IFZpZXdQcm9wcyAmIHtwcmVzZXQ6IFRoZW1lUHJlc2V0fSkge1xuICAgIGNvbnN0IGNvbnRleHQgPSBnZXRDb250ZXh0KCk7XG4gICAgY29uc3Qgc3RvcmUgPSBjb250ZXh0LnN0b3JlIGFzIHtpc0NvbmZpcm1hdGlvblZpc2libGU6IGJvb2xlYW59O1xuXG4gICAgZnVuY3Rpb24gb25SZW1vdmVDbGljayhlOiBNb3VzZUV2ZW50KSB7XG4gICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgIHN0b3JlLmlzQ29uZmlybWF0aW9uVmlzaWJsZSA9IHRydWU7XG4gICAgICAgIGNvbnRleHQucmVmcmVzaCgpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIG9uQ29uZmlybVJlbW92ZUNsaWNrKCkge1xuICAgICAgICBjb25zdCBmaWx0ZXJlZCA9IHByb3BzLmRhdGEuc2V0dGluZ3MucHJlc2V0cy5maWx0ZXIoKHApID0+IHAuaWQgIT09IHByb3BzLnByZXNldC5pZCk7XG4gICAgICAgIHByb3BzLmFjdGlvbnMuY2hhbmdlU2V0dGluZ3Moe3ByZXNldHM6IGZpbHRlcmVkfSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gb25DYW5jZWxSZW1vdmVDbGljaygpIHtcbiAgICAgICAgc3RvcmUuaXNDb25maXJtYXRpb25WaXNpYmxlID0gZmFsc2U7XG4gICAgICAgIGNvbnRleHQucmVmcmVzaCgpO1xuICAgIH1cblxuICAgIGNvbnN0IGNvbmZpcm1hdGlvbiA9IHN0b3JlLmlzQ29uZmlybWF0aW9uVmlzaWJsZSA/IChcbiAgICAgICAgPE1lc3NhZ2VCb3hcbiAgICAgICAgICAgIGNhcHRpb249e2BBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gcmVtb3ZlICR7cHJvcHMucHJlc2V0Lm5hbWV9P2B9XG4gICAgICAgICAgICBvbk9LPXtvbkNvbmZpcm1SZW1vdmVDbGlja31cbiAgICAgICAgICAgIG9uQ2FuY2VsPXtvbkNhbmNlbFJlbW92ZUNsaWNrfVxuICAgICAgICAvPlxuICAgICkgOiBudWxsO1xuXG4gICAgcmV0dXJuIChcbiAgICAgICAgPHNwYW4gY2xhc3M9XCJ0aGVtZS1wcmVzZXQtcGlja2VyX19wcmVzZXRcIj5cbiAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwidGhlbWUtcHJlc2V0LXBpY2tlcl9fcHJlc2V0X19uYW1lXCI+e3Byb3BzLnByZXNldC5uYW1lfTwvc3Bhbj5cbiAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwidGhlbWUtcHJlc2V0LXBpY2tlcl9fcHJlc2V0X19yZW1vdmUtYnV0dG9uXCIgb25jbGljaz17b25SZW1vdmVDbGlja30+PC9zcGFuPlxuICAgICAgICAgICAge2NvbmZpcm1hdGlvbn1cbiAgICAgICAgPC9zcGFuPlxuICAgICk7XG59XG5cbmNvbnN0IE1BWF9BTExPV0VEX1BSRVNFVFMgPSAzO1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBQcmVzZXRQaWNrZXIocHJvcHM6IFZpZXdQcm9wcykge1xuICAgIGNvbnN0IGhvc3QgPSBnZXRVUkxIb3N0T3JQcm90b2NvbChwcm9wcy50YWIudXJsKTtcbiAgICBjb25zdCBwcmVzZXQgPSBwcm9wcy5kYXRhLnNldHRpbmdzLnByZXNldHMuZmluZChcbiAgICAgICAgKHt1cmxzfSkgPT4gaXNVUkxJbkxpc3QocHJvcHMudGFiLnVybCwgdXJscylcbiAgICApO1xuICAgIGNvbnN0IGN1c3RvbSA9IHByb3BzLmRhdGEuc2V0dGluZ3MuY3VzdG9tVGhlbWVzLmZpbmQoXG4gICAgICAgICh7dXJsfSkgPT4gaXNVUkxJbkxpc3QocHJvcHMudGFiLnVybCwgdXJsKVxuICAgICk7XG5cbiAgICBjb25zdCBzZWxlY3RlZFByZXNldElkID0gY3VzdG9tID8gJ2N1c3RvbScgOiBwcmVzZXQgPyBwcmVzZXQuaWQgOiAnZGVmYXVsdCc7XG5cbiAgICBjb25zdCBkZWZhdWx0T3B0aW9uID0ge2lkOiAnZGVmYXVsdCcsIGNvbnRlbnQ6ICdUaGVtZSBmb3IgYWxsIHdlYnNpdGVzJ307XG4gICAgY29uc3QgYWRkTmV3UHJlc2V0T3B0aW9uID0gcHJvcHMuZGF0YS5zZXR0aW5ncy5wcmVzZXRzLmxlbmd0aCA8IE1BWF9BTExPV0VEX1BSRVNFVFMgP1xuICAgICAgICB7aWQ6ICdhZGQtcHJlc2V0JywgY29udGVudDogJ1xcdWZmMGIgQ3JlYXRlIG5ldyB0aGVtZSd9IDpcbiAgICAgICAgbnVsbDtcbiAgICBjb25zdCB1c2VyUHJlc2V0c09wdGlvbnMgPSBwcm9wcy5kYXRhLnNldHRpbmdzLnByZXNldHMubWFwKChwcmVzZXQpID0+IHtcbiAgICAgICAgaWYgKHByZXNldC5pZCA9PT0gc2VsZWN0ZWRQcmVzZXRJZCkge1xuICAgICAgICAgICAgcmV0dXJuIHtpZDogcHJlc2V0LmlkLCBjb250ZW50OiBwcmVzZXQubmFtZX07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGlkOiBwcmVzZXQuaWQsXG4gICAgICAgICAgICBjb250ZW50OiA8UHJlc2V0SXRlbSB7Li4ucHJvcHN9IHByZXNldD17cHJlc2V0fSAvPlxuICAgICAgICB9O1xuICAgIH0pO1xuICAgIGNvbnN0IGN1c3RvbVNpdGVQcmVzZXRPcHRpb24gPSB7XG4gICAgICAgIGlkOiAnY3VzdG9tJyxcbiAgICAgICAgY29udGVudDogYCR7c2VsZWN0ZWRQcmVzZXRJZCA9PT0gJ2N1c3RvbScgPyAnXFx1MjYwNScgOiAnXFx1MjYwNid9IFRoZW1lIGZvciAke2hvc3R9YCxcbiAgICB9O1xuXG4gICAgY29uc3QgZHJvcGRvd25PcHRpb25zID0gW1xuICAgICAgICBkZWZhdWx0T3B0aW9uLFxuICAgICAgICAuLi51c2VyUHJlc2V0c09wdGlvbnMsXG4gICAgICAgIGFkZE5ld1ByZXNldE9wdGlvbixcbiAgICAgICAgY3VzdG9tU2l0ZVByZXNldE9wdGlvbixcbiAgICBdLmZpbHRlcihCb29sZWFuKTtcblxuICAgIGZ1bmN0aW9uIG9uUHJlc2V0Q2hhbmdlKGlkOiBzdHJpbmcpIHtcbiAgICAgICAgY29uc3QgZmlsdGVyZWRDdXN0b21UaGVtZXMgPSBwcm9wcy5kYXRhLnNldHRpbmdzLmN1c3RvbVRoZW1lcy5maWx0ZXIoKHt1cmx9KSA9PiAhaXNVUkxJbkxpc3QocHJvcHMudGFiLnVybCwgdXJsKSk7XG4gICAgICAgIGNvbnN0IGZpbHRlcmVkUHJlc2V0cyA9IHByb3BzLmRhdGEuc2V0dGluZ3MucHJlc2V0cy5tYXAoKHByZXNldCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAuLi5wcmVzZXQsXG4gICAgICAgICAgICAgICAgdXJsczogcHJlc2V0LnVybHMuZmlsdGVyKCh0ZW1wbGF0ZSkgPT4gIWlzVVJMTWF0Y2hlZChwcm9wcy50YWIudXJsLCB0ZW1wbGF0ZSkpLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSk7XG4gICAgICAgIGlmIChpZCA9PT0gJ2RlZmF1bHQnKSB7XG4gICAgICAgICAgICBwcm9wcy5hY3Rpb25zLmNoYW5nZVNldHRpbmdzKHtcbiAgICAgICAgICAgICAgICBjdXN0b21UaGVtZXM6IGZpbHRlcmVkQ3VzdG9tVGhlbWVzLFxuICAgICAgICAgICAgICAgIHByZXNldHM6IGZpbHRlcmVkUHJlc2V0cyxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2UgaWYgKGlkID09PSAnY3VzdG9tJykge1xuICAgICAgICAgICAgY29uc3QgZXh0ZW5kZWQgPSBmaWx0ZXJlZEN1c3RvbVRoZW1lcy5jb25jYXQoe1xuICAgICAgICAgICAgICAgIHVybDogW2hvc3RdLFxuICAgICAgICAgICAgICAgIHRoZW1lOiB7Li4ucHJvcHMuZGF0YS5zZXR0aW5ncy50aGVtZX0sXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHByb3BzLmFjdGlvbnMuY2hhbmdlU2V0dGluZ3Moe1xuICAgICAgICAgICAgICAgIGN1c3RvbVRoZW1lczogZXh0ZW5kZWQsXG4gICAgICAgICAgICAgICAgcHJlc2V0czogZmlsdGVyZWRQcmVzZXRzLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gZWxzZSBpZiAoaWQgPT09ICdhZGQtcHJlc2V0Jykge1xuICAgICAgICAgICAgbGV0IG5ld1ByZXNldE5hbWU6IHN0cmluZztcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDw9IHByb3BzLmRhdGEuc2V0dGluZ3MucHJlc2V0cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIG5ld1ByZXNldE5hbWUgPSBgVGhlbWUgJHtpICsgMX1gO1xuICAgICAgICAgICAgICAgIGlmIChwcm9wcy5kYXRhLnNldHRpbmdzLnByZXNldHMuZXZlcnkoKHApID0+IHAubmFtZSAhPT0gbmV3UHJlc2V0TmFtZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBleHRlbmRlZCA9IGZpbHRlcmVkUHJlc2V0cy5jb25jYXQoe1xuICAgICAgICAgICAgICAgIGlkOiBgcHJlc2V0LSR7Z2VuZXJhdGVVSUQoKX1gLFxuICAgICAgICAgICAgICAgIG5hbWU6IG5ld1ByZXNldE5hbWUsXG4gICAgICAgICAgICAgICAgdXJsczogW2hvc3RdLFxuICAgICAgICAgICAgICAgIHRoZW1lOiB7Li4ucHJvcHMuZGF0YS5zZXR0aW5ncy50aGVtZX0sXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHByb3BzLmFjdGlvbnMuY2hhbmdlU2V0dGluZ3Moe1xuICAgICAgICAgICAgICAgIGN1c3RvbVRoZW1lczogZmlsdGVyZWRDdXN0b21UaGVtZXMsXG4gICAgICAgICAgICAgICAgcHJlc2V0czogZXh0ZW5kZWQsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IGNob3NlblByZXNldElkID0gaWQ7XG4gICAgICAgICAgICBjb25zdCBleHRlbmRlZCA9IGZpbHRlcmVkUHJlc2V0cy5tYXAoKHByZXNldCkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChwcmVzZXQuaWQgPT09IGNob3NlblByZXNldElkKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAuLi5wcmVzZXQsXG4gICAgICAgICAgICAgICAgICAgICAgICB1cmxzOiBwcmVzZXQudXJscy5jb25jYXQoaG9zdClcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIHByZXNldDtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcHJvcHMuYWN0aW9ucy5jaGFuZ2VTZXR0aW5ncyh7XG4gICAgICAgICAgICAgICAgY3VzdG9tVGhlbWVzOiBmaWx0ZXJlZEN1c3RvbVRoZW1lcyxcbiAgICAgICAgICAgICAgICBwcmVzZXRzOiBleHRlbmRlZCxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIChcbiAgICAgICAgPERyb3BEb3duXG4gICAgICAgICAgICBjbGFzcz1cInRoZW1lLXByZXNldC1waWNrZXJcIlxuICAgICAgICAgICAgc2VsZWN0ZWQ9e3NlbGVjdGVkUHJlc2V0SWR9XG4gICAgICAgICAgICBvcHRpb25zPXtkcm9wZG93bk9wdGlvbnN9XG4gICAgICAgICAgICBvbkNoYW5nZT17b25QcmVzZXRDaGFuZ2V9XG4gICAgICAgIC8+XG4gICAgKTtcbn1cbiIsImltcG9ydCB7VGhlbWV9IGZyb20gJy4uLy4uLy4uL2RlZmluaXRpb25zJztcbmltcG9ydCB7aXNVUkxJbkxpc3R9IGZyb20gJy4uLy4uLy4uL3V0aWxzL3VybCc7XG5pbXBvcnQge1ZpZXdQcm9wc30gZnJvbSAnLi4vdHlwZXMnO1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q3VycmVudFRoZW1lUHJlc2V0KHByb3BzOiBWaWV3UHJvcHMpIHtcbiAgICBjb25zdCBjdXN0b20gPSBwcm9wcy5kYXRhLnNldHRpbmdzLmN1c3RvbVRoZW1lcy5maW5kKFxuICAgICAgICAoe3VybH0pID0+IGlzVVJMSW5MaXN0KHByb3BzLnRhYi51cmwsIHVybClcbiAgICApO1xuICAgIGNvbnN0IHByZXNldCA9IGN1c3RvbSA/IG51bGwgOiBwcm9wcy5kYXRhLnNldHRpbmdzLnByZXNldHMuZmluZChcbiAgICAgICAgKHt1cmxzfSkgPT4gaXNVUkxJbkxpc3QocHJvcHMudGFiLnVybCwgdXJscylcbiAgICApO1xuICAgIGNvbnN0IHRoZW1lID0gY3VzdG9tID9cbiAgICAgICAgY3VzdG9tLnRoZW1lIDpcbiAgICAgICAgcHJlc2V0ID9cbiAgICAgICAgICAgIHByZXNldC50aGVtZSA6XG4gICAgICAgICAgICBwcm9wcy5kYXRhLnNldHRpbmdzLnRoZW1lO1xuXG4gICAgZnVuY3Rpb24gc2V0VGhlbWUoY29uZmlnOiBQYXJ0aWFsPFRoZW1lPikge1xuICAgICAgICBpZiAoY3VzdG9tKSB7XG4gICAgICAgICAgICBjdXN0b20udGhlbWUgPSB7Li4uY3VzdG9tLnRoZW1lLCAuLi5jb25maWd9O1xuICAgICAgICAgICAgcHJvcHMuYWN0aW9ucy5jaGFuZ2VTZXR0aW5ncyh7XG4gICAgICAgICAgICAgICAgY3VzdG9tVGhlbWVzOiBwcm9wcy5kYXRhLnNldHRpbmdzLmN1c3RvbVRoZW1lcyxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2UgaWYgKHByZXNldCkge1xuICAgICAgICAgICAgcHJlc2V0LnRoZW1lID0gey4uLnByZXNldC50aGVtZSwgLi4uY29uZmlnfTtcbiAgICAgICAgICAgIHByb3BzLmFjdGlvbnMuY2hhbmdlU2V0dGluZ3Moe1xuICAgICAgICAgICAgICAgIHByZXNldHM6IHByb3BzLmRhdGEuc2V0dGluZ3MucHJlc2V0cyxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcHJvcHMuYWN0aW9ucy5zZXRUaGVtZShjb25maWcpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgdGhlbWUsXG4gICAgICAgIGNoYW5nZTogc2V0VGhlbWUsXG4gICAgfTtcbn1cbiIsImltcG9ydCB7bX0gZnJvbSAnbWFsZXZpYyc7XG5pbXBvcnQge1RoZW1lfSBmcm9tICcuLi8uLi8uLi9kZWZpbml0aW9ucyc7XG5pbXBvcnQge0J1dHRvbn0gZnJvbSAnLi4vLi4vY29udHJvbHMnO1xuaW1wb3J0IHtCcmlnaHRuZXNzLCBDb250cmFzdCwgU2NoZW1lLCBNb2RlfSBmcm9tICcuLi90aGVtZS9jb250cm9scyc7XG5pbXBvcnQgVGhlbWVQcmVzZXRQaWNrZXIgZnJvbSAnLi4vdGhlbWUvcHJlc2V0LXBpY2tlcic7XG5pbXBvcnQge2dldEN1cnJlbnRUaGVtZVByZXNldH0gZnJvbSAnLi4vdGhlbWUvdXRpbHMnO1xuaW1wb3J0IHtWaWV3UHJvcHN9IGZyb20gJy4uL3R5cGVzJztcblxuZnVuY3Rpb24gVGhlbWVDb250cm9scyhwcm9wczoge3RoZW1lOiBUaGVtZTsgb25DaGFuZ2U6ICh0aGVtZTogUGFydGlhbDxUaGVtZT4pID0+IHZvaWR9KSB7XG4gICAgY29uc3Qge3RoZW1lLCBvbkNoYW5nZX0gPSBwcm9wcztcbiAgICByZXR1cm4gKFxuICAgICAgICA8c2VjdGlvbiBjbGFzcz1cIm0tc2VjdGlvbiBtLXRoZW1lLWNvbnRyb2xzXCI+XG4gICAgICAgICAgICA8QnJpZ2h0bmVzc1xuICAgICAgICAgICAgICAgIHZhbHVlPXt0aGVtZS5icmlnaHRuZXNzfVxuICAgICAgICAgICAgICAgIG9uQ2hhbmdlPXsodikgPT4gb25DaGFuZ2Uoe2JyaWdodG5lc3M6IHZ9KX1cbiAgICAgICAgICAgIC8+XG4gICAgICAgICAgICA8Q29udHJhc3RcbiAgICAgICAgICAgICAgICB2YWx1ZT17dGhlbWUuY29udHJhc3R9XG4gICAgICAgICAgICAgICAgb25DaGFuZ2U9eyh2KSA9PiBvbkNoYW5nZSh7Y29udHJhc3Q6IHZ9KX1cbiAgICAgICAgICAgIC8+XG4gICAgICAgICAgICA8U2NoZW1lXG4gICAgICAgICAgICAgICAgaXNEYXJrPXt0aGVtZS5tb2RlID09PSAxfVxuICAgICAgICAgICAgICAgIG9uQ2hhbmdlPXsoaXNEYXJrKSA9PiBvbkNoYW5nZSh7bW9kZTogaXNEYXJrID8gMSA6IDB9KX1cbiAgICAgICAgICAgIC8+XG4gICAgICAgICAgICA8TW9kZVxuICAgICAgICAgICAgICAgIG1vZGU9e3RoZW1lLmVuZ2luZX1cbiAgICAgICAgICAgICAgICBvbkNoYW5nZT17KG1vZGUpID0+IG9uQ2hhbmdlKHtlbmdpbmU6IG1vZGV9KX1cbiAgICAgICAgICAgIC8+XG4gICAgICAgIDwvc2VjdGlvbj5cbiAgICApO1xufVxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBUaGVtZUdyb3VwKHByb3BzOiBWaWV3UHJvcHMgJiB7b25UaGVtZU5hdkNsaWNrOiAoKSA9PiB2b2lkfSkge1xuICAgIGNvbnN0IHByZXNldCA9IGdldEN1cnJlbnRUaGVtZVByZXNldChwcm9wcyk7XG5cbiAgICByZXR1cm4gKFxuICAgICAgICA8ZGl2IGNsYXNzPVwidGhlbWUtZ3JvdXBcIj5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJ0aGVtZS1ncm91cF9fcHJlc2V0cy13cmFwcGVyXCI+XG4gICAgICAgICAgICAgICAgPFRoZW1lUHJlc2V0UGlja2VyIHsuLi5wcm9wc30gLz5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cInRoZW1lLWdyb3VwX19jb250cm9scy13cmFwcGVyXCI+XG4gICAgICAgICAgICAgICAgPFRoZW1lQ29udHJvbHNcbiAgICAgICAgICAgICAgICAgICAgdGhlbWU9e3ByZXNldC50aGVtZX1cbiAgICAgICAgICAgICAgICAgICAgb25DaGFuZ2U9e3ByZXNldC5jaGFuZ2V9XG4gICAgICAgICAgICAgICAgLz5cbiAgICAgICAgICAgICAgICA8QnV0dG9uIGNsYXNzPVwidGhlbWUtZ3JvdXBfX21vcmUtYnV0dG9uXCIgb25jbGljaz17cHJvcHMub25UaGVtZU5hdkNsaWNrfT5cbiAgICAgICAgICAgICAgICAgICAgU2VlIGFsbCBvcHRpb25zXG4gICAgICAgICAgICAgICAgPC9CdXR0b24+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDxsYWJlbCBjbGFzcz1cInRoZW1lLWdyb3VwX19kZXNjcmlwdGlvblwiPlxuICAgICAgICAgICAgICAgIENvbmZpZ3VyZSB0aGVtZVxuICAgICAgICAgICAgPC9sYWJlbD5cbiAgICAgICAgPC9kaXY+XG4gICAgKTtcbn1cblxuXG4iLCJpbXBvcnQge219IGZyb20gJ21hbGV2aWMnO1xuaW1wb3J0IHtOYXZCdXR0b259IGZyb20gJy4uLy4uL2NvbnRyb2xzJztcbmltcG9ydCB7Vmlld1Byb3BzfSBmcm9tICcuLi90eXBlcyc7XG5pbXBvcnQgQXBwU3dpdGNoIGZyb20gJy4vYXBwLXN3aXRjaCc7XG5pbXBvcnQgSGVscEdyb3VwIGZyb20gJy4vaGVscCc7XG5pbXBvcnQgU2l0ZVRvZ2dsZUdyb3VwIGZyb20gJy4vc2l0ZS10b2dnbGUnO1xuaW1wb3J0IFRoZW1lR3JvdXAgZnJvbSAnLi90aGVtZS1ncm91cCc7XG5cbmZ1bmN0aW9uIFN3aXRjaEdyb3VwKHByb3BzOiBWaWV3UHJvcHMpIHtcbiAgICByZXR1cm4gKFxuICAgICAgICA8QXJyYXk+XG4gICAgICAgICAgICA8QXBwU3dpdGNoIHsuLi5wcm9wc30gLz5cbiAgICAgICAgICAgIDxTaXRlVG9nZ2xlR3JvdXAgey4uLnByb3BzfSAvPlxuICAgICAgICA8L0FycmF5PlxuICAgICk7XG59XG5cbmZ1bmN0aW9uIFNldHRpbmdzTmF2QnV0dG9uKHByb3BzOiB7b25DbGljazogKCkgPT4gdm9pZH0pIHtcbiAgICByZXR1cm4gKFxuICAgICAgICA8TmF2QnV0dG9uIG9uQ2xpY2s9e3Byb3BzLm9uQ2xpY2t9PlxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJzZXR0aW5ncy1idXR0b24taWNvblwiIC8+XG4gICAgICAgICAgICBTZXR0aW5nc1xuICAgICAgICA8L05hdkJ1dHRvbj5cbiAgICApO1xufVxuXG50eXBlIE1haW5QYWdlUHJvcHMgPSBWaWV3UHJvcHMgJiB7XG4gICAgb25UaGVtZU5hdkNsaWNrOiAoKSA9PiB2b2lkO1xuICAgIG9uU2V0dGluZ3NOYXZDbGljazogKCkgPT4gdm9pZDtcbn07XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIE1haW5QYWdlKHByb3BzOiBNYWluUGFnZVByb3BzKSB7XG4gICAgcmV0dXJuIChcbiAgICAgICAgPEFycmF5PlxuICAgICAgICAgICAgPHNlY3Rpb24gY2xhc3M9XCJtLXNlY3Rpb25cIj5cbiAgICAgICAgICAgICAgICA8U3dpdGNoR3JvdXAgey4uLnByb3BzfSAvPlxuICAgICAgICAgICAgPC9zZWN0aW9uPlxuICAgICAgICAgICAgPHNlY3Rpb24gY2xhc3M9XCJtLXNlY3Rpb25cIj5cbiAgICAgICAgICAgICAgICA8VGhlbWVHcm91cCB7Li4ucHJvcHN9IC8+XG4gICAgICAgICAgICA8L3NlY3Rpb24+XG4gICAgICAgICAgICA8c2VjdGlvbiBjbGFzcz1cIm0tc2VjdGlvblwiPlxuICAgICAgICAgICAgICAgIDxTZXR0aW5nc05hdkJ1dHRvbiBvbkNsaWNrPXtwcm9wcy5vblNldHRpbmdzTmF2Q2xpY2t9IC8+XG4gICAgICAgICAgICAgICAgPEhlbHBHcm91cCAvPlxuICAgICAgICAgICAgPC9zZWN0aW9uPlxuICAgICAgICA8L0FycmF5PlxuICAgICk7XG59XG4iLCJpbXBvcnQge219IGZyb20gJ21hbGV2aWMnO1xuaW1wb3J0IHtCdXR0b259IGZyb20gJy4uLy4uL2NvbnRyb2xzJztcblxuaW50ZXJmYWNlIFBhZ2VQcm9wcyB7XG4gICAgaWQ6IHN0cmluZztcbiAgICBhY3RpdmU/OiBib29sZWFuO1xuICAgIGZpcnN0PzogYm9vbGVhbjtcbiAgICBvbkJhY2tCdXR0b25DbGljaz86ICgpID0+IHZvaWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBQYWdlKHByb3BzOiBQYWdlUHJvcHMsIGNvbnRlbnQ6IE1hbGV2aWMuU3BlYykge1xuICAgIHJldHVybiAoXG4gICAgICAgIDxkaXYgY2xhc3M9e3sncGFnZSc6IHRydWUsICdwYWdlLS1hY3RpdmUnOiBwcm9wcy5hY3RpdmV9fT5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJwYWdlX19jb250ZW50XCI+XG4gICAgICAgICAgICAgICAge2NvbnRlbnR9XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIHtwcm9wcy5maXJzdCA/IG51bGwgOiAoXG4gICAgICAgICAgICAgICAgPEJ1dHRvbiBjbGFzcz1cInBhZ2VfX2JhY2stYnV0dG9uXCIgb25jbGljaz17cHJvcHMub25CYWNrQnV0dG9uQ2xpY2t9PlxuICAgICAgICAgICAgICAgICAgICBCYWNrXG4gICAgICAgICAgICAgICAgPC9CdXR0b24+XG4gICAgICAgICAgICApfVxuICAgICAgICA8L2Rpdj5cbiAgICApO1xufVxuXG5pbnRlcmZhY2UgUGFnZVZpZXdlclByb3BzIHtcbiAgICBhY3RpdmVQYWdlOiBzdHJpbmc7XG4gICAgb25CYWNrQnV0dG9uQ2xpY2s6ICgpID0+IHZvaWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBQYWdlVmlld2VyKFxuICAgIHByb3BzOiBQYWdlVmlld2VyUHJvcHMsXG4gICAgLi4ucGFnZXM6IE1hbGV2aWMuQ29tcG9uZW50U3BlYzxQYWdlUHJvcHM+W11cbikge1xuICAgIHJldHVybiAoXG4gICAgICAgIDxkaXYgY2xhc3M9XCJwYWdlLXZpZXdlclwiPlxuICAgICAgICAgICAge3BhZ2VzLm1hcCgocGFnZVNwZWMsIGkpID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICAuLi5wYWdlU3BlYyxcbiAgICAgICAgICAgICAgICAgICAgcHJvcHM6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC4uLnBhZ2VTcGVjLnByb3BzLFxuICAgICAgICAgICAgICAgICAgICAgICAgYWN0aXZlOiBwcm9wcy5hY3RpdmVQYWdlID09PSBwYWdlU3BlYy5wcm9wcy5pZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGZpcnN0OiBpID09PSAwLFxuICAgICAgICAgICAgICAgICAgICAgICAgb25CYWNrQnV0dG9uQ2xpY2s6IHByb3BzLm9uQmFja0J1dHRvbkNsaWNrLFxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIH0gYXMgTWFsZXZpYy5Db21wb25lbnRTcGVjPFBhZ2VQcm9wcz47XG4gICAgICAgICAgICB9KX1cbiAgICAgICAgPC9kaXY+XG4gICAgKTtcbn1cbiIsImltcG9ydCB7bX0gZnJvbSAnbWFsZXZpYyc7XG5pbXBvcnQge05hdkJ1dHRvbn0gZnJvbSAnLi4vLi4vY29udHJvbHMnO1xuaW1wb3J0IENvbnRyb2xHcm91cCBmcm9tICcuLi9jb250cm9sLWdyb3VwJztcbmltcG9ydCBXYXRjaEljb24gZnJvbSAnLi4vbWFpbi1wYWdlL3dhdGNoLWljb24nO1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBBdXRvbWF0aW9uQnV0dG9uKHByb3BzOiB7b25DbGljazogKCkgPT4gdm9pZH0pIHtcbiAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpO1xuICAgIHJldHVybiAoXG4gICAgICAgIDxDb250cm9sR3JvdXA+XG4gICAgICAgICAgICA8Q29udHJvbEdyb3VwLkNvbnRyb2w+XG4gICAgICAgICAgICAgICAgPE5hdkJ1dHRvbiBvbkNsaWNrPXtwcm9wcy5vbkNsaWNrfT5cbiAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJhdXRvbWF0aW9uLWJ1dHRvbi1pY29uXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICA8V2F0Y2hJY29uIGhvdXJzPXtub3cuZ2V0SG91cnMoKX0gbWludXRlcz17bm93LmdldE1pbnV0ZXMoKX0gLz5cbiAgICAgICAgICAgICAgICAgICAgPC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICBBdXRvbWF0aW9uXG4gICAgICAgICAgICAgICAgPC9OYXZCdXR0b24+XG4gICAgICAgICAgICA8L0NvbnRyb2xHcm91cC5Db250cm9sPlxuICAgICAgICAgICAgPENvbnRyb2xHcm91cC5EZXNjcmlwdGlvbj5cbiAgICAgICAgICAgICAgICBDb25maWd1cmUgd2hlbiBhcHAgaXMgZW5hYmxlZFxuICAgICAgICAgICAgPC9Db250cm9sR3JvdXAuRGVzY3JpcHRpb24+XG4gICAgICAgIDwvQ29udHJvbEdyb3VwPlxuICAgICk7XG59XG4iLCJpbXBvcnQge219IGZyb20gJ21hbGV2aWMnO1xuaW1wb3J0IFRoZW1lRW5naW5lcyBmcm9tICcuLi8uLi8uLi9nZW5lcmF0b3JzL3RoZW1lLWVuZ2luZXMnO1xuaW1wb3J0IHtnZXRMb2NhbE1lc3NhZ2V9IGZyb20gJy4uLy4uLy4uL3V0aWxzL2xvY2FsZXMnO1xuaW1wb3J0IHtOYXZCdXR0b259IGZyb20gJy4uLy4uL2NvbnRyb2xzJztcbmltcG9ydCBDb250cm9sR3JvdXAgZnJvbSAnLi4vY29udHJvbC1ncm91cCc7XG5pbXBvcnQge1ZpZXdQcm9wc30gZnJvbSAnLi4vdHlwZXMnO1xuaW1wb3J0IHtpc0ZpcmVmb3gsIGlzTW9iaWxlfSBmcm9tICcuLi8uLi8uLi91dGlscy9wbGF0Zm9ybSc7XG5cbmZ1bmN0aW9uIGdldEV4aXN0aW5nRGV2VG9vbHNPYmplY3QoKTogUHJvbWlzZTxjaHJvbWUud2luZG93cy5XaW5kb3c+IHwgUHJvbWlzZTxjaHJvbWUudGFicy5UYWI+IHtcbiAgICBpZiAoaXNNb2JpbGUoKSkge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2U8Y2hyb21lLnRhYnMuVGFiPigocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgY2hyb21lLnRhYnMucXVlcnkoe30sICh0KSA9PiB7XG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCB0YWIgb2YgdCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAodGFiLnVybC5lbmRzV2l0aCgndWkvZGV2dG9vbHMvaW5kZXguaHRtbCcpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHRhYik7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmVzb2x2ZShudWxsKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlPGNocm9tZS53aW5kb3dzLldpbmRvdz4oKHJlc29sdmUpID0+IHtcbiAgICAgICAgY2hyb21lLndpbmRvd3MuZ2V0QWxsKHtcbiAgICAgICAgICAgIHBvcHVsYXRlOiB0cnVlLFxuICAgICAgICAgICAgd2luZG93VHlwZXM6IFsncG9wdXAnXVxuICAgICAgICB9LCAodykgPT4ge1xuICAgICAgICAgICAgZm9yIChjb25zdCB3aW5kb3cgb2Ygdykge1xuICAgICAgICAgICAgICAgIGlmICh3aW5kb3cudGFic1swXS51cmwuZW5kc1dpdGgoJ3VpL2RldnRvb2xzL2luZGV4Lmh0bWwnKSkge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKHdpbmRvdyk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXNvbHZlKG51bGwpO1xuICAgICAgICB9KTtcbiAgICB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gb3BlbkRldlRvb2xzKCkge1xuICAgIGNvbnN0IGRldlRvb2xzT2JqZWN0ID0gYXdhaXQgZ2V0RXhpc3RpbmdEZXZUb29sc09iamVjdCgpO1xuICAgIGlmIChpc01vYmlsZSgpKSB7XG4gICAgICAgIGlmIChkZXZUb29sc09iamVjdCkge1xuICAgICAgICAgICAgY2hyb21lLnRhYnMudXBkYXRlKGRldlRvb2xzT2JqZWN0LmlkLCB7J2FjdGl2ZSc6IHRydWV9KTtcbiAgICAgICAgICAgIHdpbmRvdy5jbG9zZSgpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY2hyb21lLnRhYnMuY3JlYXRlKHtcbiAgICAgICAgICAgICAgICB1cmw6ICcuLi9kZXZ0b29scy9pbmRleC5odG1sJyxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgd2luZG93LmNsb3NlKCk7XG4gICAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgICBpZiAoZGV2VG9vbHNPYmplY3QpIHtcbiAgICAgICAgICAgIGNocm9tZS53aW5kb3dzLnVwZGF0ZShkZXZUb29sc09iamVjdC5pZCwgeydmb2N1c2VkJzogdHJ1ZX0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY2hyb21lLndpbmRvd3MuY3JlYXRlKHtcbiAgICAgICAgICAgICAgICB0eXBlOiAncG9wdXAnLFxuICAgICAgICAgICAgICAgIHVybDogaXNGaXJlZm94KCkgPyAnLi4vZGV2dG9vbHMvaW5kZXguaHRtbCcgOiAndWkvZGV2dG9vbHMvaW5kZXguaHRtbCcsXG4gICAgICAgICAgICAgICAgd2lkdGg6IDYwMCxcbiAgICAgICAgICAgICAgICBoZWlnaHQ6IDYwMCxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBEZXZUb29sc0dyb3VwKHByb3BzOiBWaWV3UHJvcHMpIHtcbiAgICBjb25zdCBnbG9iYWxUaGVtZUVuZ2luZSA9IHByb3BzLmRhdGEuc2V0dGluZ3MudGhlbWUuZW5naW5lO1xuICAgIGNvbnN0IGRldnRvb2xzRGF0YSA9IHByb3BzLmRhdGEuZGV2dG9vbHM7XG4gICAgY29uc3QgaGFzQ3VzdG9tRml4ZXMgPSAoXG4gICAgICAgIChnbG9iYWxUaGVtZUVuZ2luZSA9PT0gVGhlbWVFbmdpbmVzLmR5bmFtaWNUaGVtZSAmJiBkZXZ0b29sc0RhdGEuaGFzQ3VzdG9tRHluYW1pY0ZpeGVzKSB8fFxuICAgICAgICAoW1RoZW1lRW5naW5lcy5jc3NGaWx0ZXIsIFRoZW1lRW5naW5lcy5zdmdGaWx0ZXJdLmluY2x1ZGVzKGdsb2JhbFRoZW1lRW5naW5lKSAmJiBkZXZ0b29sc0RhdGEuaGFzQ3VzdG9tRmlsdGVyRml4ZXMpIHx8XG4gICAgICAgIChnbG9iYWxUaGVtZUVuZ2luZSA9PT0gVGhlbWVFbmdpbmVzLnN0YXRpY1RoZW1lICYmIGRldnRvb2xzRGF0YS5oYXNDdXN0b21TdGF0aWNGaXhlcylcbiAgICApO1xuXG4gICAgcmV0dXJuIChcbiAgICAgICAgPENvbnRyb2xHcm91cD5cbiAgICAgICAgICAgIDxDb250cm9sR3JvdXAuQ29udHJvbD5cbiAgICAgICAgICAgICAgICA8TmF2QnV0dG9uXG4gICAgICAgICAgICAgICAgICAgIG9uQ2xpY2s9e29wZW5EZXZUb29sc31cbiAgICAgICAgICAgICAgICAgICAgY2xhc3M9e3tcbiAgICAgICAgICAgICAgICAgICAgICAgICdkZXYtdG9vbHMtYnV0dG9uJzogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICdkZXYtdG9vbHMtYnV0dG9uLS1oYXMtY3VzdG9tLWZpeGVzJzogaGFzQ3VzdG9tRml4ZXMsXG4gICAgICAgICAgICAgICAgICAgIH19XG4gICAgICAgICAgICAgICAgPlxuICAgICAgICAgICAgICAgICAgICDwn5ugIHtnZXRMb2NhbE1lc3NhZ2UoJ29wZW5fZGV2X3Rvb2xzJyl9XG4gICAgICAgICAgICAgICAgPC9OYXZCdXR0b24+XG4gICAgICAgICAgICA8L0NvbnRyb2xHcm91cC5Db250cm9sPlxuICAgICAgICAgICAgPENvbnRyb2xHcm91cC5EZXNjcmlwdGlvbj5cbiAgICAgICAgICAgICAgICBNYWtlIGEgZml4IGZvciBhIHdlYnNpdGVcbiAgICAgICAgICAgIDwvQ29udHJvbEdyb3VwLkRlc2NyaXB0aW9uPlxuICAgICAgICA8L0NvbnRyb2xHcm91cD5cbiAgICApO1xufVxuIiwiaW1wb3J0IHttfSBmcm9tICdtYWxldmljJztcbmltcG9ydCB7TmF2QnV0dG9ufSBmcm9tICcuLi8uLi9jb250cm9scyc7XG5pbXBvcnQgQ29udHJvbEdyb3VwIGZyb20gJy4uL2NvbnRyb2wtZ3JvdXAnO1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBNYW5hZ2VTZXR0aW5nc0J1dHRvbihwcm9wczoge29uQ2xpY2s6ICgpID0+IHZvaWR9KSB7XG4gICAgcmV0dXJuIChcbiAgICAgICAgPENvbnRyb2xHcm91cD5cbiAgICAgICAgICAgIDxDb250cm9sR3JvdXAuQ29udHJvbD5cbiAgICAgICAgICAgICAgICA8TmF2QnV0dG9uIG9uQ2xpY2s9e3Byb3BzLm9uQ2xpY2t9PlxuICAgICAgICAgICAgICAgICAgICBNYW5hZ2Ugc2V0dGluZ3NcbiAgICAgICAgICAgICAgICA8L05hdkJ1dHRvbj5cbiAgICAgICAgICAgIDwvQ29udHJvbEdyb3VwLkNvbnRyb2w+XG4gICAgICAgICAgICA8Q29udHJvbEdyb3VwLkRlc2NyaXB0aW9uPlxuICAgICAgICAgICAgICAgIFJlc2V0LCBleHBvcnQgb3IgaW1wb3J0IHNldHRpbmdzXG4gICAgICAgICAgICA8L0NvbnRyb2xHcm91cC5EZXNjcmlwdGlvbj5cbiAgICAgICAgPC9Db250cm9sR3JvdXA+XG4gICAgKTtcbn1cbiIsImltcG9ydCB7bX0gZnJvbSAnbWFsZXZpYyc7XG5pbXBvcnQge05hdkJ1dHRvbn0gZnJvbSAnLi4vLi4vY29udHJvbHMnO1xuaW1wb3J0IENvbnRyb2xHcm91cCBmcm9tICcuLi9jb250cm9sLWdyb3VwJztcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gU2l0ZUxpc3RCdXR0b24ocHJvcHM6IHtvbkNsaWNrOiAoKSA9PiB2b2lkfSkge1xuICAgIHJldHVybiAoXG4gICAgICAgIDxDb250cm9sR3JvdXA+XG4gICAgICAgICAgICA8Q29udHJvbEdyb3VwLkNvbnRyb2w+XG4gICAgICAgICAgICAgICAgPE5hdkJ1dHRvbiBvbkNsaWNrPXtwcm9wcy5vbkNsaWNrfT5cbiAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJzaXRlLWxpc3QtYnV0dG9uLWljb25cIj48L3NwYW4+XG4gICAgICAgICAgICAgICAgICAgIFNpdGUgbGlzdFxuICAgICAgICAgICAgICAgIDwvTmF2QnV0dG9uPlxuICAgICAgICAgICAgPC9Db250cm9sR3JvdXAuQ29udHJvbD5cbiAgICAgICAgICAgIDxDb250cm9sR3JvdXAuRGVzY3JpcHRpb24+XG4gICAgICAgICAgICAgICAgRW5hYmxlIG9yIGRpc2FibGUgb24gbGlzdGVkIHdlYnNpdGVzXG4gICAgICAgICAgICA8L0NvbnRyb2xHcm91cC5EZXNjcmlwdGlvbj5cbiAgICAgICAgPC9Db250cm9sR3JvdXA+XG4gICAgKTtcbn1cbiIsImltcG9ydCB7bX0gZnJvbSAnbWFsZXZpYyc7XG5pbXBvcnQge0NoZWNrQm94fSBmcm9tICcuLi8uLi9jb250cm9scyc7XG5pbXBvcnQgQ29udHJvbEdyb3VwIGZyb20gJy4uL2NvbnRyb2wtZ3JvdXAnO1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBDaGVja0J1dHRvbihwcm9wczoge2NoZWNrZWQ6IGJvb2xlYW47IGxhYmVsOiBzdHJpbmc7IGRlc2NyaXB0aW9uOiBzdHJpbmc7IG9uQ2hhbmdlOiAoY2hlY2tlZDogYm9vbGVhbikgPT4gdm9pZH0pIHtcbiAgICByZXR1cm4gKFxuICAgICAgICA8Q29udHJvbEdyb3VwIGNsYXNzPVwiY2hlY2stYnV0dG9uXCI+XG4gICAgICAgICAgICA8Q29udHJvbEdyb3VwLkNvbnRyb2w+XG4gICAgICAgICAgICAgICAgPENoZWNrQm94XG4gICAgICAgICAgICAgICAgICAgIGNsYXNzPVwiY2hlY2stYnV0dG9uX19jaGVja2JveFwiXG4gICAgICAgICAgICAgICAgICAgIGNoZWNrZWQ9e3Byb3BzLmNoZWNrZWR9XG4gICAgICAgICAgICAgICAgICAgIG9uY2hhbmdlPXsoZToge3RhcmdldDogSFRNTElucHV0RWxlbWVudH0pID0+IHByb3BzLm9uQ2hhbmdlKGUudGFyZ2V0LmNoZWNrZWQpfVxuICAgICAgICAgICAgICAgID5cbiAgICAgICAgICAgICAgICAgICAge3Byb3BzLmxhYmVsfVxuICAgICAgICAgICAgICAgIDwvQ2hlY2tCb3g+XG4gICAgICAgICAgICA8L0NvbnRyb2xHcm91cC5Db250cm9sPlxuICAgICAgICAgICAgPENvbnRyb2xHcm91cC5EZXNjcmlwdGlvbiBjbGFzcz1cImNoZWNrLWJ1dHRvbl9fZGVzY3JpcHRpb25cIj5cbiAgICAgICAgICAgICAgICB7cHJvcHMuZGVzY3JpcHRpb259XG4gICAgICAgICAgICA8L0NvbnRyb2xHcm91cC5EZXNjcmlwdGlvbj5cbiAgICAgICAgPC9Db250cm9sR3JvdXA+XG4gICAgKTtcbn1cbiIsImltcG9ydCB7bX0gZnJvbSAnbWFsZXZpYyc7XG5pbXBvcnQgQ2hlY2tCdXR0b24gZnJvbSAnLi4vY2hlY2stYnV0dG9uJztcbmltcG9ydCB7Vmlld1Byb3BzfSBmcm9tICcuLi90eXBlcyc7XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIEVuYWJsZWRCeURlZmF1bHRHcm91cChwcm9wczogVmlld1Byb3BzKSB7XG4gICAgZnVuY3Rpb24gb25FbmFibGVkQnlEZWZhdWx0Q2hhbmdlKGNoZWNrZWQ6IGJvb2xlYW4pIHtcbiAgICAgICAgcHJvcHMuYWN0aW9ucy5jaGFuZ2VTZXR0aW5ncyh7YXBwbHlUb0xpc3RlZE9ubHk6ICFjaGVja2VkfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIChcbiAgICAgICAgPENoZWNrQnV0dG9uXG4gICAgICAgICAgICBjaGVja2VkPXshcHJvcHMuZGF0YS5zZXR0aW5ncy5hcHBseVRvTGlzdGVkT25seX1cbiAgICAgICAgICAgIGxhYmVsPVwiRW5hYmxlIGJ5IGRlZmF1bHRcIlxuICAgICAgICAgICAgZGVzY3JpcHRpb249e3Byb3BzLmRhdGEuc2V0dGluZ3MuYXBwbHlUb0xpc3RlZE9ubHkgP1xuICAgICAgICAgICAgICAgICdEaXNhYmxlZCBvbiBhbGwgd2Vic2l0ZXMgYnkgZGVmYXVsdCcgOlxuICAgICAgICAgICAgICAgICdFbmFibGVkIG9uIGFsbCB3ZWJzaXRlcyBieSBkZWZhdWx0J31cbiAgICAgICAgICAgIG9uQ2hhbmdlPXtvbkVuYWJsZWRCeURlZmF1bHRDaGFuZ2V9XG4gICAgICAgIC8+XG4gICAgKTtcbn1cbiIsImltcG9ydCB7bX0gZnJvbSAnbWFsZXZpYyc7XG5pbXBvcnQge1ZpZXdQcm9wc30gZnJvbSAnLi4vdHlwZXMnO1xuaW1wb3J0IEF1dG9tYXRpb25CdXR0b24gZnJvbSAnLi9hdXRvbWF0aW9uLWJ1dHRvbic7XG5pbXBvcnQgRGV2VG9vbHNHcm91cCBmcm9tICcuL2RldnRvb2xzJztcbmltcG9ydCBNYW5hZ2VTZXR0aW5nc0J1dHRvbiBmcm9tICcuL21hbmdlLXNldHRpbmdzLWJ1dHRvbic7XG5pbXBvcnQgU2l0ZUxpc3RCdXR0b24gZnJvbSAnLi9zaXRlLWxpc3QtYnV0dG9uJztcbmltcG9ydCBFbmFibGVkQnlEZWZhdWx0R3JvdXAgZnJvbSAnLi9lbmFibGVkLWJ5LWRlZmF1bHQnO1xuXG50eXBlIFNldHRpbmdzUGFnZVByb3BzID0gVmlld1Byb3BzICYge1xuICAgIG9uQXV0b21hdGlvbk5hdkNsaWNrOiAoKSA9PiB2b2lkO1xuICAgIG9uTWFuYWdlU2V0dGluZ3NDbGljazogKCkgPT4gdm9pZDtcbiAgICBvblNpdGVMaXN0TmF2Q2xpY2s6ICgpID0+IHZvaWQ7XG59O1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBTZXR0aW5nc1BhZ2UocHJvcHM6IFNldHRpbmdzUGFnZVByb3BzKSB7XG4gICAgcmV0dXJuIChcbiAgICAgICAgPHNlY3Rpb24gY2xhc3M9XCJtLXNlY3Rpb25cIj5cbiAgICAgICAgICAgIDxFbmFibGVkQnlEZWZhdWx0R3JvdXAgey4uLnByb3BzfSAvPlxuICAgICAgICAgICAgPFNpdGVMaXN0QnV0dG9uIG9uQ2xpY2s9e3Byb3BzLm9uU2l0ZUxpc3ROYXZDbGlja30gLz5cbiAgICAgICAgICAgIDxEZXZUb29sc0dyb3VwIHsuLi5wcm9wc30gLz5cbiAgICAgICAgICAgIDxBdXRvbWF0aW9uQnV0dG9uIG9uQ2xpY2s9e3Byb3BzLm9uQXV0b21hdGlvbk5hdkNsaWNrfSAvPlxuICAgICAgICAgICAgPE1hbmFnZVNldHRpbmdzQnV0dG9uIG9uQ2xpY2s9e3Byb3BzLm9uTWFuYWdlU2V0dGluZ3NDbGlja30gLz5cbiAgICAgICAgPC9zZWN0aW9uPlxuICAgICk7XG59XG4iLCJpbXBvcnQge219IGZyb20gJ21hbGV2aWMnO1xuaW1wb3J0IHtnZXRDb250ZXh0fSBmcm9tICdtYWxldmljL2RvbSc7XG5pbXBvcnQge1RleHRCb3h9IGZyb20gJy4uLy4uL2NvbnRyb2xzJztcbmltcG9ydCBWaXJ0dWFsU2Nyb2xsIGZyb20gJy4uLy4uL2NvbnRyb2xzL3ZpcnR1YWwtc2Nyb2xsJztcblxuaW50ZXJmYWNlIFNpdGVMaXN0UHJvcHMge1xuICAgIHNpdGVMaXN0OiBzdHJpbmdbXTtcbiAgICBvbkNoYW5nZTogKHNpdGVzOiBzdHJpbmdbXSkgPT4gdm9pZDtcbn1cblxuaW50ZXJmYWNlIFNpdGVMaXN0U3RvcmUge1xuICAgIGluZGljZXM6IFdlYWtNYXA8Tm9kZSwgbnVtYmVyPjtcbiAgICBzaG91bGRGb2N1c0F0SW5kZXg6IG51bWJlcjtcbiAgICB3YXNWaXNpYmxlOiBib29sZWFuO1xufVxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBTaXRlTGlzdChwcm9wczogU2l0ZUxpc3RQcm9wcykge1xuICAgIGNvbnN0IGNvbnRleHQgPSBnZXRDb250ZXh0KCk7XG4gICAgY29uc3Qgc3RvcmUgPSBjb250ZXh0LnN0b3JlIGFzIFNpdGVMaXN0U3RvcmU7XG4gICAgaWYgKCFjb250ZXh0LnByZXYpIHtcbiAgICAgICAgc3RvcmUuaW5kaWNlcyA9IG5ldyBXZWFrTWFwKCk7XG4gICAgICAgIHN0b3JlLnNob3VsZEZvY3VzQXRJbmRleCA9IC0xO1xuICAgICAgICBzdG9yZS53YXNWaXNpYmxlID0gZmFsc2U7XG4gICAgfVxuXG4gICAgY29udGV4dC5vblJlbmRlcigobm9kZTogSFRNTEVsZW1lbnQpID0+IHtcbiAgICAgICAgY29uc3QgaXNWaXNpYmxlID0gbm9kZS5jbGllbnRXaWR0aCA+IDA7XG4gICAgICAgIGNvbnN0IHt3YXNWaXNpYmxlfSA9IHN0b3JlO1xuICAgICAgICBzdG9yZS53YXNWaXNpYmxlID0gaXNWaXNpYmxlO1xuICAgICAgICBpZiAoIXdhc1Zpc2libGUgJiYgaXNWaXNpYmxlKSB7XG4gICAgICAgICAgICBzdG9yZS5zaG91bGRGb2N1c0F0SW5kZXggPSBwcm9wcy5zaXRlTGlzdC5sZW5ndGg7XG4gICAgICAgICAgICBjb250ZXh0LnJlZnJlc2goKTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgZnVuY3Rpb24gb25UZXh0Q2hhbmdlKGU6IEV2ZW50ICYge3RhcmdldDogSFRNTElucHV0RWxlbWVudH0pIHtcbiAgICAgICAgY29uc3QgaW5kZXggPSBzdG9yZS5pbmRpY2VzLmdldChlLnRhcmdldCk7XG4gICAgICAgIGNvbnN0IHZhbHVlcyA9IHByb3BzLnNpdGVMaXN0LnNsaWNlKCk7XG4gICAgICAgIGNvbnN0IHZhbHVlID0gZS50YXJnZXQudmFsdWUudHJpbSgpO1xuICAgICAgICBpZiAodmFsdWVzLmluY2x1ZGVzKHZhbHVlKSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCF2YWx1ZSkge1xuICAgICAgICAgICAgdmFsdWVzLnNwbGljZShpbmRleCwgMSk7XG4gICAgICAgICAgICBzdG9yZS5zaG91bGRGb2N1c0F0SW5kZXggPSBpbmRleDtcbiAgICAgICAgfSBlbHNlIGlmIChpbmRleCA9PT0gdmFsdWVzLmxlbmd0aCkge1xuICAgICAgICAgICAgdmFsdWVzLnB1c2godmFsdWUpO1xuICAgICAgICAgICAgc3RvcmUuc2hvdWxkRm9jdXNBdEluZGV4ID0gaW5kZXggKyAxO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFsdWVzLnNwbGljZShpbmRleCwgMSwgdmFsdWUpO1xuICAgICAgICAgICAgc3RvcmUuc2hvdWxkRm9jdXNBdEluZGV4ID0gaW5kZXggKyAxO1xuICAgICAgICB9XG5cbiAgICAgICAgcHJvcHMub25DaGFuZ2UodmFsdWVzKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiByZW1vdmVWYWx1ZShldmVudDogTW91c2VFdmVudCkge1xuICAgICAgICBjb25zdCBwcmV2aW91c1NpYmxpbmcgPSAoKGV2ZW50LnRhcmdldCBhcyBIVE1MSW5wdXRFbGVtZW50KS5wcmV2aW91c1NpYmxpbmcgYXMgSFRNTElucHV0RWxlbWVudCk7XG4gICAgICAgIGNvbnN0IGluZGV4ID0gc3RvcmUuaW5kaWNlcy5nZXQocHJldmlvdXNTaWJsaW5nKTtcbiAgICAgICAgY29uc3QgZmlsdGVyZWQgPSBwcm9wcy5zaXRlTGlzdC5zbGljZSgpO1xuICAgICAgICBmaWx0ZXJlZC5zcGxpY2UoaW5kZXgsIDEpO1xuICAgICAgICBzdG9yZS5zaG91bGRGb2N1c0F0SW5kZXggPSBpbmRleDtcbiAgICAgICAgcHJvcHMub25DaGFuZ2UoZmlsdGVyZWQpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNyZWF0ZVRleHRCb3godGV4dDogc3RyaW5nLCBpbmRleDogbnVtYmVyKSB7XG4gICAgICAgIGNvbnN0IG9uUmVuZGVyID0gKG5vZGU6IEhUTUxJbnB1dEVsZW1lbnQpID0+IHtcbiAgICAgICAgICAgIHN0b3JlLmluZGljZXMuc2V0KG5vZGUsIGluZGV4KTtcbiAgICAgICAgICAgIGlmIChzdG9yZS5zaG91bGRGb2N1c0F0SW5kZXggPT09IGluZGV4KSB7XG4gICAgICAgICAgICAgICAgc3RvcmUuc2hvdWxkRm9jdXNBdEluZGV4ID0gLTE7XG4gICAgICAgICAgICAgICAgbm9kZS5mb2N1cygpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cInNpdGUtbGlzdF9faXRlbVwiPlxuICAgICAgICAgICAgICAgIDxUZXh0Qm94XG4gICAgICAgICAgICAgICAgICAgIGNsYXNzPVwic2l0ZS1saXN0X190ZXh0Ym94XCJcbiAgICAgICAgICAgICAgICAgICAgdmFsdWU9e3RleHR9XG4gICAgICAgICAgICAgICAgICAgIG9ucmVuZGVyPXtvblJlbmRlcn1cbiAgICAgICAgICAgICAgICAgICAgcGxhY2Vob2xkZXI9XCJnb29nbGUuY29tL21hcHNcIlxuICAgICAgICAgICAgICAgIC8+XG4gICAgICAgICAgICAgICAgPHNwYW5cbiAgICAgICAgICAgICAgICAgICAgY2xhc3M9XCJzaXRlLWxpc3RfX2l0ZW1fX3JlbW92ZVwiXG4gICAgICAgICAgICAgICAgICAgIHJvbGU9XCJidXR0b25cIlxuICAgICAgICAgICAgICAgICAgICBvbmNsaWNrPXtyZW1vdmVWYWx1ZX1cbiAgICAgICAgICAgICAgICAvPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICk7XG4gICAgfVxuXG4gICAgcmV0dXJuIChcbiAgICAgICAgPGRpdiBjbGFzcz1cInNpdGUtbGlzdFwiPlxuICAgICAgICAgICAgPFZpcnR1YWxTY3JvbGxcbiAgICAgICAgICAgICAgICByb290PXsoXG4gICAgICAgICAgICAgICAgICAgIDxkaXZcbiAgICAgICAgICAgICAgICAgICAgICAgIGNsYXNzPVwic2l0ZS1saXN0X192LXNjcm9sbC1yb290XCJcbiAgICAgICAgICAgICAgICAgICAgICAgIG9uY2hhbmdlPXtvblRleHRDaGFuZ2V9XG4gICAgICAgICAgICAgICAgICAgIC8+XG4gICAgICAgICAgICAgICAgKX1cbiAgICAgICAgICAgICAgICBpdGVtcz17cHJvcHMuc2l0ZUxpc3RcbiAgICAgICAgICAgICAgICAgICAgLm1hcCgoc2l0ZSwgaW5kZXgpID0+IGNyZWF0ZVRleHRCb3goc2l0ZSwgaW5kZXgpKVxuICAgICAgICAgICAgICAgICAgICAuY29uY2F0KGNyZWF0ZVRleHRCb3goJycsIHByb3BzLnNpdGVMaXN0Lmxlbmd0aCkpfVxuICAgICAgICAgICAgICAgIHNjcm9sbFRvSW5kZXg9e3N0b3JlLnNob3VsZEZvY3VzQXRJbmRleH1cbiAgICAgICAgICAgIC8+XG4gICAgICAgIDwvZGl2PlxuICAgICk7XG59XG4iLCJpbXBvcnQge219IGZyb20gJ21hbGV2aWMnO1xuaW1wb3J0IHtpc0ZpcmVmb3h9IGZyb20gJy4uLy4uLy4uL3V0aWxzL3BsYXRmb3JtJztcbmltcG9ydCB7Vmlld1Byb3BzfSBmcm9tICcuLi90eXBlcyc7XG5pbXBvcnQgU2l0ZUxpc3QgZnJvbSAnLi9zaXRlLWxpc3QnO1xuaW1wb3J0IENoZWNrQnV0dG9uIGZyb20gJy4uL2NoZWNrLWJ1dHRvbic7XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIFNpdGVMaXN0UGFnZShwcm9wczogVmlld1Byb3BzKSB7XG4gICAgZnVuY3Rpb24gb25TaXRlTGlzdENoYW5nZShzaXRlczogc3RyaW5nW10pIHtcbiAgICAgICAgcHJvcHMuYWN0aW9ucy5jaGFuZ2VTZXR0aW5ncyh7c2l0ZUxpc3Q6IHNpdGVzfSk7XG4gICAgfVxuICAgIGZ1bmN0aW9uIG9uSW52ZXJ0UERGQ2hhbmdlKGNoZWNrZWQ6IGJvb2xlYW4pIHtcbiAgICAgICAgcHJvcHMuYWN0aW9ucy5jaGFuZ2VTZXR0aW5ncyh7ZW5hYmxlRm9yUERGOiBjaGVja2VkfSk7XG4gICAgfVxuICAgIGZ1bmN0aW9uIG9uRW5hYmxlRm9yUHJvdGVjdGVkUGFnZXModmFsdWU6IGJvb2xlYW4pIHtcbiAgICAgICAgcHJvcHMuYWN0aW9ucy5jaGFuZ2VTZXR0aW5ncyh7ZW5hYmxlRm9yUHJvdGVjdGVkUGFnZXM6IHZhbHVlfSk7XG4gICAgfVxuXG4gICAgY29uc3QgbGFiZWwgPSBwcm9wcy5kYXRhLnNldHRpbmdzLmFwcGx5VG9MaXN0ZWRPbmx5ID9cbiAgICAgICAgJ0VuYWJsZSBvbiB0aGVzZSB3ZWJzaXRlcycgOlxuICAgICAgICAnRGlzYWJsZSBvbiB0aGVzZSB3ZWJzaXRlcyc7XG4gICAgcmV0dXJuIChcbiAgICAgICAgPGRpdiBjbGFzcz1cInNpdGUtbGlzdC1wYWdlXCI+XG4gICAgICAgICAgICA8bGFiZWwgY2xhc3M9XCJzaXRlLWxpc3QtcGFnZV9fbGFiZWxcIj57bGFiZWx9PC9sYWJlbD5cbiAgICAgICAgICAgIDxTaXRlTGlzdFxuICAgICAgICAgICAgICAgIHNpdGVMaXN0PXtwcm9wcy5kYXRhLnNldHRpbmdzLnNpdGVMaXN0fVxuICAgICAgICAgICAgICAgIG9uQ2hhbmdlPXtvblNpdGVMaXN0Q2hhbmdlfVxuICAgICAgICAgICAgLz5cbiAgICAgICAgICAgIDxsYWJlbCBjbGFzcz1cInNpdGUtbGlzdC1wYWdlX19kZXNjcmlwdGlvblwiPkVudGVyIHdlYnNpdGUgbmFtZSBhbmQgcHJlc3MgRW50ZXI8L2xhYmVsPlxuICAgICAgICAgICAge2lzRmlyZWZveCgpID8gbnVsbCA6IDxDaGVja0J1dHRvblxuICAgICAgICAgICAgICAgIGNoZWNrZWQ9e3Byb3BzLmRhdGEuc2V0dGluZ3MuZW5hYmxlRm9yUERGfVxuICAgICAgICAgICAgICAgIGxhYmVsPVwiRW5hYmxlIGZvciBQREYgZmlsZXNcIlxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uPXtwcm9wcy5kYXRhLnNldHRpbmdzLmVuYWJsZUZvclBERiA/XG4gICAgICAgICAgICAgICAgICAgICdFbmFibGVkIGZvciBQREYgZG9jdW1lbnRzJyA6XG4gICAgICAgICAgICAgICAgICAgICdEaXNhYmxlZCBmb3IgUERGIGRvY3VtZW50cyd9XG4gICAgICAgICAgICAgICAgb25DaGFuZ2U9e29uSW52ZXJ0UERGQ2hhbmdlfVxuICAgICAgICAgICAgLz59XG4gICAgICAgICAgICA8Q2hlY2tCdXR0b25cbiAgICAgICAgICAgICAgICBjaGVja2VkPXtwcm9wcy5kYXRhLnNldHRpbmdzLmVuYWJsZUZvclByb3RlY3RlZFBhZ2VzfVxuICAgICAgICAgICAgICAgIG9uQ2hhbmdlPXtvbkVuYWJsZUZvclByb3RlY3RlZFBhZ2VzfVxuICAgICAgICAgICAgICAgIGxhYmVsPXsnRW5hYmxlIG9uIHJlc3RyaWN0ZWQgcGFnZXMnfVxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uPXtwcm9wcy5kYXRhLnNldHRpbmdzLmVuYWJsZUZvclByb3RlY3RlZFBhZ2VzID9cbiAgICAgICAgICAgICAgICAgICAgJ1lvdSBzaG91bGQgZW5hYmxlIGl0IGluIGJyb3dzZXIgZmxhZ3MgdG9vJyA6XG4gICAgICAgICAgICAgICAgICAgICdEaXNhYmxlZCBmb3Igd2ViIHN0b3JlIGFuZCBvdGhlciBwYWdlcyd9XG4gICAgICAgICAgICAvPlxuICAgICAgICA8L2Rpdj5cbiAgICApO1xufVxuIiwiaW1wb3J0IHttfSBmcm9tICdtYWxldmljJztcbmltcG9ydCB7Z2V0Q29udGV4dH0gZnJvbSAnbWFsZXZpYy9kb20nO1xuXG5mdW5jdGlvbiBDb2xsYXBzaWJsZVBhbmVsKHt9LCAuLi5ncm91cHM6IE1hbGV2aWMuQ29tcG9uZW50U3BlYzxDb2xsYXBzaWJsZUdyb3VwUHJvcHM+W10pIHtcbiAgICBjb25zdCBjb250ZXh0ID0gZ2V0Q29udGV4dCgpO1xuICAgIGNvbnN0IHN0b3JlID0gY29udGV4dC5zdG9yZSBhcyB7YWN0aXZlR3JvdXA6IHN0cmluZ307XG4gICAgaWYgKHN0b3JlLmFjdGl2ZUdyb3VwID09IG51bGwpIHtcbiAgICAgICAgc3RvcmUuYWN0aXZlR3JvdXAgPSBncm91cHNbMF0ucHJvcHMuaWQ7XG4gICAgfVxuICAgIHJldHVybiAoXG4gICAgICAgIDxkaXYgY2xhc3M9XCJjb2xsYXBzaWJsZS1wYW5lbFwiPlxuICAgICAgICAgICAgey4uLmdyb3Vwcy5tYXAoKHNwZWMsIGkpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBhY3RpdmVJbmRleCA9IGdyb3Vwcy5maW5kSW5kZXgoKGcpID0+IHN0b3JlLmFjdGl2ZUdyb3VwID09PSBnLnByb3BzLmlkKTtcbiAgICAgICAgICAgICAgICBjb25zdCBjb2xsYXBzZWQgPSBpICE9PSBhY3RpdmVJbmRleDtcbiAgICAgICAgICAgICAgICBjb25zdCBjb2xsYXBzZVRvcCA9IGkgPCBhY3RpdmVJbmRleDtcbiAgICAgICAgICAgICAgICBjb25zdCBjb2xsYXBzZUJvdHRvbSA9IGkgPiBhY3RpdmVJbmRleDtcbiAgICAgICAgICAgICAgICBjb25zdCBvbkV4cGFuZCA9ICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgc3RvcmUuYWN0aXZlR3JvdXAgPSBzcGVjLnByb3BzLmlkO1xuICAgICAgICAgICAgICAgICAgICBjb250ZXh0LnJlZnJlc2goKTtcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgIC4uLnNwZWMsXG4gICAgICAgICAgICAgICAgICAgIHByb3BzOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAuLi5zcGVjLnByb3BzLFxuICAgICAgICAgICAgICAgICAgICAgICAgY29sbGFwc2VkLFxuICAgICAgICAgICAgICAgICAgICAgICAgY29sbGFwc2VCb3R0b20sXG4gICAgICAgICAgICAgICAgICAgICAgICBjb2xsYXBzZVRvcCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG9uRXhwYW5kLFxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9KX1cbiAgICAgICAgPC9kaXY+XG4gICAgKTtcbn1cblxuaW50ZXJmYWNlIENvbGxhcHNpYmxlR3JvdXBQcm9wcyB7XG4gICAgaWQ6IHN0cmluZztcbiAgICBsYWJlbDogc3RyaW5nO1xuICAgIGNvbGxhcHNlZD86IGJvb2xlYW47XG4gICAgY29sbGFwc2VCb3R0b20/OiBib29sZWFuO1xuICAgIGNvbGxhcHNlVG9wPzogYm9vbGVhbjtcbiAgICBvbkV4cGFuZD86ICgpID0+IHZvaWQ7XG59XG5cbmZ1bmN0aW9uIEdyb3VwKHByb3BzOiBDb2xsYXBzaWJsZUdyb3VwUHJvcHMsIGNvbnRlbnQ6IE1hbGV2aWMuQ2hpbGQpIHtcbiAgICByZXR1cm4gKFxuICAgICAgICA8ZGl2XG4gICAgICAgICAgICBjbGFzcz17e1xuICAgICAgICAgICAgICAgICdjb2xsYXBzaWJsZS1wYW5lbF9fZ3JvdXAnOiB0cnVlLFxuICAgICAgICAgICAgICAgICdjb2xsYXBzaWJsZS1wYW5lbF9fZ3JvdXAtLWNvbGxhcHNlZCc6IHByb3BzLmNvbGxhcHNlZCxcbiAgICAgICAgICAgICAgICAnY29sbGFwc2libGUtcGFuZWxfX2dyb3VwLS1jb2xsYXBzZS10b3AnOiBwcm9wcy5jb2xsYXBzZVRvcCxcbiAgICAgICAgICAgICAgICAnY29sbGFwc2libGUtcGFuZWxfX2dyb3VwLS1jb2xsYXBzZS1ib3R0b20nOiBwcm9wcy5jb2xsYXBzZUJvdHRvbSxcbiAgICAgICAgICAgIH19XG4gICAgICAgID5cbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2xsYXBzaWJsZS1wYW5lbF9fZ3JvdXBfX2NvbnRlbnRcIj5cbiAgICAgICAgICAgICAgICB7Y29udGVudH1cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgPHNwYW4gcm9sZT1cImJ1dHRvblwiIGNsYXNzPVwiY29sbGFwc2libGUtcGFuZWxfX2dyb3VwX19leHBhbmQtYnV0dG9uXCIgb25jbGljaz17cHJvcHMub25FeHBhbmR9PlxuICAgICAgICAgICAgICAgIHtwcm9wcy5sYWJlbH1cbiAgICAgICAgICAgIDwvc3Bhbj5cbiAgICAgICAgPC9kaXY+XG4gICAgKTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgT2JqZWN0LmFzc2lnbihDb2xsYXBzaWJsZVBhbmVsLCB7R3JvdXB9KTtcbiIsImltcG9ydCB7bX0gZnJvbSAnbWFsZXZpYyc7XG5pbXBvcnQge0RFRkFVTFRfU0VUVElOR1MsIERFRkFVTFRfVEhFTUUsIERFRkFVTFRfQ09MT1JTfSBmcm9tICcuLi8uLi8uLi8uLi9kZWZhdWx0cyc7XG5pbXBvcnQge1RoZW1lfSBmcm9tICcuLi8uLi8uLi8uLi9kZWZpbml0aW9ucyc7XG5pbXBvcnQge1ZpZXdQcm9wc30gZnJvbSAnLi4vLi4vdHlwZXMnO1xuaW1wb3J0IHtCYWNrZ3JvdW5kQ29sb3IsIEJyaWdodG5lc3MsIENvbnRyYXN0LCBGb250UGlja2VyLCBHcmF5c2NhbGUsIE1vZGUsIFJlc2V0QnV0dG9uLCBTY2hlbWUsIFNjcm9sbGJhciwgU2VsZWN0aW9uQ29sb3JFZGl0b3IsIFNlcGlhLCBUZXh0Q29sb3IsIFRleHRTdHJva2UsIFVzZUZvbnQsIFN0eWxlU3lzdGVtQ29udHJvbHN9IGZyb20gJy4uL2NvbnRyb2xzJztcbmltcG9ydCBUaGVtZVByZXNldFBpY2tlciBmcm9tICcuLi9wcmVzZXQtcGlja2VyJztcbmltcG9ydCB7Z2V0Q3VycmVudFRoZW1lUHJlc2V0fSBmcm9tICcuLi91dGlscyc7XG5pbXBvcnQgQ29sbGFwc2libGUgZnJvbSAnLi9jb2xsYXBzaWJsZS1wYW5lbCc7XG5cbmludGVyZmFjZSBUaGVtZUdyb3VwUHJvcHMge1xuICAgIHRoZW1lOiBUaGVtZTtcbiAgICBjaGFuZ2U6ICh0aGVtZTogUGFydGlhbDxUaGVtZT4pID0+IHZvaWQ7XG59XG5cbmZ1bmN0aW9uIE1haW5Hcm91cCh7dGhlbWUsIGNoYW5nZX06IFRoZW1lR3JvdXBQcm9wcykge1xuICAgIHJldHVybiAoXG4gICAgICAgIDxBcnJheT5cbiAgICAgICAgICAgIDxCcmlnaHRuZXNzXG4gICAgICAgICAgICAgICAgdmFsdWU9e3RoZW1lLmJyaWdodG5lc3N9XG4gICAgICAgICAgICAgICAgb25DaGFuZ2U9eyh2KSA9PiBjaGFuZ2Uoe2JyaWdodG5lc3M6IHZ9KX1cbiAgICAgICAgICAgIC8+XG4gICAgICAgICAgICA8Q29udHJhc3RcbiAgICAgICAgICAgICAgICB2YWx1ZT17dGhlbWUuY29udHJhc3R9XG4gICAgICAgICAgICAgICAgb25DaGFuZ2U9eyh2KSA9PiBjaGFuZ2Uoe2NvbnRyYXN0OiB2fSl9XG4gICAgICAgICAgICAvPlxuICAgICAgICAgICAgPFNlcGlhXG4gICAgICAgICAgICAgICAgdmFsdWU9e3RoZW1lLnNlcGlhfVxuICAgICAgICAgICAgICAgIG9uQ2hhbmdlPXsodikgPT4gY2hhbmdlKHtzZXBpYTogdn0pfVxuICAgICAgICAgICAgLz5cbiAgICAgICAgICAgIDxHcmF5c2NhbGVcbiAgICAgICAgICAgICAgICB2YWx1ZT17dGhlbWUuZ3JheXNjYWxlfVxuICAgICAgICAgICAgICAgIG9uQ2hhbmdlPXsodikgPT4gY2hhbmdlKHtncmF5c2NhbGU6IHZ9KX1cbiAgICAgICAgICAgIC8+XG4gICAgICAgICAgICA8U2NoZW1lXG4gICAgICAgICAgICAgICAgaXNEYXJrPXt0aGVtZS5tb2RlID09PSAxfVxuICAgICAgICAgICAgICAgIG9uQ2hhbmdlPXsoaXNEYXJrKSA9PiBjaGFuZ2Uoe21vZGU6IGlzRGFyayA/IDEgOiAwfSl9XG4gICAgICAgICAgICAvPlxuICAgICAgICAgICAgPE1vZGVcbiAgICAgICAgICAgICAgICBtb2RlPXt0aGVtZS5lbmdpbmV9XG4gICAgICAgICAgICAgICAgb25DaGFuZ2U9eyhtb2RlKSA9PiBjaGFuZ2Uoe2VuZ2luZTogbW9kZX0pfVxuICAgICAgICAgICAgLz5cbiAgICAgICAgPC9BcnJheT5cbiAgICApO1xufVxuXG5mdW5jdGlvbiBDb2xvcnNHcm91cCh7dGhlbWUsIGNoYW5nZX06IFRoZW1lR3JvdXBQcm9wcykge1xuICAgIGNvbnN0IGlzRGFya1NjaGVtZSA9IHRoZW1lLm1vZGUgPT09IDE7XG4gICAgY29uc3QgYmdQcm9wOiBrZXlvZiBUaGVtZSA9IGlzRGFya1NjaGVtZSA/ICdkYXJrU2NoZW1lQmFja2dyb3VuZENvbG9yJyA6ICdsaWdodFNjaGVtZUJhY2tncm91bmRDb2xvcic7XG4gICAgY29uc3QgZmdQcm9wOiBrZXlvZiBUaGVtZSA9IGlzRGFya1NjaGVtZSA/ICdkYXJrU2NoZW1lVGV4dENvbG9yJyA6ICdsaWdodFNjaGVtZVRleHRDb2xvcic7XG4gICAgY29uc3QgZGVmYXVsdFNjaGVtZUNvbG9ycyA9IGlzRGFya1NjaGVtZSA/IERFRkFVTFRfQ09MT1JTLmRhcmtTY2hlbWUgOiBERUZBVUxUX0NPTE9SUy5saWdodFNjaGVtZTtcbiAgICBjb25zdCBkZWZhdWx0TWF0cml4VmFsdWVzOiBQYXJ0aWFsPFRoZW1lPiA9IHticmlnaHRuZXNzOiBERUZBVUxUX1RIRU1FLmJyaWdodG5lc3MsIGNvbnRyYXN0OiBERUZBVUxUX1RIRU1FLmNvbnRyYXN0LCBzZXBpYTogREVGQVVMVF9USEVNRS5zZXBpYSwgZ3JheXNjYWxlOiBERUZBVUxUX1RIRU1FLmdyYXlzY2FsZX07XG5cbiAgICByZXR1cm4gKFxuICAgICAgICA8QXJyYXk+XG4gICAgICAgICAgICA8QmFja2dyb3VuZENvbG9yXG4gICAgICAgICAgICAgICAgdmFsdWU9e3RoZW1lW2JnUHJvcF0gPT09ICdhdXRvJyA/IGRlZmF1bHRTY2hlbWVDb2xvcnMuYmFja2dyb3VuZCA6IHRoZW1lW2JnUHJvcF19XG4gICAgICAgICAgICAgICAgb25DaGFuZ2U9eyh2KSA9PiBjaGFuZ2Uoe1tiZ1Byb3BdOiB2LCAuLi5kZWZhdWx0TWF0cml4VmFsdWVzfSl9XG4gICAgICAgICAgICAgICAgY2FuUmVzZXQ9e3RoZW1lW2JnUHJvcF0gIT09IGRlZmF1bHRTY2hlbWVDb2xvcnMuYmFja2dyb3VuZH1cbiAgICAgICAgICAgICAgICBvblJlc2V0PXsoKSA9PiBjaGFuZ2Uoe1tiZ1Byb3BdOiBERUZBVUxUX1NFVFRJTkdTLnRoZW1lW2JnUHJvcF19KX1cbiAgICAgICAgICAgIC8+XG4gICAgICAgICAgICA8VGV4dENvbG9yXG4gICAgICAgICAgICAgICAgdmFsdWU9e3RoZW1lW2ZnUHJvcF0gPT09ICdhdXRvJyA/IGRlZmF1bHRTY2hlbWVDb2xvcnMudGV4dCA6IHRoZW1lW2ZnUHJvcF19XG4gICAgICAgICAgICAgICAgb25DaGFuZ2U9eyh2KSA9PiBjaGFuZ2Uoe1tmZ1Byb3BdOiB2LCAuLi5kZWZhdWx0TWF0cml4VmFsdWVzfSl9XG4gICAgICAgICAgICAgICAgY2FuUmVzZXQ9e3RoZW1lW2ZnUHJvcF0gIT09IGRlZmF1bHRTY2hlbWVDb2xvcnMudGV4dH1cbiAgICAgICAgICAgICAgICBvblJlc2V0PXsoKSA9PiBjaGFuZ2Uoe1tmZ1Byb3BdOiBERUZBVUxUX1NFVFRJTkdTLnRoZW1lW2ZnUHJvcF19KX1cbiAgICAgICAgICAgIC8+XG4gICAgICAgICAgICA8U2Nyb2xsYmFyXG4gICAgICAgICAgICAgICAgdmFsdWU9e3RoZW1lLnNjcm9sbGJhckNvbG9yfVxuICAgICAgICAgICAgICAgIG9uQ2hhbmdlPXsodikgPT4gY2hhbmdlKHtzY3JvbGxiYXJDb2xvcjogdn0pfVxuICAgICAgICAgICAgICAgIG9uUmVzZXQ9eygpID0+IGNoYW5nZSh7c2Nyb2xsYmFyQ29sb3I6IERFRkFVTFRfU0VUVElOR1MudGhlbWUuc2Nyb2xsYmFyQ29sb3J9KX1cbiAgICAgICAgICAgIC8+XG4gICAgICAgICAgICA8U2VsZWN0aW9uQ29sb3JFZGl0b3JcbiAgICAgICAgICAgICAgICB2YWx1ZT17dGhlbWUuc2VsZWN0aW9uQ29sb3J9XG4gICAgICAgICAgICAgICAgb25DaGFuZ2U9eyh2KSA9PiBjaGFuZ2Uoe3NlbGVjdGlvbkNvbG9yOiB2fSl9XG4gICAgICAgICAgICAgICAgb25SZXNldD17KCkgPT4gY2hhbmdlKHtzZWxlY3Rpb25Db2xvcjogREVGQVVMVF9TRVRUSU5HUy50aGVtZS5zZWxlY3Rpb25Db2xvcn0pfVxuICAgICAgICAgICAgLz5cbiAgICAgICAgPC9BcnJheT5cbiAgICApO1xufVxuXG5pbnRlcmZhY2UgRm9udEdyb3Vwc1Byb3BzIGV4dGVuZHMgVGhlbWVHcm91cFByb3BzIHtcbiAgICBmb250czogc3RyaW5nW107XG59XG5cbmZ1bmN0aW9uIEZvbnRHcm91cCh7dGhlbWUsIGZvbnRzLCBjaGFuZ2V9OiBGb250R3JvdXBzUHJvcHMpIHtcbiAgICByZXR1cm4gKFxuICAgICAgICA8QXJyYXk+XG4gICAgICAgICAgICA8VXNlRm9udFxuICAgICAgICAgICAgICAgIHZhbHVlPXt0aGVtZS51c2VGb250fVxuICAgICAgICAgICAgICAgIG9uQ2hhbmdlPXsodXNlRm9udCkgPT4gY2hhbmdlKHt1c2VGb250fSl9XG4gICAgICAgICAgICAvPlxuICAgICAgICAgICAgPEZvbnRQaWNrZXJcbiAgICAgICAgICAgICAgICB0aGVtZT17dGhlbWV9XG4gICAgICAgICAgICAgICAgZm9udHM9e2ZvbnRzfVxuICAgICAgICAgICAgICAgIG9uQ2hhbmdlPXsoZm9udEZhbWlseSkgPT4gY2hhbmdlKHtmb250RmFtaWx5fSl9XG4gICAgICAgICAgICAvPlxuICAgICAgICAgICAgPFRleHRTdHJva2VcbiAgICAgICAgICAgICAgICB2YWx1ZT17dGhlbWUudGV4dFN0cm9rZX1cbiAgICAgICAgICAgICAgICBvbkNoYW5nZT17KHRleHRTdHJva2UpID0+IGNoYW5nZSh7dGV4dFN0cm9rZX0pfVxuICAgICAgICAgICAgLz5cbiAgICAgICAgICAgIDxTdHlsZVN5c3RlbUNvbnRyb2xzXG4gICAgICAgICAgICAgICAgdmFsdWU9e3RoZW1lLnN0eWxlU3lzdGVtQ29udHJvbHN9XG4gICAgICAgICAgICAgICAgb25DaGFuZ2U9eyhzdHlsZVN5c3RlbUNvbnRyb2xzKSA9PiBjaGFuZ2Uoe3N0eWxlU3lzdGVtQ29udHJvbHN9KX1cbiAgICAgICAgICAgIC8+XG4gICAgICAgIDwvQXJyYXk+XG4gICAgKTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gVGhlbWVQYWdlKHByb3BzOiBWaWV3UHJvcHMpIHtcbiAgICBjb25zdCB7dGhlbWUsIGNoYW5nZX0gPSBnZXRDdXJyZW50VGhlbWVQcmVzZXQocHJvcHMpO1xuXG4gICAgcmV0dXJuIChcbiAgICAgICAgPHNlY3Rpb24gY2xhc3M9XCJtLXNlY3Rpb24gdGhlbWUtcGFnZVwiPlxuICAgICAgICAgICAgPFRoZW1lUHJlc2V0UGlja2VyIHsuLi5wcm9wc30gLz5cbiAgICAgICAgICAgIDxDb2xsYXBzaWJsZT5cbiAgICAgICAgICAgICAgICA8Q29sbGFwc2libGUuR3JvdXAgaWQ9XCJtYWluXCIgbGFiZWw9XCJCcmlnaHRuZXNzLCBjb250cmFzdCwgbW9kZVwiPlxuICAgICAgICAgICAgICAgICAgICA8TWFpbkdyb3VwIHRoZW1lPXt0aGVtZX0gY2hhbmdlPXtjaGFuZ2V9IC8+XG4gICAgICAgICAgICAgICAgPC9Db2xsYXBzaWJsZS5Hcm91cD5cbiAgICAgICAgICAgICAgICA8Q29sbGFwc2libGUuR3JvdXAgaWQ9XCJjb2xvcnNcIiBsYWJlbD1cIkNvbG9yc1wiPlxuICAgICAgICAgICAgICAgICAgICA8Q29sb3JzR3JvdXAgdGhlbWU9e3RoZW1lfSBjaGFuZ2U9e2NoYW5nZX0gLz5cbiAgICAgICAgICAgICAgICA8L0NvbGxhcHNpYmxlLkdyb3VwPlxuICAgICAgICAgICAgICAgIDxDb2xsYXBzaWJsZS5Hcm91cCBpZD1cImZvbnRcIiBsYWJlbD1cIkZvbnQgJiBtb3JlXCI+XG4gICAgICAgICAgICAgICAgICAgIDxGb250R3JvdXAgdGhlbWU9e3RoZW1lfSBmb250cz17cHJvcHMuZGF0YS5mb250c30gY2hhbmdlPXtjaGFuZ2V9IC8+XG4gICAgICAgICAgICAgICAgPC9Db2xsYXBzaWJsZS5Hcm91cD5cbiAgICAgICAgICAgIDwvQ29sbGFwc2libGU+XG4gICAgICAgICAgICA8UmVzZXRCdXR0b24gey4uLnByb3BzfSAvPlxuICAgICAgICA8L3NlY3Rpb24+XG4gICAgKTtcbn1cbiIsImltcG9ydCB7bX0gZnJvbSAnbWFsZXZpYyc7XG5pbXBvcnQge2dldENvbnRleHR9IGZyb20gJ21hbGV2aWMvZG9tJztcbmltcG9ydCB7REVGQVVMVF9TRVRUSU5HU30gZnJvbSAnLi4vLi4vLi4vZGVmYXVsdHMnO1xuaW1wb3J0IHtNZXNzYWdlQm94LCBSZXNldEJ1dHRvbn0gZnJvbSAnLi4vLi4vY29udHJvbHMnO1xuaW1wb3J0IENvbnRyb2xHcm91cCBmcm9tICcuLi9jb250cm9sLWdyb3VwJztcbmltcG9ydCB7Vmlld1Byb3BzfSBmcm9tICcuLi90eXBlcyc7XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIFJlc2V0QnV0dG9uR3JvdXAocHJvcHM6IFZpZXdQcm9wcykge1xuICAgIGNvbnN0IGNvbnRleHQgPSBnZXRDb250ZXh0KCk7XG5cbiAgICBmdW5jdGlvbiBzaG93RGlhbG9nKCkge1xuICAgICAgICBjb250ZXh0LnN0b3JlLmlzRGlhbG9nVmlzaWJsZSA9IHRydWU7XG4gICAgICAgIGNvbnRleHQucmVmcmVzaCgpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGhpZGVEaWFsb2coKSB7XG4gICAgICAgIGNvbnRleHQuc3RvcmUuaXNEaWFsb2dWaXNpYmxlID0gZmFsc2U7XG4gICAgICAgIGNvbnRleHQucmVmcmVzaCgpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHJlc2V0KCkge1xuICAgICAgICBjb250ZXh0LnN0b3JlLmlzRGlhbG9nVmlzaWJsZSA9IGZhbHNlO1xuICAgICAgICBwcm9wcy5hY3Rpb25zLmNoYW5nZVNldHRpbmdzKERFRkFVTFRfU0VUVElOR1MpO1xuICAgIH1cblxuICAgIGNvbnN0IGRpYWxvZyA9IGNvbnRleHQuc3RvcmUuaXNEaWFsb2dWaXNpYmxlID8gKFxuICAgICAgICA8TWVzc2FnZUJveFxuICAgICAgICAgICAgY2FwdGlvbj1cIkFyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byByZW1vdmUgYWxsIHlvdXIgc2V0dGluZ3M/IFlvdSBjYW5ub3QgcmVzdG9yZSB0aGVtIGxhdGVyXCJcbiAgICAgICAgICAgIG9uT0s9e3Jlc2V0fVxuICAgICAgICAgICAgb25DYW5jZWw9e2hpZGVEaWFsb2d9XG4gICAgICAgIC8+XG4gICAgKSA6IG51bGw7XG5cbiAgICByZXR1cm4gKFxuICAgICAgICA8Q29udHJvbEdyb3VwPlxuICAgICAgICAgICAgPENvbnRyb2xHcm91cC5Db250cm9sPlxuICAgICAgICAgICAgICAgIDxSZXNldEJ1dHRvbiBvbkNsaWNrPXtzaG93RGlhbG9nfT5cbiAgICAgICAgICAgICAgICAgICAgUmVzZXQgc2V0dGluZ3NcbiAgICAgICAgICAgICAgICAgICAge2RpYWxvZ31cbiAgICAgICAgICAgICAgICA8L1Jlc2V0QnV0dG9uPlxuICAgICAgICAgICAgPC9Db250cm9sR3JvdXAuQ29udHJvbD5cbiAgICAgICAgICAgIDxDb250cm9sR3JvdXAuRGVzY3JpcHRpb24+XG4gICAgICAgICAgICAgICAgUmVzdG9yZSBzZXR0aW5ncyB0byBkZWZhdWx0c1xuICAgICAgICAgICAgPC9Db250cm9sR3JvdXAuRGVzY3JpcHRpb24+XG4gICAgICAgIDwvQ29udHJvbEdyb3VwPlxuICAgICk7XG59XG4iLCJpbXBvcnQge219IGZyb20gJ21hbGV2aWMnO1xuaW1wb3J0IHtWaWV3UHJvcHN9IGZyb20gJy4uL3R5cGVzJztcbmltcG9ydCBDb250cm9sR3JvdXAgZnJvbSAnLi4vY29udHJvbC1ncm91cCc7XG5pbXBvcnQge1VzZXJTZXR0aW5nc30gZnJvbSAnLi4vLi4vLi4vZGVmaW5pdGlvbnMnO1xuaW1wb3J0IHtCdXR0b259IGZyb20gJy4uLy4uL2NvbnRyb2xzJztcbmltcG9ydCB7b3BlbkZpbGV9IGZyb20gJy4uLy4uL3V0aWxzJztcbmltcG9ydCB7REVGQVVMVF9TRVRUSU5HU30gZnJvbSAnLi4vLi4vLi4vZGVmYXVsdHMnO1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBJbXBvcnRCdXR0b24ocHJvcHM6IFZpZXdQcm9wcykge1xuXG4gICAgZnVuY3Rpb24gZ2V0VmFsaWRhdGVkT2JqZWN0PFQ+KHNvdXJjZTogYW55LCBjb21wYXJlOiBUKTogUGFydGlhbDxUPiB7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IHt9O1xuICAgICAgICBpZiAoc291cmNlID09IG51bGwgfHwgdHlwZW9mIHNvdXJjZSAhPT0gJ29iamVjdCcgfHwgQXJyYXkuaXNBcnJheShzb3VyY2UpKSB7XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuICAgICAgICBPYmplY3Qua2V5cyhzb3VyY2UpLmZvckVhY2goKGtleSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgdmFsdWUgPSBzb3VyY2Vba2V5XTtcbiAgICAgICAgICAgIGlmICh2YWx1ZSA9PSBudWxsIHx8IGNvbXBhcmVba2V5XSA9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgYXJyYXkxID0gQXJyYXkuaXNBcnJheSh2YWx1ZSk7XG4gICAgICAgICAgICBjb25zdCBhcnJheTIgPSBBcnJheS5pc0FycmF5KGNvbXBhcmVba2V5XSk7XG4gICAgICAgICAgICBpZiAoYXJyYXkxIHx8IGFycmF5Mikge1xuICAgICAgICAgICAgICAgIGlmIChhcnJheTEgJiYgYXJyYXkyKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdFtrZXldID0gdmFsdWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHR5cGVvZiBjb21wYXJlW2tleV0gPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0W2tleV0gPSBnZXRWYWxpZGF0ZWRPYmplY3QodmFsdWUsIGNvbXBhcmVba2V5XSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gdHlwZW9mIGNvbXBhcmVba2V5XSkge1xuICAgICAgICAgICAgICAgIHJlc3VsdFtrZXldID0gdmFsdWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGltcG9ydFNldHRpbmdzKCkge1xuICAgICAgICBvcGVuRmlsZSh7ZXh0ZW5zaW9uczogWydqc29uJ119LCAocmVzdWx0OiBzdHJpbmcpID0+IHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgY29udGVudDogVXNlclNldHRpbmdzID0gSlNPTi5wYXJzZShyZXN1bHQpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdDIgPSBnZXRWYWxpZGF0ZWRPYmplY3QoY29udGVudCwgREVGQVVMVF9TRVRUSU5HUyk7XG4gICAgICAgICAgICAgICAgcHJvcHMuYWN0aW9ucy5jaGFuZ2VTZXR0aW5ncyh7Li4ucmVzdWx0Mn0pO1xuICAgICAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICAgICAgLy8gVE9ETyBNYWtlIG92ZXJsYXkgRXJyb3JcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGVycik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiAoXG4gICAgICAgIDxDb250cm9sR3JvdXA+XG4gICAgICAgICAgICA8Q29udHJvbEdyb3VwLkNvbnRyb2w+XG4gICAgICAgICAgICAgICAgPEJ1dHRvblxuICAgICAgICAgICAgICAgICAgICBvbmNsaWNrPXtpbXBvcnRTZXR0aW5nc31cbiAgICAgICAgICAgICAgICAgICAgY2xhc3M9XCJzZXR0aW5ncy1idXR0b25cIlxuICAgICAgICAgICAgICAgID5cbiAgICAgICAgICAgICAgICAgICAgSW1wb3J0IFNldHRpbmdzXG4gICAgICAgICAgICAgICAgPC9CdXR0b24+XG4gICAgICAgICAgICA8L0NvbnRyb2xHcm91cC5Db250cm9sPlxuICAgICAgICAgICAgPENvbnRyb2xHcm91cC5EZXNjcmlwdGlvbj5cbiAgICAgICAgICAgICAgICBPcGVuIHNldHRpbmdzIGZyb20gYSBKU09OIGZpbGVcbiAgICAgICAgICAgIDwvQ29udHJvbEdyb3VwLkRlc2NyaXB0aW9uPlxuICAgICAgICA8L0NvbnRyb2xHcm91cD5cbiAgICApO1xufVxuIiwiaW1wb3J0IHttfSBmcm9tICdtYWxldmljJztcbmltcG9ydCB7Vmlld1Byb3BzfSBmcm9tICcuLi90eXBlcyc7XG5pbXBvcnQge0J1dHRvbn0gZnJvbSAnLi4vLi4vY29udHJvbHMnO1xuaW1wb3J0IHtzYXZlRmlsZX0gZnJvbSAnLi4vLi4vdXRpbHMnO1xuaW1wb3J0IENvbnRyb2xHcm91cCBmcm9tICcuLi9jb250cm9sLWdyb3VwJztcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gRXhwb3J0QnV0dG9uKHByb3BzOiBWaWV3UHJvcHMpIHtcbiAgICBmdW5jdGlvbiBleHBvcnRTZXR0aW5ncygpIHtcbiAgICAgICAgc2F2ZUZpbGUoJ0RhcmstUmVhZGVyLVNldHRpbmdzLmpzb24nLCBKU09OLnN0cmluZ2lmeShwcm9wcy5kYXRhLnNldHRpbmdzLCBudWxsLCA0KSk7XG4gICAgfVxuICAgIHJldHVybiAoXG4gICAgICAgIDxDb250cm9sR3JvdXA+XG4gICAgICAgICAgICA8Q29udHJvbEdyb3VwLkNvbnRyb2w+XG4gICAgICAgICAgICAgICAgPEJ1dHRvblxuICAgICAgICAgICAgICAgICAgICBvbmNsaWNrPXtleHBvcnRTZXR0aW5nc31cbiAgICAgICAgICAgICAgICAgICAgY2xhc3M9XCJzZXR0aW5ncy1idXR0b25cIlxuICAgICAgICAgICAgICAgID5cbiAgICAgICAgICAgICAgICAgICAgRXhwb3J0IFNldHRpbmdzXG4gICAgICAgICAgICAgICAgPC9CdXR0b24+XG4gICAgICAgICAgICA8L0NvbnRyb2xHcm91cC5Db250cm9sPlxuICAgICAgICAgICAgPENvbnRyb2xHcm91cC5EZXNjcmlwdGlvbj5cbiAgICAgICAgICAgICAgICBTYXZlIHNldHRpbmdzIHRvIGEgSlNPTiBmaWxlXG4gICAgICAgICAgICA8L0NvbnRyb2xHcm91cC5EZXNjcmlwdGlvbj5cbiAgICAgICAgPC9Db250cm9sR3JvdXA+XG4gICAgKTtcbn1cbiIsImltcG9ydCB7bX0gZnJvbSAnbWFsZXZpYyc7XG5pbXBvcnQge1ZpZXdQcm9wc30gZnJvbSAnLi4vdHlwZXMnO1xuaW1wb3J0IENoZWNrQnV0dG9uIGZyb20gJy4uL2NoZWNrLWJ1dHRvbic7XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIFN5bmNTZXR0aW5ncyhwcm9wczogVmlld1Byb3BzKSB7XG4gICAgZnVuY3Rpb24gb25TeW5jU2V0dGluZ3NDaGFuZ2UoY2hlY2tlZDogYm9vbGVhbikge1xuICAgICAgICBwcm9wcy5hY3Rpb25zLmNoYW5nZVNldHRpbmdzKHtzeW5jU2V0dGluZ3M6IGNoZWNrZWR9KTtcbiAgICB9XG5cbiAgICByZXR1cm4gKFxuICAgICAgICA8Q2hlY2tCdXR0b25cbiAgICAgICAgICAgIGNoZWNrZWQ9e3Byb3BzLmRhdGEuc2V0dGluZ3Muc3luY1NldHRpbmdzfVxuICAgICAgICAgICAgbGFiZWw9XCJFbmFibGUgc2V0dGluZ3Mgc3luY1wiXG4gICAgICAgICAgICBkZXNjcmlwdGlvbj17cHJvcHMuZGF0YS5zZXR0aW5ncy5zeW5jU2V0dGluZ3MgP1xuICAgICAgICAgICAgICAgICdTeW5jaHJvbml6ZWQgYWNyb3NzIGRldmljZXMnIDpcbiAgICAgICAgICAgICAgICAnTm90IHN5bmNocm9uaXplZCBhY3Jvc3MgZGV2aWNlcyd9XG4gICAgICAgICAgICBvbkNoYW5nZT17b25TeW5jU2V0dGluZ3NDaGFuZ2V9XG4gICAgICAgIC8+XG4gICAgKTtcbn1cbiIsImltcG9ydCB7bX0gZnJvbSAnbWFsZXZpYyc7XG5pbXBvcnQge0J1dHRvbn0gZnJvbSAnLi4vLi4vY29udHJvbHMnO1xuaW1wb3J0IHtzYXZlRmlsZX0gZnJvbSAnLi4vLi4vdXRpbHMnO1xuaW1wb3J0IENvbnRyb2xHcm91cCBmcm9tICcuLi9jb250cm9sLWdyb3VwJztcbmltcG9ydCB7Z2V0VVJMSG9zdE9yUHJvdG9jb2x9IGZyb20gJy4uLy4uLy4uL3V0aWxzL3VybCc7XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIEV4cG9ydFRoZW1lKCkge1xuICAgIGNvbnN0IGxpc3RlbmVyID0gKHt0eXBlLCBkYXRhfSwgc2VuZGVyOiBjaHJvbWUucnVudGltZS5NZXNzYWdlU2VuZGVyKSA9PiB7XG4gICAgICAgIGlmICh0eXBlID09PSAnZXhwb3J0LWNzcy1yZXNwb25zZScpIHtcbiAgICAgICAgICAgIGNvbnN0IHVybCA9IGdldFVSTEhvc3RPclByb3RvY29sKHNlbmRlci50YWIudXJsKS5yZXBsYWNlKC9bXmEtejAtMVxcLV0vZywgJy0nKTtcbiAgICAgICAgICAgIHNhdmVGaWxlKGBEYXJrUmVhZGVyLSR7dXJsfS5jc3NgLCBkYXRhKTtcbiAgICAgICAgICAgIGNocm9tZS5ydW50aW1lLm9uTWVzc2FnZS5yZW1vdmVMaXN0ZW5lcihsaXN0ZW5lcik7XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgZnVuY3Rpb24gZXhwb3J0Q1NTKCkge1xuICAgICAgICBjaHJvbWUucnVudGltZS5vbk1lc3NhZ2UuYWRkTGlzdGVuZXIobGlzdGVuZXIpO1xuICAgICAgICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7dHlwZTogJ3JlcXVlc3QtZXhwb3J0LWNzcyd9KTtcbiAgICB9XG4gICAgcmV0dXJuIChcbiAgICAgICAgPENvbnRyb2xHcm91cD5cbiAgICAgICAgICAgIDxDb250cm9sR3JvdXAuQ29udHJvbD5cbiAgICAgICAgICAgICAgICA8QnV0dG9uXG4gICAgICAgICAgICAgICAgICAgIG9uY2xpY2s9e2V4cG9ydENTU31cbiAgICAgICAgICAgICAgICAgICAgY2xhc3M9XCJzZXR0aW5ncy1idXR0b25cIlxuICAgICAgICAgICAgICAgID5cbiAgICAgICAgICAgICAgICAgICAgRXhwb3J0IER5bmFtaWMgVGhlbWVcbiAgICAgICAgICAgICAgICA8L0J1dHRvbj5cbiAgICAgICAgICAgIDwvQ29udHJvbEdyb3VwLkNvbnRyb2w+XG4gICAgICAgICAgICA8Q29udHJvbEdyb3VwLkRlc2NyaXB0aW9uPlxuICAgICAgICAgICAgICAgIFNhdmUgZ2VuZXJhdGVkIENTUyB0byBhIGZpbGVcbiAgICAgICAgICAgIDwvQ29udHJvbEdyb3VwLkRlc2NyaXB0aW9uPlxuICAgICAgICA8L0NvbnRyb2xHcm91cD5cbiAgICApO1xufVxuIiwiaW1wb3J0IHttfSBmcm9tICdtYWxldmljJztcbmltcG9ydCB7Vmlld1Byb3BzfSBmcm9tICcuLi90eXBlcyc7XG5pbXBvcnQgQ2hlY2tCdXR0b24gZnJvbSAnLi4vY2hlY2stYnV0dG9uJztcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gU3luY0NvbmZpZ0J1dHRvbihwcm9wczogVmlld1Byb3BzKSB7XG4gICAgZnVuY3Rpb24gc3luY0NvbmZpZyhzeW5jU2l0ZXNGaXhlczogYm9vbGVhbikge1xuICAgICAgICBwcm9wcy5hY3Rpb25zLmNoYW5nZVNldHRpbmdzKHtzeW5jU2l0ZXNGaXhlc30pO1xuICAgICAgICBwcm9wcy5hY3Rpb25zLmxvYWRDb25maWcoe2xvY2FsOiAhc3luY1NpdGVzRml4ZXN9KTtcbiAgICB9XG4gICAgcmV0dXJuIChcbiAgICAgICAgPENoZWNrQnV0dG9uXG4gICAgICAgICAgICBjaGVja2VkPXtwcm9wcy5kYXRhLnNldHRpbmdzLnN5bmNTaXRlc0ZpeGVzfVxuICAgICAgICAgICAgbGFiZWw9XCJTeW5jaHJvbml6ZSBzaXRlcyBmaXhlc1wiXG4gICAgICAgICAgICBkZXNjcmlwdGlvbj1cIkxvYWQgdGhlIGxhdGVzdCBzaXRlcyBmaXhlcyBmcm9tIGEgcmVtb3RlIHNlcnZlclwiXG4gICAgICAgICAgICBvbkNoYW5nZT17c3luY0NvbmZpZ30gLz5cbiAgICApO1xufVxuIiwiaW1wb3J0IHttfSBmcm9tICdtYWxldmljJztcbmltcG9ydCB7Vmlld1Byb3BzfSBmcm9tICcuLi90eXBlcyc7XG5pbXBvcnQgUmVzZXRCdXR0b25Hcm91cCBmcm9tICcuL3Jlc2V0LXNldHRpbmdzLWJ1dHRvbic7XG5pbXBvcnQgSW1wb3J0QnV0dG9uIGZyb20gJy4vaW1wb3J0LXNldHRpbmdzJztcbmltcG9ydCBFeHBvcnRCdXR0b24gZnJvbSAnLi9leHBvcnQtc2V0dGluZ3MnO1xuaW1wb3J0IFN5bmNTZXR0aW5ncyBmcm9tICcuL3N5bmMtc2V0dGluZ3MnO1xuaW1wb3J0IEV4cG9ydFRoZW1lIGZyb20gJy4vZXhwb3J0LXRoZW1lJztcbmltcG9ydCB7aXNVUkxJbkxpc3R9IGZyb20gJy4uLy4uLy4uL3V0aWxzL3VybCc7XG5pbXBvcnQgdGhlbWVFbmdpbmVzIGZyb20gJy4uLy4uLy4uL2dlbmVyYXRvcnMvdGhlbWUtZW5naW5lcyc7XG5pbXBvcnQgU3luY0NvbmZpZ0J1dHRvbiBmcm9tICcuL3N5bmMtY29uZmlnJztcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gTWFuYWdlU2V0dGluZ3NQYWdlKHByb3BzOiBWaWV3UHJvcHMpIHtcbiAgICBjb25zdCBjdXN0b20gPSBwcm9wcy5kYXRhLnNldHRpbmdzLmN1c3RvbVRoZW1lcy5maW5kKFxuICAgICAgICAoe3VybH0pID0+IGlzVVJMSW5MaXN0KHByb3BzLnRhYi51cmwsIHVybClcbiAgICApO1xuICAgIGNvbnN0IGVuZ2luZSA9IGN1c3RvbSA/XG4gICAgICAgIGN1c3RvbS50aGVtZS5lbmdpbmUgOlxuICAgICAgICBwcm9wcy5kYXRhLnNldHRpbmdzLnRoZW1lLmVuZ2luZTtcblxuICAgIHJldHVybiAoXG4gICAgICAgIDxzZWN0aW9uIGNsYXNzPVwibS1zZWN0aW9uXCI+XG4gICAgICAgICAgICA8U3luY1NldHRpbmdzIHsuLi5wcm9wc30gLz5cbiAgICAgICAgICAgIDxTeW5jQ29uZmlnQnV0dG9uIHsuLi5wcm9wc30gLz5cbiAgICAgICAgICAgIDxJbXBvcnRCdXR0b24gey4uLnByb3BzfSAvPlxuICAgICAgICAgICAgPEV4cG9ydEJ1dHRvbiB7Li4ucHJvcHN9IC8+XG4gICAgICAgICAgICB7ZW5naW5lID09PSB0aGVtZUVuZ2luZXMuZHluYW1pY1RoZW1lID8gPEV4cG9ydFRoZW1lIC8+IDogbnVsbH1cbiAgICAgICAgICAgIDxSZXNldEJ1dHRvbkdyb3VwIHsuLi5wcm9wc30gLz5cbiAgICAgICAgPC9zZWN0aW9uPlxuICAgICk7XG59XG4iLCJpbXBvcnQge219IGZyb20gJ21hbGV2aWMnO1xuaW1wb3J0IHtnZXRDb250ZXh0fSBmcm9tICdtYWxldmljL2RvbSc7XG5pbXBvcnQge0RPTkFURV9VUkx9IGZyb20gJy4uLy4uLy4uL3V0aWxzL2xpbmtzJztcbmltcG9ydCB7Z2V0TG9jYWxNZXNzYWdlfSBmcm9tICcuLi8uLi8uLi91dGlscy9sb2NhbGVzJztcbmltcG9ydCB7aXNNb2JpbGV9IGZyb20gJy4uLy4uLy4uL3V0aWxzL3BsYXRmb3JtJztcbmltcG9ydCB7T3ZlcmxheX0gZnJvbSAnLi4vLi4vY29udHJvbHMnO1xuaW1wb3J0IEF1dG9tYXRpb25QYWdlIGZyb20gJy4uL2F1dG9tYXRpb24tcGFnZSc7XG5pbXBvcnQgTWFpblBhZ2UgZnJvbSAnLi4vbWFpbi1wYWdlJztcbmltcG9ydCB7UGFnZSwgUGFnZVZpZXdlcn0gZnJvbSAnLi4vcGFnZS12aWV3ZXInO1xuaW1wb3J0IFNldHRpbmdzUGFnZSBmcm9tICcuLi9zZXR0aW5ncy1wYWdlJztcbmltcG9ydCBTaXRlTGlzdFBhZ2UgZnJvbSAnLi4vc2l0ZS1saXN0LXBhZ2UnO1xuaW1wb3J0IFRoZW1lUGFnZSBmcm9tICcuLi90aGVtZS9wYWdlJztcbmltcG9ydCB7Vmlld1Byb3BzfSBmcm9tICcuLi90eXBlcyc7XG5pbXBvcnQgTWFuYWdlU2V0dGluZ3NQYWdlIGZyb20gJy4uL21hbmFnZS1zZXR0aW5ncy1wYWdlJztcblxuZnVuY3Rpb24gTG9nbygpIHtcbiAgICByZXR1cm4gKFxuICAgICAgICA8YVxuICAgICAgICAgICAgY2xhc3M9XCJtLWxvZ29cIlxuICAgICAgICAgICAgaHJlZj1cImh0dHBzOi8vZGFya3JlYWRlci5vcmcvXCJcbiAgICAgICAgICAgIHRhcmdldD1cIl9ibGFua1wiXG4gICAgICAgICAgICByZWw9XCJub29wZW5lciBub3JlZmVycmVyXCJcbiAgICAgICAgPlxuICAgICAgICAgICAgRGFyayBSZWFkZXJcbiAgICAgICAgPC9hPlxuICAgICk7XG59XG5cbnR5cGUgUGFnZUlkID0gKFxuICAgICdtYWluJ1xuICAgIHwgJ3RoZW1lJ1xuICAgIHwgJ3NldHRpbmdzJ1xuICAgIHwgJ3NpdGUtbGlzdCdcbiAgICB8ICdhdXRvbWF0aW9uJ1xuICAgIHwgJ21hbmFnZS1zZXR0aW5ncydcbik7XG5cbmZ1bmN0aW9uIFBhZ2VzKHByb3BzOiBWaWV3UHJvcHMpIHtcbiAgICBjb25zdCBjb250ZXh0ID0gZ2V0Q29udGV4dCgpO1xuICAgIGNvbnN0IHN0b3JlID0gY29udGV4dC5zdG9yZSBhcyB7XG4gICAgICAgIGFjdGl2ZVBhZ2U6IFBhZ2VJZDtcbiAgICB9O1xuICAgIGlmIChzdG9yZS5hY3RpdmVQYWdlID09IG51bGwpIHtcbiAgICAgICAgc3RvcmUuYWN0aXZlUGFnZSA9ICdtYWluJztcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBvblRoZW1lTmF2Q2xpY2soKSB7XG4gICAgICAgIHN0b3JlLmFjdGl2ZVBhZ2UgPSAndGhlbWUnO1xuICAgICAgICBjb250ZXh0LnJlZnJlc2goKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBvblNldHRpbmdzTmF2Q2xpY2soKSB7XG4gICAgICAgIHN0b3JlLmFjdGl2ZVBhZ2UgPSAnc2V0dGluZ3MnO1xuICAgICAgICBjb250ZXh0LnJlZnJlc2goKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBvbkF1dG9tYXRpb25OYXZDbGljaygpIHtcbiAgICAgICAgc3RvcmUuYWN0aXZlUGFnZSA9ICdhdXRvbWF0aW9uJztcbiAgICAgICAgY29udGV4dC5yZWZyZXNoKCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gb25NYW5hZ2VTZXR0aW5nc0NsaWNrKCkge1xuICAgICAgICBzdG9yZS5hY3RpdmVQYWdlID0gJ21hbmFnZS1zZXR0aW5ncyc7XG4gICAgICAgIGNvbnRleHQucmVmcmVzaCgpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIG9uU2l0ZUxpc3ROYXZDbGljaygpIHtcbiAgICAgICAgc3RvcmUuYWN0aXZlUGFnZSA9ICdzaXRlLWxpc3QnO1xuICAgICAgICBjb250ZXh0LnJlZnJlc2goKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBvbkJhY2tDbGljaygpIHtcbiAgICAgICAgY29uc3QgYWN0aXZlUGFnZSA9IHN0b3JlLmFjdGl2ZVBhZ2U7XG4gICAgICAgIGNvbnN0IHNldHRpbmdzUGFnZVN1YnBhZ2VzID0gWydhdXRvbWF0aW9uJywgJ21hbmFnZS1zZXR0aW5ncycsICdzaXRlLWxpc3QnXSBhcyBQYWdlSWRbXTtcbiAgICAgICAgaWYgKHNldHRpbmdzUGFnZVN1YnBhZ2VzLmluY2x1ZGVzKGFjdGl2ZVBhZ2UpKSB7XG4gICAgICAgICAgICBzdG9yZS5hY3RpdmVQYWdlID0gJ3NldHRpbmdzJztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHN0b3JlLmFjdGl2ZVBhZ2UgPSAnbWFpbic7XG4gICAgICAgIH1cbiAgICAgICAgY29udGV4dC5yZWZyZXNoKCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIChcbiAgICAgICAgPFBhZ2VWaWV3ZXJcbiAgICAgICAgICAgIGFjdGl2ZVBhZ2U9e3N0b3JlLmFjdGl2ZVBhZ2V9XG4gICAgICAgICAgICBvbkJhY2tCdXR0b25DbGljaz17b25CYWNrQ2xpY2t9XG4gICAgICAgID5cbiAgICAgICAgICAgIDxQYWdlIGlkPVwibWFpblwiPlxuICAgICAgICAgICAgICAgIDxNYWluUGFnZVxuICAgICAgICAgICAgICAgICAgICB7Li4ucHJvcHN9XG4gICAgICAgICAgICAgICAgICAgIG9uVGhlbWVOYXZDbGljaz17b25UaGVtZU5hdkNsaWNrfVxuICAgICAgICAgICAgICAgICAgICBvblNldHRpbmdzTmF2Q2xpY2s9e29uU2V0dGluZ3NOYXZDbGlja31cbiAgICAgICAgICAgICAgICAvPlxuICAgICAgICAgICAgPC9QYWdlPlxuICAgICAgICAgICAgPFBhZ2UgaWQ9XCJ0aGVtZVwiPlxuICAgICAgICAgICAgICAgIDxUaGVtZVBhZ2Ugey4uLnByb3BzfSAvPlxuICAgICAgICAgICAgPC9QYWdlPlxuICAgICAgICAgICAgPFBhZ2UgaWQ9XCJzZXR0aW5nc1wiPlxuICAgICAgICAgICAgICAgIDxTZXR0aW5nc1BhZ2VcbiAgICAgICAgICAgICAgICAgICAgey4uLnByb3BzfVxuICAgICAgICAgICAgICAgICAgICBvbkF1dG9tYXRpb25OYXZDbGljaz17b25BdXRvbWF0aW9uTmF2Q2xpY2t9XG4gICAgICAgICAgICAgICAgICAgIG9uTWFuYWdlU2V0dGluZ3NDbGljaz17b25NYW5hZ2VTZXR0aW5nc0NsaWNrfVxuICAgICAgICAgICAgICAgICAgICBvblNpdGVMaXN0TmF2Q2xpY2s9e29uU2l0ZUxpc3ROYXZDbGlja31cbiAgICAgICAgICAgICAgICAvPlxuICAgICAgICAgICAgPC9QYWdlPlxuICAgICAgICAgICAgPFBhZ2UgaWQ9XCJzaXRlLWxpc3RcIj5cbiAgICAgICAgICAgICAgICA8U2l0ZUxpc3RQYWdlXG4gICAgICAgICAgICAgICAgICAgIHsuLi5wcm9wc31cbiAgICAgICAgICAgICAgICAvPlxuICAgICAgICAgICAgPC9QYWdlPlxuICAgICAgICAgICAgPFBhZ2UgaWQ9XCJhdXRvbWF0aW9uXCI+XG4gICAgICAgICAgICAgICAgPEF1dG9tYXRpb25QYWdlIHsuLi5wcm9wc30gLz5cbiAgICAgICAgICAgIDwvUGFnZT5cbiAgICAgICAgICAgIDxQYWdlIGlkPVwibWFuYWdlLXNldHRpbmdzXCI+XG4gICAgICAgICAgICAgICAgPE1hbmFnZVNldHRpbmdzUGFnZSB7Li4ucHJvcHN9IC8+XG4gICAgICAgICAgICA8L1BhZ2U+XG5cbiAgICAgICAgPC9QYWdlVmlld2VyPlxuICAgICk7XG59XG5cbmZ1bmN0aW9uIERvbmF0ZUdyb3VwKCkge1xuICAgIHJldHVybiAoXG4gICAgICAgIDxkaXYgY2xhc3M9XCJtLWRvbmF0ZS1ncm91cFwiPlxuICAgICAgICAgICAgPGEgY2xhc3M9XCJtLWRvbmF0ZS1idXR0b25cIiBocmVmPXtET05BVEVfVVJMfSB0YXJnZXQ9XCJfYmxhbmtcIiByZWw9XCJub29wZW5lciBub3JlZmVycmVyXCI+XG4gICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJtLWRvbmF0ZS1idXR0b25fX3RleHRcIj5cbiAgICAgICAgICAgICAgICAgICAge2dldExvY2FsTWVzc2FnZSgnZG9uYXRlJyl9XG4gICAgICAgICAgICAgICAgPC9zcGFuPlxuICAgICAgICAgICAgPC9hPlxuICAgICAgICAgICAgPGxhYmVsIGNsYXNzPVwibS1kb25hdGUtZGVzY3JpcHRpb25cIj5cbiAgICAgICAgICAgICAgICBUaGlzIHByb2plY3QgaXMgc3BvbnNvcmVkIGJ5IHlvdVxuICAgICAgICAgICAgPC9sYWJlbD5cbiAgICAgICAgPC9kaXY+XG4gICAgKTtcbn1cblxubGV0IGFwcFZlcnNpb246IHN0cmluZztcblxuZnVuY3Rpb24gQXBwVmVyc2lvbigpIHtcbiAgICBpZiAoIWFwcFZlcnNpb24pIHtcbiAgICAgICAgYXBwVmVyc2lvbiA9IGNocm9tZS5ydW50aW1lLmdldE1hbmlmZXN0KCkudmVyc2lvbjtcbiAgICB9XG4gICAgcmV0dXJuIChcbiAgICAgICAgPGxhYmVsIGNsYXNzPVwiZGFya3JlYWRlci12ZXJzaW9uXCI+VmVyc2lvbiA1IFByZXZpZXcgKHthcHBWZXJzaW9ufSk8L2xhYmVsPlxuICAgICk7XG59XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIEJvZHkocHJvcHM6IFZpZXdQcm9wcykge1xuICAgIGNvbnN0IGNvbnRleHQgPSBnZXRDb250ZXh0KCk7XG4gICAgY29udGV4dC5vbkNyZWF0ZSgoKSA9PiB7XG4gICAgICAgIGlmIChpc01vYmlsZSgpKSB7XG4gICAgICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignY29udGV4dG1lbnUnLCAoZSkgPT4gZS5wcmV2ZW50RGVmYXVsdCgpKTtcbiAgICAgICAgfVxuICAgIH0pO1xuICAgIGNvbnRleHQub25SZW1vdmUoKCkgPT4ge1xuICAgICAgICBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgncHJldmlldycpO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIChcbiAgICAgICAgPGJvZHk+XG4gICAgICAgICAgICA8c2VjdGlvbiBjbGFzcz1cIm0tc2VjdGlvblwiPlxuICAgICAgICAgICAgICAgIDxMb2dvIC8+XG4gICAgICAgICAgICA8L3NlY3Rpb24+XG4gICAgICAgICAgICA8c2VjdGlvbiBjbGFzcz1cIm0tc2VjdGlvbiBwYWdlcy1zZWN0aW9uXCI+XG4gICAgICAgICAgICAgICAgPFBhZ2VzIHsuLi5wcm9wc30gLz5cbiAgICAgICAgICAgIDwvc2VjdGlvbj5cbiAgICAgICAgICAgIDxzZWN0aW9uIGNsYXNzPVwibS1zZWN0aW9uXCI+XG4gICAgICAgICAgICAgICAgPERvbmF0ZUdyb3VwIC8+XG4gICAgICAgICAgICA8L3NlY3Rpb24+XG4gICAgICAgICAgICA8QXBwVmVyc2lvbiAvPlxuICAgICAgICAgICAgPE92ZXJsYXkgLz5cbiAgICAgICAgPC9ib2R5PlxuICAgICk7XG59XG4iLCJpbXBvcnQge219IGZyb20gJ21hbGV2aWMnO1xuaW1wb3J0IHtNdWx0aVN3aXRjaH0gZnJvbSAnLi4vLi4vLi4vY29udHJvbHMnO1xuaW1wb3J0IFRoZW1lRW5naW5lcyBmcm9tICcuLi8uLi8uLi8uLi9nZW5lcmF0b3JzL3RoZW1lLWVuZ2luZXMnO1xuaW1wb3J0IHtnZXRMb2NhbE1lc3NhZ2V9IGZyb20gJy4uLy4uLy4uLy4uL3V0aWxzL2xvY2FsZXMnO1xuaW1wb3J0IHtpc0ZpcmVmb3h9IGZyb20gJy4uLy4uLy4uLy4uL3V0aWxzL3BsYXRmb3JtJztcblxuY29uc3QgZW5naW5lTmFtZXMgPSBbXG4gICAgW1RoZW1lRW5naW5lcy5jc3NGaWx0ZXIsIGdldExvY2FsTWVzc2FnZSgnZW5naW5lX2ZpbHRlcicpXSxcbiAgICBbVGhlbWVFbmdpbmVzLnN2Z0ZpbHRlciwgZ2V0TG9jYWxNZXNzYWdlKCdlbmdpbmVfZmlsdGVyX3BsdXMnKV0sXG4gICAgW1RoZW1lRW5naW5lcy5zdGF0aWNUaGVtZSwgZ2V0TG9jYWxNZXNzYWdlKCdlbmdpbmVfc3RhdGljJyldLFxuICAgIFtUaGVtZUVuZ2luZXMuZHluYW1pY1RoZW1lLCBnZXRMb2NhbE1lc3NhZ2UoJ2VuZ2luZV9keW5hbWljJyldLFxuXTtcblxuaW50ZXJmYWNlIEVuZ2luZVN3aXRjaFByb3BzIHtcbiAgICBlbmdpbmU6IHN0cmluZztcbiAgICBvbkNoYW5nZTogKGVuZ2luZTogc3RyaW5nKSA9PiB2b2lkO1xufVxuXG5mdW5jdGlvbiBvcGVuQ1NTRWRpdG9yKCkge1xuICAgIGNocm9tZS53aW5kb3dzLmNyZWF0ZSh7XG4gICAgICAgIHR5cGU6ICdwYW5lbCcsXG4gICAgICAgIHVybDogaXNGaXJlZm94KCkgPyAnLi4vc3R5bGVzaGVldC1lZGl0b3IvaW5kZXguaHRtbCcgOiAndWkvc3R5bGVzaGVldC1lZGl0b3IvaW5kZXguaHRtbCcsXG4gICAgICAgIHdpZHRoOiA2MDAsXG4gICAgICAgIGhlaWdodDogNjAwLFxuICAgIH0pO1xufVxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBFbmdpbmVTd2l0Y2goe2VuZ2luZSwgb25DaGFuZ2V9OiBFbmdpbmVTd2l0Y2hQcm9wcykge1xuICAgIHJldHVybiAoXG4gICAgICAgIDxkaXYgY2xhc3M9XCJlbmdpbmUtc3dpdGNoXCI+XG4gICAgICAgICAgICA8TXVsdGlTd2l0Y2hcbiAgICAgICAgICAgICAgICB2YWx1ZT17ZW5naW5lTmFtZXMuZmluZCgoW2NvZGVdKSA9PiBjb2RlID09PSBlbmdpbmUpWzFdfVxuICAgICAgICAgICAgICAgIG9wdGlvbnM9e2VuZ2luZU5hbWVzLm1hcCgoWywgbmFtZV0pID0+IG5hbWUpfVxuICAgICAgICAgICAgICAgIG9uQ2hhbmdlPXsodmFsdWUpID0+IG9uQ2hhbmdlKGVuZ2luZU5hbWVzLmZpbmQoKFssIG5hbWVdKSA9PiBuYW1lID09PSB2YWx1ZSlbMF0pfVxuICAgICAgICAgICAgLz5cbiAgICAgICAgICAgIDxzcGFuXG4gICAgICAgICAgICAgICAgY2xhc3M9e3tcbiAgICAgICAgICAgICAgICAgICAgJ2VuZ2luZS1zd2l0Y2hfX2Nzcy1lZGl0LWJ1dHRvbic6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICdlbmdpbmUtc3dpdGNoX19jc3MtZWRpdC1idXR0b25fYWN0aXZlJzogZW5naW5lID09PSBUaGVtZUVuZ2luZXMuc3RhdGljVGhlbWUsXG4gICAgICAgICAgICAgICAgfX1cbiAgICAgICAgICAgICAgICBvbmNsaWNrPXtvcGVuQ1NTRWRpdG9yfVxuICAgICAgICAgICAgPjwvc3Bhbj5cbiAgICAgICAgICAgIDxsYWJlbCBjbGFzcz1cImVuZ2luZS1zd2l0Y2hfX2Rlc2NyaXB0aW9uXCI+e2dldExvY2FsTWVzc2FnZSgndGhlbWVfZ2VuZXJhdGlvbl9tb2RlJyl9PC9sYWJlbD5cbiAgICAgICAgPC9kaXY+XG4gICAgKTtcbn1cbiIsImltcG9ydCB7bX0gZnJvbSAnbWFsZXZpYyc7XG5pbXBvcnQge0NoZWNrQm94LCBVcERvd24sIFNlbGVjdH0gZnJvbSAnLi4vLi4vLi4vY29udHJvbHMnO1xuaW1wb3J0IHtnZXRMb2NhbE1lc3NhZ2V9IGZyb20gJy4uLy4uLy4uLy4uL3V0aWxzL2xvY2FsZXMnO1xuaW1wb3J0IHtGaWx0ZXJDb25maWd9IGZyb20gJy4uLy4uLy4uLy4uL2RlZmluaXRpb25zJztcblxuaW50ZXJmYWNlIEZvbnRTZXR0aW5nc1Byb3BzIHtcbiAgICBjb25maWc6IEZpbHRlckNvbmZpZztcbiAgICBmb250czogc3RyaW5nW107XG4gICAgb25DaGFuZ2U6IChjb25maWc6IFBhcnRpYWw8RmlsdGVyQ29uZmlnPikgPT4gdm9pZDtcbn1cblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gRm9udFNldHRpbmdzKHtjb25maWcsIGZvbnRzLCBvbkNoYW5nZX06IEZvbnRTZXR0aW5nc1Byb3BzKSB7XG4gICAgcmV0dXJuIChcbiAgICAgICAgPHNlY3Rpb24gY2xhc3M9XCJmb250LXNldHRpbmdzXCI+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiZm9udC1zZXR0aW5nc19fZm9udC1zZWxlY3QtY29udGFpbmVyXCI+XG4gICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImZvbnQtc2V0dGluZ3NfX2ZvbnQtc2VsZWN0LWNvbnRhaW5lcl9fbGluZVwiPlxuICAgICAgICAgICAgICAgICAgICA8Q2hlY2tCb3hcbiAgICAgICAgICAgICAgICAgICAgICAgIGNoZWNrZWQ9e2NvbmZpZy51c2VGb250fVxuICAgICAgICAgICAgICAgICAgICAgICAgb25jaGFuZ2U9eyhlKSA9PiBvbkNoYW5nZSh7dXNlRm9udDogZS50YXJnZXQuY2hlY2tlZH0pfVxuICAgICAgICAgICAgICAgICAgICAvPlxuICAgICAgICAgICAgICAgICAgICA8U2VsZWN0XG4gICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZT17Y29uZmlnLmZvbnRGYW1pbHl9XG4gICAgICAgICAgICAgICAgICAgICAgICBvbkNoYW5nZT17KHZhbHVlKSA9PiBvbkNoYW5nZSh7Zm9udEZhbWlseTogdmFsdWV9KX1cbiAgICAgICAgICAgICAgICAgICAgICAgIG9wdGlvbnM9e2ZvbnRzLnJlZHVjZSgobWFwLCBmb250KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbWFwW2ZvbnRdID0gKFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPXt7J2ZvbnQtZmFtaWx5JzogZm9udH19PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAge2ZvbnR9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG1hcDtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0sIHt9IGFzIHtbZm9udDogc3RyaW5nXTogTWFsZXZpYy5TcGVjfSl9XG4gICAgICAgICAgICAgICAgICAgIC8+XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgPGxhYmVsIGNsYXNzPVwiZm9udC1zZXR0aW5nc19fZm9udC1zZWxlY3QtY29udGFpbmVyX19sYWJlbFwiPlxuICAgICAgICAgICAgICAgICAgICB7Z2V0TG9jYWxNZXNzYWdlKCdzZWxlY3RfZm9udCcpfVxuICAgICAgICAgICAgICAgIDwvbGFiZWw+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDxVcERvd25cbiAgICAgICAgICAgICAgICB2YWx1ZT17Y29uZmlnLnRleHRTdHJva2V9XG4gICAgICAgICAgICAgICAgbWluPXswfVxuICAgICAgICAgICAgICAgIG1heD17MX1cbiAgICAgICAgICAgICAgICBzdGVwPXswLjF9XG4gICAgICAgICAgICAgICAgZGVmYXVsdD17MH1cbiAgICAgICAgICAgICAgICBuYW1lPXtnZXRMb2NhbE1lc3NhZ2UoJ3RleHRfc3Ryb2tlJyl9XG4gICAgICAgICAgICAgICAgb25DaGFuZ2U9eyh2YWx1ZSkgPT4gb25DaGFuZ2Uoe3RleHRTdHJva2U6IHZhbHVlfSl9XG4gICAgICAgICAgICAvPlxuICAgICAgICA8L3NlY3Rpb24+XG4gICAgKTtcbn1cbiIsImltcG9ydCB7bX0gZnJvbSAnbWFsZXZpYyc7XG5cbmV4cG9ydCBmdW5jdGlvbiBjb21waWxlTWFya2Rvd24obWFya2Rvd246IHN0cmluZykge1xuICAgIHJldHVybiBtYXJrZG93bi5zcGxpdCgnKionKVxuICAgICAgICAubWFwKCh0ZXh0LCBpKSA9PiBpICUgMiA/ICg8c3Ryb25nPnt0ZXh0fTwvc3Ryb25nPikgOiB0ZXh0KTtcbn1cbiIsImltcG9ydCB7bX0gZnJvbSAnbWFsZXZpYyc7XG5pbXBvcnQgQ3VzdG9tU2V0dGluZ3NUb2dnbGUgZnJvbSAnLi4vY3VzdG9tLXNldHRpbmdzLXRvZ2dsZSc7XG5pbXBvcnQgRW5naW5lU3dpdGNoIGZyb20gJy4uL2VuZ2luZS1zd2l0Y2gnO1xuaW1wb3J0IEZvbnRTZXR0aW5ncyBmcm9tICcuLi9mb250LXNldHRpbmdzJztcbmltcG9ydCB7VG9nZ2xlfSBmcm9tICcuLi8uLi8uLi9jb250cm9scyc7XG5pbXBvcnQge2lzRmlyZWZveH0gZnJvbSAnLi4vLi4vLi4vLi4vdXRpbHMvcGxhdGZvcm0nO1xuaW1wb3J0IHtpc1VSTEluTGlzdH0gZnJvbSAnLi4vLi4vLi4vLi4vdXRpbHMvdXJsJztcbmltcG9ydCB7Y29tcGlsZU1hcmtkb3dufSBmcm9tICcuLi8uLi91dGlscy9tYXJrZG93bic7XG5pbXBvcnQge2dldExvY2FsTWVzc2FnZX0gZnJvbSAnLi4vLi4vLi4vLi4vdXRpbHMvbG9jYWxlcyc7XG5pbXBvcnQge0V4dFdyYXBwZXIsIEZpbHRlckNvbmZpZywgVGFiSW5mb30gZnJvbSAnLi4vLi4vLi4vLi4vZGVmaW5pdGlvbnMnO1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBNb3JlU2V0dGluZ3Moe2RhdGEsIGFjdGlvbnMsIHRhYn06IEV4dFdyYXBwZXIgJiB7dGFiOiBUYWJJbmZvfSkge1xuXG4gICAgY29uc3QgY3VzdG9tID0gZGF0YS5zZXR0aW5ncy5jdXN0b21UaGVtZXMuZmluZCgoe3VybH0pID0+IGlzVVJMSW5MaXN0KHRhYi51cmwsIHVybCkpO1xuICAgIGNvbnN0IGZpbHRlckNvbmZpZyA9IGN1c3RvbSA/IGN1c3RvbS50aGVtZSA6IGRhdGEuc2V0dGluZ3MudGhlbWU7XG5cbiAgICBmdW5jdGlvbiBzZXRDb25maWcoY29uZmlnOiBQYXJ0aWFsPEZpbHRlckNvbmZpZz4pIHtcbiAgICAgICAgaWYgKGN1c3RvbSkge1xuICAgICAgICAgICAgY3VzdG9tLnRoZW1lID0gey4uLmN1c3RvbS50aGVtZSwgLi4uY29uZmlnfTtcbiAgICAgICAgICAgIGFjdGlvbnMuY2hhbmdlU2V0dGluZ3Moe2N1c3RvbVRoZW1lczogZGF0YS5zZXR0aW5ncy5jdXN0b21UaGVtZXN9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGFjdGlvbnMuc2V0VGhlbWUoY29uZmlnKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiAoXG4gICAgICAgIDxzZWN0aW9uIGNsYXNzPVwibW9yZS1zZXR0aW5nc1wiPlxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cIm1vcmUtc2V0dGluZ3NfX3NlY3Rpb25cIj5cbiAgICAgICAgICAgICAgICA8Rm9udFNldHRpbmdzIGNvbmZpZz17ZmlsdGVyQ29uZmlnfSBmb250cz17ZGF0YS5mb250c30gb25DaGFuZ2U9e3NldENvbmZpZ30gLz5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cIm1vcmUtc2V0dGluZ3NfX3NlY3Rpb25cIj5cbiAgICAgICAgICAgICAgICB7aXNGaXJlZm94KCkgPyBudWxsIDogPHAgY2xhc3M9XCJtb3JlLXNldHRpbmdzX19kZXNjcmlwdGlvblwiPlxuICAgICAgICAgICAgICAgICAgICB7Y29tcGlsZU1hcmtkb3duKGdldExvY2FsTWVzc2FnZSgndHJ5X2V4cGVyaW1lbnRhbF90aGVtZV9lbmdpbmVzJykpfVxuICAgICAgICAgICAgICAgIDwvcD59XG4gICAgICAgICAgICAgICAgPEVuZ2luZVN3aXRjaCBlbmdpbmU9e2ZpbHRlckNvbmZpZy5lbmdpbmV9IG9uQ2hhbmdlPXsoZW5naW5lKSA9PiBzZXRDb25maWcoe2VuZ2luZX0pfSAvPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwibW9yZS1zZXR0aW5nc19fc2VjdGlvblwiPlxuICAgICAgICAgICAgICAgIDxDdXN0b21TZXR0aW5nc1RvZ2dsZSBkYXRhPXtkYXRhfSB0YWI9e3RhYn0gYWN0aW9ucz17YWN0aW9uc30gLz5cbiAgICAgICAgICAgICAgICB7dGFiLmlzUHJvdGVjdGVkID8gKFxuICAgICAgICAgICAgICAgICAgICA8cCBjbGFzcz1cIm1vcmUtc2V0dGluZ3NfX2Rlc2NyaXB0aW9uIG1vcmUtc2V0dGluZ3NfX2Rlc2NyaXB0aW9uLS13YXJuaW5nXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICB7Z2V0TG9jYWxNZXNzYWdlKCdwYWdlX3Byb3RlY3RlZCcpLnJlcGxhY2UoJ1xcbicsICcgJyl9XG4gICAgICAgICAgICAgICAgICAgIDwvcD5cbiAgICAgICAgICAgICAgICApIDogdGFiLmlzSW5EYXJrTGlzdCA/IChcbiAgICAgICAgICAgICAgICAgICAgPHAgY2xhc3M9XCJtb3JlLXNldHRpbmdzX19kZXNjcmlwdGlvbiBtb3JlLXNldHRpbmdzX19kZXNjcmlwdGlvbi0td2FybmluZ1wiPlxuICAgICAgICAgICAgICAgICAgICAgICAge2dldExvY2FsTWVzc2FnZSgncGFnZV9pbl9kYXJrX2xpc3QnKS5yZXBsYWNlKCdcXG4nLCAnICcpfVxuICAgICAgICAgICAgICAgICAgICA8L3A+XG4gICAgICAgICAgICAgICAgKSA6IChcbiAgICAgICAgICAgICAgICAgICAgPHAgY2xhc3M9XCJtb3JlLXNldHRpbmdzX19kZXNjcmlwdGlvblwiPlxuICAgICAgICAgICAgICAgICAgICAgICAge2dldExvY2FsTWVzc2FnZSgnb25seV9mb3JfZGVzY3JpcHRpb24nKX1cbiAgICAgICAgICAgICAgICAgICAgPC9wPlxuICAgICAgICAgICAgICAgICl9XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIHtpc0ZpcmVmb3goKSA/IChcbiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwibW9yZS1zZXR0aW5nc19fc2VjdGlvblwiPlxuICAgICAgICAgICAgICAgICAgICA8VG9nZ2xlXG4gICAgICAgICAgICAgICAgICAgICAgICBjaGVja2VkPXtkYXRhLnNldHRpbmdzLmNoYW5nZUJyb3dzZXJUaGVtZX1cbiAgICAgICAgICAgICAgICAgICAgICAgIGxhYmVsT249e2dldExvY2FsTWVzc2FnZSgnY3VzdG9tX2Jyb3dzZXJfdGhlbWVfb24nKX1cbiAgICAgICAgICAgICAgICAgICAgICAgIGxhYmVsT2ZmPXtnZXRMb2NhbE1lc3NhZ2UoJ2N1c3RvbV9icm93c2VyX3RoZW1lX29mZicpfVxuICAgICAgICAgICAgICAgICAgICAgICAgb25DaGFuZ2U9eyhjaGVja2VkKSA9PiBhY3Rpb25zLmNoYW5nZVNldHRpbmdzKHtjaGFuZ2VCcm93c2VyVGhlbWU6IGNoZWNrZWR9KX1cbiAgICAgICAgICAgICAgICAgICAgLz5cbiAgICAgICAgICAgICAgICAgICAgPHAgY2xhc3M9XCJtb3JlLXNldHRpbmdzX19kZXNjcmlwdGlvblwiPlxuICAgICAgICAgICAgICAgICAgICAgICAge2dldExvY2FsTWVzc2FnZSgnY2hhbmdlX2Jyb3dzZXJfdGhlbWUnKX1cbiAgICAgICAgICAgICAgICAgICAgPC9wPlxuICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgKSA6IG51bGx9XG4gICAgICAgIDwvc2VjdGlvbj5cbiAgICApO1xufVxuXG4iLCJpbXBvcnQge219IGZyb20gJ21hbGV2aWMnO1xuaW1wb3J0IHtCdXR0b259IGZyb20gJy4uLy4uLy4uL2NvbnRyb2xzJztcbmltcG9ydCB7QkxPR19VUkx9IGZyb20gJy4uLy4uLy4uLy4uL3V0aWxzL2xpbmtzJztcbmltcG9ydCB7Z2V0TG9jYWxNZXNzYWdlLCBnZXRVSUxhbmd1YWdlfSBmcm9tICcuLi8uLi8uLi8uLi91dGlscy9sb2NhbGVzJztcbmltcG9ydCB7TmV3c30gZnJvbSAnLi4vLi4vLi4vLi4vZGVmaW5pdGlvbnMnO1xuXG5pbnRlcmZhY2UgTmV3c1Byb3BzIHtcbiAgICBuZXdzOiBOZXdzW107XG4gICAgZXhwYW5kZWQ6IGJvb2xlYW47XG4gICAgb25OZXdzT3BlbjogKC4uLm5ld3M6IE5ld3NbXSkgPT4gdm9pZDtcbiAgICBvbkNsb3NlOiAoKSA9PiB2b2lkO1xufVxuXG5cbmNvbnN0IE5FV1NfQ09VTlQgPSAyO1xuXG5leHBvcnQgZnVuY3Rpb24gTmV3cyh7bmV3cywgZXhwYW5kZWQsIG9uTmV3c09wZW4sIG9uQ2xvc2V9OiBOZXdzUHJvcHMpIHtcbiAgICByZXR1cm4gKFxuICAgICAgICA8ZGl2IGNsYXNzPXt7J25ld3MnOiB0cnVlLCAnbmV3cy0tZXhwYW5kZWQnOiBleHBhbmRlZH19PlxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cIm5ld3NfX2hlYWRlclwiPlxuICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwibmV3c19faGVhZGVyX190ZXh0XCI+e2dldExvY2FsTWVzc2FnZSgnbmV3cycpfTwvc3Bhbj5cbiAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz1cIm5ld3NfX2Nsb3NlXCIgcm9sZT1cImJ1dHRvblwiIG9uY2xpY2s9e29uQ2xvc2V9PuKclTwvc3Bhbj5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cIm5ld3NfX2xpc3RcIj5cbiAgICAgICAgICAgICAgICB7bmV3cy5zbGljZSgwLCBORVdTX0NPVU5UKS5tYXAoKGV2ZW50KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGRhdGUgPSBuZXcgRGF0ZShldmVudC5kYXRlKTtcbiAgICAgICAgICAgICAgICAgICAgbGV0IGZvcm1hdHRlZERhdGU6IHN0cmluZztcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIFdvcmthcm91bmQgZm9yIGh0dHBzOi8vYnVncy5jaHJvbWl1bS5vcmcvcC9jaHJvbWl1bS9pc3N1ZXMvZGV0YWlsP2lkPTgxMTQwM1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbG9jYWxlID0gZ2V0VUlMYW5ndWFnZSgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9ybWF0dGVkRGF0ZSA9IGRhdGUudG9Mb2NhbGVEYXRlU3RyaW5nKGxvY2FsZSwge21vbnRoOiAnc2hvcnQnLCBkYXk6ICdudW1lcmljJ30pO1xuICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvcm1hdHRlZERhdGUgPSBkYXRlLnRvSVNPU3RyaW5nKCkuc3Vic3RyaW5nKDAsIDEwKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNsYXNzPXt7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICduZXdzX19ldmVudCc6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICduZXdzX19ldmVudC0tdW5yZWFkJzogIWV2ZW50LnJlYWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICduZXdzX19ldmVudC0taW1wb3J0YW50JzogZXZlbnQuaW1wb3J0YW50LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH19XG4gICAgICAgICAgICAgICAgICAgICAgICA+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGEgY2xhc3M9XCJuZXdzX19ldmVudF9fbGlua1wiIG9uY2xpY2s9eygpID0+IG9uTmV3c09wZW4oZXZlbnQpfSBocmVmPXtldmVudC51cmx9IHRhcmdldD1cIl9ibGFua1wiIHJlbD1cIm5vb3BlbmVyIG5vcmVmZXJyZXJcIj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJuZXdzX19ldmVudF9fZGF0ZVwiPlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAge2Zvcm1hdHRlZERhdGV9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvc3Bhbj5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAge2V2ZW50LmhlYWRsaW5lfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvYT5cbiAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIH0pfVxuICAgICAgICAgICAgICAgIHsobmV3cy5sZW5ndGggPD0gTkVXU19DT1VOVFxuICAgICAgICAgICAgICAgICAgICA/IG51bGxcbiAgICAgICAgICAgICAgICAgICAgOiA8YVxuICAgICAgICAgICAgICAgICAgICAgICAgY2xhc3M9e3tcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAnbmV3c19fcmVhZC1tb3JlJzogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAnbmV3c19fcmVhZC1tb3JlLS11bnJlYWQnOiBuZXdzLnNsaWNlKE5FV1NfQ09VTlQpLmZpbmQoKHtyZWFkfSkgPT4gIXJlYWQpLFxuICAgICAgICAgICAgICAgICAgICAgICAgfX1cbiAgICAgICAgICAgICAgICAgICAgICAgIGhyZWY9e0JMT0dfVVJMfVxuICAgICAgICAgICAgICAgICAgICAgICAgdGFyZ2V0PVwiX2JsYW5rXCJcbiAgICAgICAgICAgICAgICAgICAgICAgIG9uY2xpY2s9eygpID0+IG9uTmV3c09wZW4oLi4ubmV3cyl9XG4gICAgICAgICAgICAgICAgICAgICAgICByZWw9XCJub29wZW5lciBub3JlZmVycmVyXCJcbiAgICAgICAgICAgICAgICAgICAgPntnZXRMb2NhbE1lc3NhZ2UoJ3JlYWRfbW9yZScpfTwvYT5cbiAgICAgICAgICAgICAgICApfVxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgIDwvZGl2PlxuICAgICk7XG59XG5cbmludGVyZmFjZSBOZXdzQnV0dG9uUHJvcHMge1xuICAgIGFjdGl2ZTogYm9vbGVhbjtcbiAgICBjb3VudDogbnVtYmVyO1xuICAgIG9uQ2xpY2s6ICgpID0+IHZvaWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBOZXdzQnV0dG9uKHthY3RpdmUsIGNvdW50LCBvbkNsaWNrfTogTmV3c0J1dHRvblByb3BzKSB7XG4gICAgcmV0dXJuIChcbiAgICAgICAgPEJ1dHRvblxuICAgICAgICAgICAgY2xhc3M9e3snbmV3cy1idXR0b24nOiB0cnVlLCAnbmV3cy1idXR0b24tLWFjdGl2ZSc6IGFjdGl2ZX19XG4gICAgICAgICAgICBocmVmPVwiI25ld3NcIlxuICAgICAgICAgICAgZGF0YS1jb3VudD17Y291bnQgPiAwICYmICFhY3RpdmUgPyBjb3VudCA6IG51bGx9XG4gICAgICAgICAgICBvbmNsaWNrPXsoZSkgPT4ge1xuICAgICAgICAgICAgICAgIChlLmN1cnJlbnRUYXJnZXQgYXMgSFRNTEVsZW1lbnQpLmJsdXIoKTtcbiAgICAgICAgICAgICAgICBvbkNsaWNrKCk7XG4gICAgICAgICAgICB9fVxuICAgICAgICA+XG4gICAgICAgICAgICB7Z2V0TG9jYWxNZXNzYWdlKCduZXdzJyl9XG4gICAgICAgIDwvQnV0dG9uPlxuICAgICk7XG59XG4iLCJpbXBvcnQge219IGZyb20gJ21hbGV2aWMnO1xuaW1wb3J0IHtUb2dnbGUsIFRleHRMaXN0LCBTaG9ydGN1dH0gZnJvbSAnLi4vLi4vLi4vY29udHJvbHMnO1xuaW1wb3J0IHtnZXRMb2NhbE1lc3NhZ2V9IGZyb20gJy4uLy4uLy4uLy4uL3V0aWxzL2xvY2FsZXMnO1xuaW1wb3J0IHtFeHRXcmFwcGVyfSBmcm9tICcuLi8uLi8uLi8uLi9kZWZpbml0aW9ucyc7XG5cbmludGVyZmFjZSBTaXRlTGlzdFNldHRpbmdzUHJvcHMgZXh0ZW5kcyBFeHRXcmFwcGVyIHtcbiAgICBpc0ZvY3VzZWQ6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIFNpdGVMaXN0U2V0dGluZ3Moe2RhdGEsIGFjdGlvbnMsIGlzRm9jdXNlZH06IFNpdGVMaXN0U2V0dGluZ3NQcm9wcykge1xuXG4gICAgZnVuY3Rpb24gaXNTaXRlVXJsVmFsaWQodmFsdWU6IHN0cmluZykge1xuICAgICAgICByZXR1cm4gL14oW15cXC5cXHNdKz9cXC4/KSskLy50ZXN0KHZhbHVlKTtcbiAgICB9XG5cbiAgICByZXR1cm4gKFxuICAgICAgICA8c2VjdGlvbiBjbGFzcz1cInNpdGUtbGlzdC1zZXR0aW5nc1wiPlxuICAgICAgICAgICAgPFRvZ2dsZVxuICAgICAgICAgICAgICAgIGNsYXNzPVwic2l0ZS1saXN0LXNldHRpbmdzX190b2dnbGVcIlxuICAgICAgICAgICAgICAgIGNoZWNrZWQ9e2RhdGEuc2V0dGluZ3MuYXBwbHlUb0xpc3RlZE9ubHl9XG4gICAgICAgICAgICAgICAgbGFiZWxPbj17Z2V0TG9jYWxNZXNzYWdlKCdpbnZlcnRfbGlzdGVkX29ubHknKX1cbiAgICAgICAgICAgICAgICBsYWJlbE9mZj17Z2V0TG9jYWxNZXNzYWdlKCdub3RfaW52ZXJ0X2xpc3RlZCcpfVxuICAgICAgICAgICAgICAgIG9uQ2hhbmdlPXsodmFsdWUpID0+IGFjdGlvbnMuY2hhbmdlU2V0dGluZ3Moe2FwcGx5VG9MaXN0ZWRPbmx5OiB2YWx1ZX0pfVxuICAgICAgICAgICAgLz5cbiAgICAgICAgICAgIDxUZXh0TGlzdFxuICAgICAgICAgICAgICAgIGNsYXNzPVwic2l0ZS1saXN0LXNldHRpbmdzX190ZXh0LWxpc3RcIlxuICAgICAgICAgICAgICAgIHBsYWNlaG9sZGVyPVwiZ29vZ2xlLmNvbS9tYXBzXCJcbiAgICAgICAgICAgICAgICB2YWx1ZXM9e2RhdGEuc2V0dGluZ3Muc2l0ZUxpc3R9XG4gICAgICAgICAgICAgICAgaXNGb2N1c2VkPXtpc0ZvY3VzZWR9XG4gICAgICAgICAgICAgICAgb25DaGFuZ2U9eyh2YWx1ZXMpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHZhbHVlcy5ldmVyeShpc1NpdGVVcmxWYWxpZCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFjdGlvbnMuY2hhbmdlU2V0dGluZ3Moe3NpdGVMaXN0OiB2YWx1ZXN9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH19XG4gICAgICAgICAgICAvPlxuICAgICAgICAgICAgPFNob3J0Y3V0XG4gICAgICAgICAgICAgICAgY2xhc3M9XCJzaXRlLWxpc3Qtc2V0dGluZ3NfX3Nob3J0Y3V0XCJcbiAgICAgICAgICAgICAgICBjb21tYW5kTmFtZT1cImFkZFNpdGVcIlxuICAgICAgICAgICAgICAgIHNob3J0Y3V0cz17ZGF0YS5zaG9ydGN1dHN9XG4gICAgICAgICAgICAgICAgdGV4dFRlbXBsYXRlPXsoaG90a2V5KSA9PiAoaG90a2V5XG4gICAgICAgICAgICAgICAgICAgID8gYCR7Z2V0TG9jYWxNZXNzYWdlKCdhZGRfc2l0ZV90b19saXN0Jyl9OiAke2hvdGtleX1gXG4gICAgICAgICAgICAgICAgICAgIDogZ2V0TG9jYWxNZXNzYWdlKCdzZXR1cF9hZGRfc2l0ZV9ob3RrZXknKVxuICAgICAgICAgICAgICAgICl9XG4gICAgICAgICAgICAgICAgb25TZXRTaG9ydGN1dD17KHNob3J0Y3V0KSA9PiBhY3Rpb25zLnNldFNob3J0Y3V0KCdhZGRTaXRlJywgc2hvcnRjdXQpfVxuICAgICAgICAgICAgLz5cbiAgICAgICAgPC9zZWN0aW9uPlxuICAgICk7XG59XG4iLCJpbXBvcnQge219IGZyb20gJ21hbGV2aWMnO1xuaW1wb3J0IHtnZXRDb250ZXh0fSBmcm9tICdtYWxldmljL2RvbSc7XG5pbXBvcnQge3dpdGhGb3Jtc30gZnJvbSAnbWFsZXZpYy9mb3Jtcyc7XG5pbXBvcnQge3dpdGhTdGF0ZSwgdXNlU3RhdGV9IGZyb20gJ21hbGV2aWMvc3RhdGUnO1xuaW1wb3J0IHtUYWJQYW5lbCwgQnV0dG9ufSBmcm9tICcuLi8uLi9jb250cm9scyc7XG5pbXBvcnQgRmlsdGVyU2V0dGluZ3MgZnJvbSAnLi9maWx0ZXItc2V0dGluZ3MnO1xuaW1wb3J0IHtIZWFkZXIsIE1vcmVUb2dnbGVTZXR0aW5nc30gZnJvbSAnLi9oZWFkZXInO1xuaW1wb3J0IExvYWRlciBmcm9tICcuL2xvYWRlcic7XG5pbXBvcnQgTmV3Qm9keSBmcm9tICcuLi9ib2R5JztcbmltcG9ydCBNb3JlU2V0dGluZ3MgZnJvbSAnLi9tb3JlLXNldHRpbmdzJztcbmltcG9ydCB7TmV3cywgTmV3c0J1dHRvbn0gZnJvbSAnLi9uZXdzJztcbmltcG9ydCBTaXRlTGlzdFNldHRpbmdzIGZyb20gJy4vc2l0ZS1saXN0LXNldHRpbmdzJztcbmltcG9ydCBUaGVtZUVuZ2luZXMgZnJvbSAnLi4vLi4vLi4vZ2VuZXJhdG9ycy90aGVtZS1lbmdpbmVzJztcbmltcG9ydCB7aXNGaXJlZm94LCBpc01vYmlsZX0gZnJvbSAnLi4vLi4vLi4vdXRpbHMvcGxhdGZvcm0nO1xuaW1wb3J0IHtnZXREdXJhdGlvbn0gZnJvbSAnLi4vLi4vLi4vdXRpbHMvdGltZSc7XG5pbXBvcnQge0RPTkFURV9VUkwsIEdJVEhVQl9VUkwsIFBSSVZBQ1lfVVJMLCBUV0lUVEVSX1VSTCwgZ2V0SGVscFVSTH0gZnJvbSAnLi4vLi4vLi4vdXRpbHMvbGlua3MnO1xuaW1wb3J0IHtnZXRMb2NhbE1lc3NhZ2V9IGZyb20gJy4uLy4uLy4uL3V0aWxzL2xvY2FsZXMnO1xuaW1wb3J0IHtjb21wb3NlfSBmcm9tICcuLi8uLi91dGlscyc7XG5pbXBvcnQge0V4dGVuc2lvbkRhdGEsIEV4dGVuc2lvbkFjdGlvbnMsIFRhYkluZm8sIE5ld3MgYXMgTmV3c09iamVjdH0gZnJvbSAnLi4vLi4vLi4vZGVmaW5pdGlvbnMnO1xuXG5pbnRlcmZhY2UgQm9keVByb3BzIHtcbiAgICBkYXRhOiBFeHRlbnNpb25EYXRhO1xuICAgIHRhYjogVGFiSW5mbztcbiAgICBhY3Rpb25zOiBFeHRlbnNpb25BY3Rpb25zO1xufVxuXG5pbnRlcmZhY2UgQm9keVN0YXRlIHtcbiAgICBhY3RpdmVUYWI6IHN0cmluZztcbiAgICBuZXdzT3BlbjogYm9vbGVhbjtcbiAgICBkaWROZXdzU2xpZGVJbjogYm9vbGVhbjtcbiAgICBtb3JlVG9nZ2xlU2V0dGluZ3NPcGVuOiBib29sZWFuO1xufVxuXG5mdW5jdGlvbiBvcGVuRGV2VG9vbHMoKSB7XG4gICAgY2hyb21lLndpbmRvd3MuY3JlYXRlKHtcbiAgICAgICAgdHlwZTogJ3BhbmVsJyxcbiAgICAgICAgdXJsOiBpc0ZpcmVmb3goKSA/ICcuLi9kZXZ0b29scy9pbmRleC5odG1sJyA6ICd1aS9kZXZ0b29scy9pbmRleC5odG1sJyxcbiAgICAgICAgd2lkdGg6IDYwMCxcbiAgICAgICAgaGVpZ2h0OiA2MDAsXG4gICAgfSk7XG59XG5cbmZ1bmN0aW9uIEJvZHkocHJvcHM6IEJvZHlQcm9wcykge1xuICAgIGNvbnN0IGNvbnRleHQgPSBnZXRDb250ZXh0KCk7XG4gICAgY29uc3Qge3N0YXRlLCBzZXRTdGF0ZX0gPSB1c2VTdGF0ZTxCb2R5U3RhdGU+KHtcbiAgICAgICAgYWN0aXZlVGFiOiAnRmlsdGVyJyxcbiAgICAgICAgbmV3c09wZW46IGZhbHNlLFxuICAgICAgICBkaWROZXdzU2xpZGVJbjogZmFsc2UsXG4gICAgICAgIG1vcmVUb2dnbGVTZXR0aW5nc09wZW46IGZhbHNlLFxuICAgIH0pO1xuXG4gICAgaWYgKCFwcm9wcy5kYXRhLmlzUmVhZHkpIHtcbiAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgIDxib2R5PlxuICAgICAgICAgICAgICAgIDxMb2FkZXIgY29tcGxldGU9e2ZhbHNlfSAvPlxuICAgICAgICAgICAgPC9ib2R5PlxuICAgICAgICApO1xuICAgIH1cblxuICAgIGlmIChpc01vYmlsZSgpIHx8IHByb3BzLmRhdGEuc2V0dGluZ3MucHJldmlld05ld0Rlc2lnbikge1xuICAgICAgICByZXR1cm4gPE5ld0JvZHkgey4uLnByb3BzfSAvPjtcbiAgICB9XG5cbiAgICBjb25zdCB1bnJlYWROZXdzID0gcHJvcHMuZGF0YS5uZXdzLmZpbHRlcigoe3JlYWR9KSA9PiAhcmVhZCk7XG4gICAgY29uc3QgbGF0ZXN0TmV3cyA9IHByb3BzLmRhdGEubmV3cy5sZW5ndGggPiAwID8gcHJvcHMuZGF0YS5uZXdzWzBdIDogbnVsbDtcbiAgICBjb25zdCBpc0ZpcnN0TmV3c1VucmVhZCA9IGxhdGVzdE5ld3MgJiYgIWxhdGVzdE5ld3MucmVhZDtcblxuICAgIGNvbnRleHQub25SZW5kZXIoKCkgPT4ge1xuICAgICAgICBpZiAoaXNGaXJzdE5ld3NVbnJlYWQgJiYgIXN0YXRlLm5ld3NPcGVuICYmICFzdGF0ZS5kaWROZXdzU2xpZGVJbikge1xuICAgICAgICAgICAgc2V0VGltZW91dCh0b2dnbGVOZXdzLCA3NTApO1xuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICBmdW5jdGlvbiB0b2dnbGVOZXdzKCkge1xuICAgICAgICBpZiAoc3RhdGUubmV3c09wZW4gJiYgdW5yZWFkTmV3cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBwcm9wcy5hY3Rpb25zLm1hcmtOZXdzQXNSZWFkKHVucmVhZE5ld3MubWFwKCh7aWR9KSA9PiBpZCkpO1xuICAgICAgICB9XG4gICAgICAgIHNldFN0YXRlKHtuZXdzT3BlbjogIXN0YXRlLm5ld3NPcGVuLCBkaWROZXdzU2xpZGVJbjogc3RhdGUuZGlkTmV3c1NsaWRlSW4gfHwgIXN0YXRlLm5ld3NPcGVufSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gb25OZXdzT3BlbiguLi5uZXdzOiBOZXdzT2JqZWN0W10pIHtcbiAgICAgICAgY29uc3QgdW5yZWFkID0gbmV3cy5maWx0ZXIoKHtyZWFkfSkgPT4gIXJlYWQpO1xuICAgICAgICBpZiAodW5yZWFkLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIHByb3BzLmFjdGlvbnMubWFya05ld3NBc1JlYWQodW5yZWFkLm1hcCgoe2lkfSkgPT4gaWQpKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGxldCBkaXNwbGF5ZWROZXdzQ291bnQgPSB1bnJlYWROZXdzLmxlbmd0aDtcbiAgICBpZiAodW5yZWFkTmV3cy5sZW5ndGggPiAwICYmICFwcm9wcy5kYXRhLnNldHRpbmdzLm5vdGlmeU9mTmV3cykge1xuICAgICAgICBjb25zdCBsYXRlc3QgPSBuZXcgRGF0ZSh1bnJlYWROZXdzWzBdLmRhdGUpO1xuICAgICAgICBjb25zdCB0b2RheSA9IG5ldyBEYXRlKCk7XG4gICAgICAgIGNvbnN0IG5ld3NXZXJlTG9uZ1RpbWVBZ28gPSBsYXRlc3QuZ2V0VGltZSgpIDwgdG9kYXkuZ2V0VGltZSgpIC0gZ2V0RHVyYXRpb24oe2RheXM6IDE0fSk7XG4gICAgICAgIGlmIChuZXdzV2VyZUxvbmdUaW1lQWdvKSB7XG4gICAgICAgICAgICBkaXNwbGF5ZWROZXdzQ291bnQgPSAwO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgZ2xvYmFsVGhlbWVFbmdpbmUgPSBwcm9wcy5kYXRhLnNldHRpbmdzLnRoZW1lLmVuZ2luZTtcbiAgICBjb25zdCBkZXZ0b29sc0RhdGEgPSBwcm9wcy5kYXRhLmRldnRvb2xzO1xuICAgIGNvbnN0IGhhc0N1c3RvbUZpeGVzID0gKFxuICAgICAgICAoZ2xvYmFsVGhlbWVFbmdpbmUgPT09IFRoZW1lRW5naW5lcy5keW5hbWljVGhlbWUgJiYgZGV2dG9vbHNEYXRhLmhhc0N1c3RvbUR5bmFtaWNGaXhlcykgfHxcbiAgICAgICAgKFtUaGVtZUVuZ2luZXMuY3NzRmlsdGVyLCBUaGVtZUVuZ2luZXMuc3ZnRmlsdGVyXS5pbmNsdWRlcyhnbG9iYWxUaGVtZUVuZ2luZSkgJiYgZGV2dG9vbHNEYXRhLmhhc0N1c3RvbUZpbHRlckZpeGVzKSB8fFxuICAgICAgICAoZ2xvYmFsVGhlbWVFbmdpbmUgPT09IFRoZW1lRW5naW5lcy5zdGF0aWNUaGVtZSAmJiBkZXZ0b29sc0RhdGEuaGFzQ3VzdG9tU3RhdGljRml4ZXMpXG4gICAgKTtcblxuICAgIGZ1bmN0aW9uIHRvZ2dsZU1vcmVUb2dnbGVTZXR0aW5ncygpIHtcbiAgICAgICAgc2V0U3RhdGUoe21vcmVUb2dnbGVTZXR0aW5nc09wZW46ICFzdGF0ZS5tb3JlVG9nZ2xlU2V0dGluZ3NPcGVufSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIChcbiAgICAgICAgPGJvZHkgY2xhc3M9e3snZXh0LWRpc2FibGVkJzogIXByb3BzLmRhdGEuaXNFbmFibGVkfX0+XG4gICAgICAgICAgICA8TG9hZGVyIGNvbXBsZXRlIC8+XG5cbiAgICAgICAgICAgIDxIZWFkZXJcbiAgICAgICAgICAgICAgICBkYXRhPXtwcm9wcy5kYXRhfVxuICAgICAgICAgICAgICAgIHRhYj17cHJvcHMudGFifVxuICAgICAgICAgICAgICAgIGFjdGlvbnM9e3Byb3BzLmFjdGlvbnN9XG4gICAgICAgICAgICAgICAgb25Nb3JlVG9nZ2xlU2V0dGluZ3NDbGljaz17dG9nZ2xlTW9yZVRvZ2dsZVNldHRpbmdzfVxuICAgICAgICAgICAgLz5cblxuICAgICAgICAgICAgPFRhYlBhbmVsXG4gICAgICAgICAgICAgICAgYWN0aXZlVGFiPXtzdGF0ZS5hY3RpdmVUYWJ9XG4gICAgICAgICAgICAgICAgb25Td2l0Y2hUYWI9eyh0YWIpID0+IHNldFN0YXRlKHthY3RpdmVUYWI6IHRhYn0pfVxuICAgICAgICAgICAgICAgIHRhYnM9e3tcbiAgICAgICAgICAgICAgICAgICAgJ0ZpbHRlcic6IChcbiAgICAgICAgICAgICAgICAgICAgICAgIDxGaWx0ZXJTZXR0aW5ncyBkYXRhPXtwcm9wcy5kYXRhfSBhY3Rpb25zPXtwcm9wcy5hY3Rpb25zfSB0YWI9e3Byb3BzLnRhYn0gLz5cbiAgICAgICAgICAgICAgICAgICAgKSxcbiAgICAgICAgICAgICAgICAgICAgJ1NpdGUgbGlzdCc6IChcbiAgICAgICAgICAgICAgICAgICAgICAgIDxTaXRlTGlzdFNldHRpbmdzIGRhdGE9e3Byb3BzLmRhdGF9IGFjdGlvbnM9e3Byb3BzLmFjdGlvbnN9IGlzRm9jdXNlZD17c3RhdGUuYWN0aXZlVGFiID09PSAnU2l0ZSBsaXN0J30gLz5cbiAgICAgICAgICAgICAgICAgICAgKSxcbiAgICAgICAgICAgICAgICAgICAgJ01vcmUnOiAoXG4gICAgICAgICAgICAgICAgICAgICAgICA8TW9yZVNldHRpbmdzIGRhdGE9e3Byb3BzLmRhdGF9IGFjdGlvbnM9e3Byb3BzLmFjdGlvbnN9IHRhYj17cHJvcHMudGFifSAvPlxuICAgICAgICAgICAgICAgICAgICApLFxuICAgICAgICAgICAgICAgIH19XG4gICAgICAgICAgICAgICAgdGFiTGFiZWxzPXt7XG4gICAgICAgICAgICAgICAgICAgICdGaWx0ZXInOiBnZXRMb2NhbE1lc3NhZ2UoJ2ZpbHRlcicpLFxuICAgICAgICAgICAgICAgICAgICAnU2l0ZSBsaXN0JzogZ2V0TG9jYWxNZXNzYWdlKCdzaXRlX2xpc3QnKSxcbiAgICAgICAgICAgICAgICAgICAgJ01vcmUnOiBnZXRMb2NhbE1lc3NhZ2UoJ21vcmUnKSxcbiAgICAgICAgICAgICAgICB9fVxuICAgICAgICAgICAgLz5cblxuICAgICAgICAgICAgPGZvb3Rlcj5cbiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiZm9vdGVyLWxpbmtzXCI+XG4gICAgICAgICAgICAgICAgICAgIDxhIGNsYXNzPVwiZm9vdGVyLWxpbmtzX19saW5rXCIgaHJlZj17UFJJVkFDWV9VUkx9IHRhcmdldD1cIl9ibGFua1wiIHJlbD1cIm5vb3BlbmVyIG5vcmVmZXJyZXJcIj57Z2V0TG9jYWxNZXNzYWdlKCdwcml2YWN5Jyl9PC9hPlxuICAgICAgICAgICAgICAgICAgICA8YSBjbGFzcz1cImZvb3Rlci1saW5rc19fbGlua1wiIGhyZWY9e1RXSVRURVJfVVJMfSB0YXJnZXQ9XCJfYmxhbmtcIiByZWw9XCJub29wZW5lciBub3JlZmVycmVyXCI+VHdpdHRlcjwvYT5cbiAgICAgICAgICAgICAgICAgICAgPGEgY2xhc3M9XCJmb290ZXItbGlua3NfX2xpbmtcIiBocmVmPXtHSVRIVUJfVVJMfSB0YXJnZXQ9XCJfYmxhbmtcIiByZWw9XCJub29wZW5lciBub3JlZmVycmVyXCI+R2l0SHViPC9hPlxuICAgICAgICAgICAgICAgICAgICA8YSBjbGFzcz1cImZvb3Rlci1saW5rc19fbGlua1wiIGhyZWY9e2dldEhlbHBVUkwoKX0gdGFyZ2V0PVwiX2JsYW5rXCIgcmVsPVwibm9vcGVuZXIgbm9yZWZlcnJlclwiPntnZXRMb2NhbE1lc3NhZ2UoJ2hlbHAnKX08L2E+XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImZvb3Rlci1idXR0b25zXCI+XG4gICAgICAgICAgICAgICAgICAgIDxhIGNsYXNzPVwiZG9uYXRlLWxpbmtcIiBocmVmPXtET05BVEVfVVJMfSB0YXJnZXQ9XCJfYmxhbmtcIiByZWw9XCJub29wZW5lciBub3JlZmVycmVyXCI+XG4gICAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz1cImRvbmF0ZS1saW5rX190ZXh0XCI+e2dldExvY2FsTWVzc2FnZSgnZG9uYXRlJyl9PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgICA8L2E+XG4gICAgICAgICAgICAgICAgICAgIDxOZXdzQnV0dG9uIGFjdGl2ZT17c3RhdGUubmV3c09wZW59IGNvdW50PXtkaXNwbGF5ZWROZXdzQ291bnR9IG9uQ2xpY2s9e3RvZ2dsZU5ld3N9IC8+XG4gICAgICAgICAgICAgICAgICAgIDxCdXR0b25cbiAgICAgICAgICAgICAgICAgICAgICAgIG9uY2xpY2s9e29wZW5EZXZUb29sc31cbiAgICAgICAgICAgICAgICAgICAgICAgIGNsYXNzPXt7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgJ2Rldi10b29scy1idXR0b24nOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICdkZXYtdG9vbHMtYnV0dG9uLS1oYXMtY3VzdG9tLWZpeGVzJzogaGFzQ3VzdG9tRml4ZXMsXG4gICAgICAgICAgICAgICAgICAgICAgICB9fVxuICAgICAgICAgICAgICAgICAgICA+XG4gICAgICAgICAgICAgICAgICAgICAgICDwn5ugIHtnZXRMb2NhbE1lc3NhZ2UoJ29wZW5fZGV2X3Rvb2xzJyl9XG4gICAgICAgICAgICAgICAgICAgIDwvQnV0dG9uPlxuICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgPC9mb290ZXI+XG4gICAgICAgICAgICA8TmV3c1xuICAgICAgICAgICAgICAgIG5ld3M9e3Byb3BzLmRhdGEubmV3c31cbiAgICAgICAgICAgICAgICBleHBhbmRlZD17c3RhdGUubmV3c09wZW59XG4gICAgICAgICAgICAgICAgb25OZXdzT3Blbj17b25OZXdzT3Blbn1cbiAgICAgICAgICAgICAgICBvbkNsb3NlPXt0b2dnbGVOZXdzfVxuICAgICAgICAgICAgLz5cbiAgICAgICAgICAgIDxNb3JlVG9nZ2xlU2V0dGluZ3NcbiAgICAgICAgICAgICAgICBkYXRhPXtwcm9wcy5kYXRhfVxuICAgICAgICAgICAgICAgIGFjdGlvbnM9e3Byb3BzLmFjdGlvbnN9XG4gICAgICAgICAgICAgICAgaXNFeHBhbmRlZD17c3RhdGUubW9yZVRvZ2dsZVNldHRpbmdzT3Blbn1cbiAgICAgICAgICAgICAgICBvbkNsb3NlPXt0b2dnbGVNb3JlVG9nZ2xlU2V0dGluZ3N9XG4gICAgICAgICAgICAvPlxuICAgICAgICA8L2JvZHk+XG4gICAgKTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgY29tcG9zZShCb2R5LCB3aXRoU3RhdGUsIHdpdGhGb3Jtcyk7XG4iLCJpbXBvcnQge2dldENocm9tZVZlcnNpb24sIGNvbXBhcmVDaHJvbWVWZXJzaW9ucywgaXNXaW5kb3dzLCBpc01hY09TLCBpc1ZpdmFsZGksIGlzT3BlcmEsIGlzWWFCcm93c2VyLCBpc0VkZ2V9IGZyb20gJy4uLy4uLy4uL3V0aWxzL3BsYXRmb3JtJztcblxuZXhwb3J0IGZ1bmN0aW9uIHBvcHVwSGFzQnVpbHRJbkJvcmRlcnMoKSB7XG4gICAgY29uc3QgY2hyb21lVmVyc2lvbiA9IGdldENocm9tZVZlcnNpb24oKTtcbiAgICByZXR1cm4gQm9vbGVhbihcbiAgICAgICAgY2hyb21lVmVyc2lvbiAmJlxuICAgICAgICAhaXNWaXZhbGRpKCkgJiZcbiAgICAgICAgIWlzWWFCcm93c2VyKCkgJiZcbiAgICAgICAgIWlzT3BlcmEoKSAmJlxuICAgICAgICBpc1dpbmRvd3MoKSAmJlxuICAgICAgICBjb21wYXJlQ2hyb21lVmVyc2lvbnMoY2hyb21lVmVyc2lvbiwgJzYyLjAuMzE2Ny4wJykgPCAwXG4gICAgKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBvcHVwSGFzQnVpbHRJbkhvcml6b250YWxCb3JkZXJzKCkge1xuICAgIGNvbnN0IGNocm9tZVZlcnNpb24gPSBnZXRDaHJvbWVWZXJzaW9uKCk7XG4gICAgcmV0dXJuIEJvb2xlYW4oXG4gICAgICAgIGNocm9tZVZlcnNpb24gJiZcbiAgICAgICAgIWlzVml2YWxkaSgpICYmXG4gICAgICAgICFpc1lhQnJvd3NlcigpICYmXG4gICAgICAgICFpc0VkZ2UoKSAmJlxuICAgICAgICAhaXNPcGVyYSgpICYmIChcbiAgICAgICAgICAgIChpc1dpbmRvd3MoKSAmJiBjb21wYXJlQ2hyb21lVmVyc2lvbnMoY2hyb21lVmVyc2lvbiwgJzYyLjAuMzE2Ny4wJykgPj0gMCkgJiYgY29tcGFyZUNocm9tZVZlcnNpb25zKGNocm9tZVZlcnNpb24sICc3NC4wLjAuMCcpIDwgMCB8fFxuICAgICAgICAgICAgKGlzTWFjT1MoKSAmJiBjb21wYXJlQ2hyb21lVmVyc2lvbnMoY2hyb21lVmVyc2lvbiwgJzY3LjAuMzM3My4wJykgPj0gMCAmJiBjb21wYXJlQ2hyb21lVmVyc2lvbnMoY2hyb21lVmVyc2lvbiwgJzczLjAuMzY2MS4wJykgPCAwKVxuICAgICAgICApXG4gICAgKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGZpeE5vdENsb3NpbmdQb3B1cE9uTmF2aWdhdGlvbigpIHtcbiAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7XG4gICAgICAgIGlmIChlLmRlZmF1bHRQcmV2ZW50ZWQgfHwgZS5idXR0b24gPT09IDIpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBsZXQgdGFyZ2V0ID0gZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQ7XG4gICAgICAgIHdoaWxlICh0YXJnZXQgJiYgISh0YXJnZXQgaW5zdGFuY2VvZiBIVE1MQW5jaG9yRWxlbWVudCkpIHtcbiAgICAgICAgICAgIHRhcmdldCA9IHRhcmdldC5wYXJlbnRFbGVtZW50O1xuICAgICAgICB9XG4gICAgICAgIGlmICh0YXJnZXQgJiYgdGFyZ2V0Lmhhc0F0dHJpYnV0ZSgnaHJlZicpKSB7XG4gICAgICAgICAgICBjaHJvbWUudGFicy5jcmVhdGUoe3VybDogdGFyZ2V0LmdldEF0dHJpYnV0ZSgnaHJlZicpfSk7XG4gICAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICB3aW5kb3cuY2xvc2UoKTtcbiAgICAgICAgfVxuICAgIH0pO1xufVxuIiwiaW1wb3J0IHttfSBmcm9tICdtYWxldmljJztcbmltcG9ydCB7c3luY30gZnJvbSAnbWFsZXZpYy9kb20nO1xuaW1wb3J0IGNvbm5lY3QgZnJvbSAnLi4vY29ubmVjdCc7XG5pbXBvcnQgQm9keSBmcm9tICcuL2NvbXBvbmVudHMvYm9keSc7XG5pbXBvcnQge2lzTW9iaWxlLCBpc0ZpcmVmb3h9IGZyb20gJy4uLy4uL3V0aWxzL3BsYXRmb3JtJztcbmltcG9ydCB7cG9wdXBIYXNCdWlsdEluSG9yaXpvbnRhbEJvcmRlcnMsIHBvcHVwSGFzQnVpbHRJbkJvcmRlcnMsIGZpeE5vdENsb3NpbmdQb3B1cE9uTmF2aWdhdGlvbn0gZnJvbSAnLi91dGlscy9pc3N1ZXMnO1xuaW1wb3J0IHtFeHRlbnNpb25EYXRhLCBFeHRlbnNpb25BY3Rpb25zLCBUYWJJbmZvfSBmcm9tICcuLi8uLi9kZWZpbml0aW9ucyc7XG5cbmZ1bmN0aW9uIHJlbmRlckJvZHkoZGF0YTogRXh0ZW5zaW9uRGF0YSwgdGFiOiBUYWJJbmZvLCBhY3Rpb25zOiBFeHRlbnNpb25BY3Rpb25zKSB7XG4gICAgaWYgKGRhdGEuc2V0dGluZ3MucHJldmlld05ld0Rlc2lnbikge1xuICAgICAgICBpZiAoIWRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoJ3ByZXZpZXcnKSkge1xuICAgICAgICAgICAgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LmNsYXNzTGlzdC5hZGQoJ3ByZXZpZXcnKTtcbiAgICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAgIGlmIChkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCdwcmV2aWV3JykpIHtcbiAgICAgICAgICAgIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdwcmV2aWV3Jyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBzeW5jKGRvY3VtZW50LmJvZHksIChcbiAgICAgICAgPEJvZHkgZGF0YT17ZGF0YX0gdGFiPXt0YWJ9IGFjdGlvbnM9e2FjdGlvbnN9IC8+XG4gICAgKSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHN0YXJ0KCkge1xuICAgIGNvbnN0IGNvbm5lY3RvciA9IGNvbm5lY3QoKTtcbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigndW5sb2FkJywgKCkgPT4gY29ubmVjdG9yLmRpc2Nvbm5lY3QoKSk7XG5cbiAgICBjb25zdCBbZGF0YSwgdGFiXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcbiAgICAgICAgY29ubmVjdG9yLmdldERhdGEoKSxcbiAgICAgICAgY29ubmVjdG9yLmdldEFjdGl2ZVRhYkluZm8oKSxcbiAgICBdKTtcbiAgICByZW5kZXJCb2R5KGRhdGEsIHRhYiwgY29ubmVjdG9yKTtcbiAgICBjb25uZWN0b3Iuc3Vic2NyaWJlVG9DaGFuZ2VzKChkYXRhKSA9PiByZW5kZXJCb2R5KGRhdGEsIHRhYiwgY29ubmVjdG9yKSk7XG59XG5cbmFkZEV2ZW50TGlzdGVuZXIoJ2xvYWQnLCBzdGFydCk7XG5cbmRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdtb2JpbGUnLCBpc01vYmlsZSgpKTtcbmRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdmaXJlZm94JywgaXNGaXJlZm94KCkpO1xuZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ2J1aWx0LWluLWJvcmRlcnMnLCBwb3B1cEhhc0J1aWx0SW5Cb3JkZXJzKCkpO1xuZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ2J1aWx0LWluLWhvcml6b250YWwtYm9yZGVycycsIHBvcHVwSGFzQnVpbHRJbkhvcml6b250YWxCb3JkZXJzKCkpO1xuXG5pZiAoaXNGaXJlZm94KCkpIHtcbiAgICBmaXhOb3RDbG9zaW5nUG9wdXBPbk5hdmlnYXRpb24oKTtcbn1cblxuZGVjbGFyZSBjb25zdCBfX0RFQlVHX186IGJvb2xlYW47XG5jb25zdCBERUJVRyA9IF9fREVCVUdfXztcbmlmIChERUJVRykge1xuICAgIGNocm9tZS5ydW50aW1lLm9uTWVzc2FnZS5hZGRMaXN0ZW5lcigoe3R5cGV9KSA9PiB7XG4gICAgICAgIGlmICh0eXBlID09PSAnY3NzLXVwZGF0ZScpIHtcbiAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ2xpbmtbcmVsPVwic3R5bGVzaGVldFwiXScpLmZvckVhY2goKGxpbms6IEhUTUxMaW5rRWxlbWVudCkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHVybCA9IGxpbmsuaHJlZjtcbiAgICAgICAgICAgICAgICBsaW5rLmRpc2FibGVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBjb25zdCBuZXdMaW5rID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnbGluaycpO1xuICAgICAgICAgICAgICAgIG5ld0xpbmsucmVsID0gJ3N0eWxlc2hlZXQnO1xuICAgICAgICAgICAgICAgIG5ld0xpbmsuaHJlZiA9IHVybC5yZXBsYWNlKC9cXD8uKiQvLCBgP25vY2FjaGU9JHtEYXRlLm5vdygpfWApO1xuICAgICAgICAgICAgICAgIGxpbmsucGFyZW50RWxlbWVudC5pbnNlcnRCZWZvcmUobmV3TGluaywgbGluayk7XG4gICAgICAgICAgICAgICAgbGluay5yZW1vdmUoKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHR5cGUgPT09ICd1aS11cGRhdGUnKSB7XG4gICAgICAgICAgICBsb2NhdGlvbi5yZWxvYWQoKTtcbiAgICAgICAgfVxuICAgIH0pO1xufVxuIl0sIm5hbWVzIjpbImFkZEV2ZW50TGlzdGVuZXIiLCJnZXRDb250ZXh0IiwiY2xhc3NlcyIsInJlbmRlciIsIkNvbG9yUGlja2VyIiwiT3ZlcmxheSIsIlJlc2V0QnV0dG9uIiwidGhyb3R0bGUiLCJTaXRlVG9nZ2xlIiwiU2hvcnRjdXQiLCJDb250cm9sR3JvdXAiLCJTZWxlY3QiLCJUaGVtZVByZXNldFBpY2tlciIsIk5hdkJ1dHRvbiIsIkJhY2tncm91bmRDb2xvciIsIlRleHRDb2xvciIsIlNjcm9sbGJhciIsIlJlc2V0QnV0dG9uR3JvdXAiLCJ0aGVtZUVuZ2luZXMiLCJvcGVuRGV2VG9vbHMiLCJCb2R5IiwiTG9hZGVyIiwiTmV3Qm9keSJdLCJtYXBwaW5ncyI6Ijs7O0lBQUE7SUFDQSxTQUFTLENBQUMsQ0FBQyxjQUFjLEVBQUUsS0FBSyxFQUFFLEdBQUcsUUFBUSxFQUFFO0lBQy9DLElBQUksS0FBSyxHQUFHLEtBQUssSUFBSSxFQUFFLENBQUM7SUFDeEIsSUFBSSxJQUFJLE9BQU8sY0FBYyxLQUFLLFFBQVEsRUFBRTtJQUM1QyxRQUFRLE1BQU0sR0FBRyxHQUFHLGNBQWMsQ0FBQztJQUNuQyxRQUFRLE9BQU8sRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsQ0FBQztJQUM5QyxLQUFLO0lBQ0wsSUFBSSxJQUFJLE9BQU8sY0FBYyxLQUFLLFVBQVUsRUFBRTtJQUM5QyxRQUFRLE1BQU0sU0FBUyxHQUFHLGNBQWMsQ0FBQztJQUN6QyxRQUFRLE9BQU8sRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsQ0FBQztJQUNwRCxLQUFLO0lBQ0wsSUFBSSxNQUFNLElBQUksS0FBSyxDQUFDLHVCQUF1QixDQUFDLENBQUM7SUFDN0M7O0lDWkE7SUFDQSxTQUFT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LEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQzVDLFlBQVksSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUM1QyxZQUFZLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO0lBQzdCLFNBQVM7SUFDVCxLQUFLO0lBQ0wsSUFBSSxZQUFZLENBQUMsT0FBTyxFQUFFLE9BQU8sRUFBRTtJQUNuQyxRQUFRLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDMUMsUUFBUSxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDdEMsUUFBUSxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxPQUFPLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFDekMsUUFBUSxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxPQUFPLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFDekMsUUFBUSxJQUFJLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBQzlDLFFBQVEsT0FBTyxLQUFLLElBQUksQ0FBQyxLQUFLLEtBQUssSUFBSSxDQUFDLEtBQUssR0FBRyxPQUFPLENBQUMsQ0FBQztJQUN6RCxLQUFLO0lBQ0wsSUFBSSxNQUFNLENBQUMsSUFBSSxFQUFFO0lBQ2pCLFFBQVEsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUN2QyxRQUFRLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDdEMsUUFBUSxJQUFJLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQzNDLFFBQVEsSUFBSSxJQUFJLElBQUks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QUksQ0FBQyxDQUFDO0lBQ2xELEtBQUs7SUFDTCxJQUFJLE1BQU0sQ0FBQyxJQUFJLEVBQUUsT0FBTyxFQUFFO0lBQzFCLFFBQVEsSUFBSSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDO0lBQ2hDLFFBQVEsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDO0lBQzlCLFFBQVEsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDO0lBQzFDLFFBQVEsTUFBTSxXQUFXLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDL0QsUUFBUSxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7SUFDMUIsUUFBUSxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxDQUFDO0lBQ2hELFFBQVEsSUFBSSxNQUFNLEdBQUcsSUFBSSxDQUFDO0lBQzFCLFFBQVEsSUFBSSxPQUFPLEtBQUssT0FBTyxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUU7SUFDNUMsWUFBWSxNQUFNLEdBQUcsT0FBTyxDQUFDO0lBQzdCLFlBQVksSUFBSSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDO0lBQ3BDLFlBQVksT0FBTyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsQ0FBQztJQUN0RCxTQUFTO0lBQ1QsYUFBYTtJQUNiLFlBQVksSUFBSSxDQUFDLEtBQUssR0FBRyxXQUFXLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ3BELFNBQVM7SUFDVCxRQUFRLE9BQU8sTUFBTSxDQUFDO0lBQ3RCLEtBQUs7SUFDTCxJQUFJLE1BQU0sQ0FBQyxLQUFLLEVBQUUsT0FBTyxFQUFFO0lBQzNCLFFBQVEsTUFBTSxFQUFFLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUNyQyxRQUFRLElBQUks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
