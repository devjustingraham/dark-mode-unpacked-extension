(function () {
    'use strict'

    /* malevic@0.18.6 - Jul 15, 2020 */
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

    /* malevic@0.18.6 - Jul 15, 2020 */
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
    function addEventListener(element, event, listener) {
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
            addEventListener(element, event, listener)
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

    // https://en.wikipedia.org/wiki/HSL_and_HSV
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
    // https://en.wikipedia.org/wiki/HSL_and_HSV
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
    Object.assign(ColorPicker, { focus: focusColorPicker })

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
    Object.assign(Overlay, { Portal })

    function getUILanguage() {
        const code = chrome.i18n.getUILanguage()
        if (code.endsWith('-mac')) {
            return code.substring(0, code.length - 4)
        }
        return code
    }

    const is12H = (new Date()).toLocaleTimeString(getUILanguage()).endsWith('M')

    var ThemeEngines = {
        cssFilter: 'cssFilter',
        svgFilter: 'svgFilter',
        staticTheme: 'staticTheme',
        dynamicTheme: 'dynamicTheme',
    }

    const DEVTOOLS_DOCS_URL = ''

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
            .replace(/^\^/, '') // Remove ^ at start
            .replace(/\$$/, '') // Remove $ at end
            .replace(/^.*?\/{2,3}/, '') // Remove scheme
            .replace(/\?.*$/, '') // Remove query
            .replace(/\/$/, '') // Remove last slash
        )
        let slashIndex
        let beforeSlash
        let afterSlash
        if ((slashIndex = urlTemplate.indexOf('/')) >= 0) {
            beforeSlash = urlTemplate.substring(0, slashIndex) // google.*
            afterSlash = urlTemplate.replace('$', '').substring(slashIndex) // /login/abc
        }
        else {
            beforeSlash = urlTemplate.replace('$', '')
        }
        //
        // SCHEME and SUBDOMAINS
        let result = (exactBeginning ?
            '^(.*?\\:\\/{2,3})?' // Scheme
            : '^(.*?\\:\\/{2,3})?([^\/]*?\\.)?' // Scheme and subdomains
        )
        //
        // HOST and PORT
        const hostParts = beforeSlash.split('.')
        result += '('
        for (let i = 0;i < hostParts.length;i++) {
            if (hostParts[i] === '*') {
                hostParts[i] = '[^\\.\\/]+?'
            }
        }
        result += hostParts.join('\\.')
        result += ')'
        //
        // PATH and QUERY
        if (afterSlash) {
            result += '('
            result += afterSlash.replace('/', '\\/')
            result += ')'
        }
        result += (exactEnding ?
            '(\\/?(\\?[^\/]*?)?)$' // All following queries
            : '(\\/?.*?)$' // All following paths and queries
        )
        //
        // Result
        return new RegExp(result, 'i')
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

    function Body({ data, tab, actions }) {
        const { state, setState } = useState({ errorText: null })
        let textNode
        const previewButtonText = data.settings.previewNewDesign ? 'Switch to old design' : 'Preview new design'
        const { theme } = getCurrentThemePreset({ data, tab, actions })
        const wrapper = (theme.engine === ThemeEngines.staticTheme
            ? {
                header: 'Static Theme Editor',
                fixesText: data.devtools.staticThemesText,
                apply: (text) => actions.applyDevStaticThemes(text),
                reset: () => actions.resetDevStaticThemes(),
            } : theme.engine === ThemeEngines.cssFilter || theme.engine === ThemeEngines.svgFilter ? {
                header: 'Inversion Fix Editor',
                fixesText: data.devtools.filterFixesText,
                apply: (text) => actions.applyDevInversionFixes(text),
                reset: () => actions.resetDevInversionFixes(),
            } : {
                    header: 'Dynamic Theme Editor',
                    fixesText: data.devtools.dynamicFixesText,
                    apply: (text) => actions.applyDevDynamicThemeFixes(text),
                    reset: () => actions.resetDevDynamicThemeFixes(),
                })
        function onTextRender(node) {
            textNode = node
            if (!state.errorText) {
                textNode.value = wrapper.fixesText
            }
            node.addEventListener('keydown', (e) => {
                if (e.key === 'Tab') {
                    e.preventDefault()
                    const indent = ' '.repeat(4)
                    if (isFirefox()) {
                        // https://bugzilla.mozilla.org/show_bug.cgi?id=1220696
                        const start = node.selectionStart
                        const end = node.selectionEnd
                        const before = node.value.substring(0, start)
                        const after = node.value.substring(end)
                        node.focus()
                        node.value = `${before}${indent}${after}`
                        const cursorPos = start + indent.length
                        node.setSelectionRange(cursorPos, cursorPos)
                    }
                    else {
                        document.execCommand('insertText', false, indent)
                    }
                }
            })
        }
        async function apply() {
            const text = textNode.value
            try {
                await wrapper.apply(text)
                setState({ errorText: null })
            }
            catch (err) {
                setState({
                    errorText: String(err),
                })
            }
        }
        function reset() {
            wrapper.reset()
            setState({ errorText: null })
        }
        function toggleDesign() {
            actions.changeSettings({ previewNewDesign: !data.settings.previewNewDesign })
        }
        return (m("body", null,
            m("header", null,
                m("h1", { id: "title" }, "Developer Tools")),
            m("h3", { id: "sub-title" }, wrapper.header),
            m("textarea", { id: "editor", onrender: onTextRender }),
            m("label", { id: "error-text" }, state.errorText),
            m("div", { id: "buttons" },
                m(Button, { onclick: reset }, "Reset"),
                m(Button, { onclick: apply }, "Apply"),
                m(Button, { class: "preview-design-button", onclick: toggleDesign }, previewButtonText)),
            m("p", { id: "description" },
                "Read about this tool ",
                m("strong", null,
                    m("a", { href: DEVTOOLS_DOCS_URL, target: "_blank", rel: "noopener noreferrer" }, "here")),
                ". If a ",
                m("strong", null, "popular"),
                " website looks incorrect e-mail to ",
                m("strong", null, "justingoldengraham@gmail.com"))))
    }
    var Body$1 = withState(Body)

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
            news: [],
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
            markNewsAsRead(ids) {
                data.news
                    .filter(({ id }) => ids.includes(id))
                    .forEach((news) => news.read = true)
                listener(data)
            },
            disconnect() {
                //
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

    function renderBody(data, tab, actions) {
        sync(document.body, m(Body$1, { data: data, tab: tab, actions: actions }))
    }
    async function start() {
        const connector = connect()
        window.addEventListener('unload', () => connector.disconnect())
        const data = await connector.getData()
        const tabInfo = await connector.getActiveTabInfo()
        renderBody(data, tabInfo, connector)
        connector.subscribeToChanges((data) => renderBody(data, tabInfo, connector))
    }
    start()

}())
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL25vZGVfbW9kdWxlcy9tYWxldmljL2luZGV4Lm1qcyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy9tYWxldmljL2RvbS5tanMiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvbWFsZXZpYy9zdGF0ZS5tanMiLCIuLi8uLi8uLi9zcmMvdXRpbHMvcGxhdGZvcm0udHMiLCIuLi8uLi8uLi9zcmMvdWkvdXRpbHMudHMiLCIuLi8uLi8uLi9zcmMvdWkvY29udHJvbHMvdXRpbHMudHMiLCIuLi8uLi8uLi9zcmMvdWkvY29udHJvbHMvYnV0dG9uL2luZGV4LnRzeCIsIi4uLy4uLy4uL3NyYy91dGlscy9jb2xvci50cyIsIi4uLy4uLy4uL3NyYy91aS9jb250cm9scy90ZXh0Ym94L2luZGV4LnRzeCIsIi4uLy4uLy4uL3NyYy91dGlscy9tYXRoLnRzIiwiLi4vLi4vLi4vc3JjL3VpL2NvbnRyb2xzL2NvbG9yLXBpY2tlci9oc2ItcGlja2VyLnRzeCIsIi4uLy4uLy4uL3NyYy91aS9jb250cm9scy9jb2xvci1waWNrZXIvaW5kZXgudHN4IiwiLi4vLi4vLi4vc3JjL3VpL2NvbnRyb2xzL292ZXJsYXkvaW5kZXgudHMiLCIuLi8uLi8uLi9zcmMvdXRpbHMvbG9jYWxlcy50cyIsIi4uLy4uLy4uL3NyYy91aS9jb250cm9scy90aW1lLXJhbmdlLXBpY2tlci9pbmRleC50c3giLCIuLi8uLi8uLi9zcmMvZ2VuZXJhdG9ycy90aGVtZS1lbmdpbmVzLnRzIiwiLi4vLi4vLi4vc3JjL3V0aWxzL2xpbmtzLnRzIiwiLi4vLi4vLi4vc3JjL3V0aWxzL2lwdjYudHMiLCIuLi8uLi8uLi9zcmMvdXRpbHMvdXJsLnRzIiwiLi4vLi4vLi4vc3JjL3VpL3BvcHVwL3RoZW1lL3V0aWxzLnRzIiwiLi4vLi4vLi4vc3JjL3VpL2RldnRvb2xzL2NvbXBvbmVudHMvYm9keS50c3giLCIuLi8uLi8uLi9zcmMvdWkvY29ubmVjdC9jb25uZWN0b3IudHMiLCIuLi8uLi8uLi9zcmMvdWkvY29ubmVjdC9tb2NrLnRzIiwiLi4vLi4vLi4vc3JjL3VpL2Nvbm5lY3QvaW5kZXgudHMiLCIuLi8uLi8uLi9zcmMvdWkvZGV2dG9vbHMvaW5kZXgudHN4Il0sInNvdXJjZXNDb250ZW50IjpbIi8qIG1hbGV2aWNAMC4xOC42IC0gSnVsIDE1LCAyMDIwICovXG5mdW5jdGlvbiBtKHRhZ09yQ29tcG9uZW50LCBwcm9wcywgLi4uY2hpbGRyZW4pIHtcbiAgICBwcm9wcyA9IHByb3BzIHx8IHt9O1xuICAgIGlmICh0eXBlb2YgdGFnT3JDb21wb25lbnQgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGNvbnN0IHRhZyA9IHRhZ09yQ29tcG9uZW50O1xuICAgICAgICByZXR1cm4geyB0eXBlOiB0YWcsIHByb3BzLCBjaGlsZHJlbiB9O1xuICAgIH1cbiAgICBpZiAodHlwZW9mIHRhZ09yQ29tcG9uZW50ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIGNvbnN0IGNvbXBvbmVudCA9IHRhZ09yQ29tcG9uZW50O1xuICAgICAgICByZXR1cm4geyB0eXBlOiBjb21wb25lbnQsIHByb3BzLCBjaGlsZHJlbiB9O1xuICAgIH1cbiAgICB0aHJvdyBuZXcgRXJyb3IoJ1Vuc3VwcG9ydGVkIHNwZWMgdHlwZScpO1xufVxuXG5leHBvcnQgeyBtIH07XG4iLCIvKiBtYWxldmljQDAuMTguNiAtIEp1bCAxNSwgMjAyMCAqL1xuZnVuY3Rpb24gY3JlYXRlUGx1Z2luc1N0b3JlKCkge1xuICAgIGNvbnN0IHBsdWdpbnMgPSBbXTtcbiAgICByZXR1cm4ge1xuICAgICAgICBhZGQocGx1Z2luKSB7XG4gICAgICAgICAgICBwbHVnaW5zLnB1c2gocGx1Z2luKTtcbiAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICB9LFxuICAgICAgICBhcHBseShwcm9wcykge1xuICAgICAgICAgICAgbGV0IHJlc3VsdDtcbiAgICAgICAgICAgIGxldCBwbHVnaW47XG4gICAgICAgICAgICBjb25zdCB1c2VkUGx1Z2lucyA9IG5ldyBTZXQoKTtcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSBwbHVnaW5zLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICAgICAgICAgICAgcGx1Z2luID0gcGx1Z2luc1tpXTtcbiAgICAgICAgICAgICAgICBpZiAodXNlZFBsdWdpbnMuaGFzKHBsdWdpbikpIHtcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJlc3VsdCA9IHBsdWdpbihwcm9wcyk7XG4gICAgICAgICAgICAgICAgaWYgKHJlc3VsdCAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHVzZWRQbHVnaW5zLmFkZChwbHVnaW4pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH0sXG4gICAgICAgIGRlbGV0ZShwbHVnaW4pIHtcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSBwbHVnaW5zLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICAgICAgICAgICAgaWYgKHBsdWdpbnNbaV0gPT09IHBsdWdpbikge1xuICAgICAgICAgICAgICAgICAgICBwbHVnaW5zLnNwbGljZShpLCAxKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgIH0sXG4gICAgICAgIGVtcHR5KCkge1xuICAgICAgICAgICAgcmV0dXJuIHBsdWdpbnMubGVuZ3RoID09PSAwO1xuICAgICAgICB9LFxuICAgIH07XG59XG5mdW5jdGlvbiBpdGVyYXRlQ29tcG9uZW50UGx1Z2lucyh0eXBlLCBwYWlycywgaXRlcmF0b3IpIHtcbiAgICBwYWlyc1xuICAgICAgICAuZmlsdGVyKChba2V5XSkgPT4gdHlwZVtrZXldKVxuICAgICAgICAuZm9yRWFjaCgoW2tleSwgcGx1Z2luc10pID0+IHtcbiAgICAgICAgcmV0dXJuIHR5cGVba2V5XS5mb3JFYWNoKChwbHVnaW4pID0+IGl0ZXJhdG9yKHBsdWdpbnMsIHBsdWdpbikpO1xuICAgIH0pO1xufVxuZnVuY3Rpb24gYWRkQ29tcG9uZW50UGx1Z2lucyh0eXBlLCBwYWlycykge1xuICAgIGl0ZXJhdGVDb21wb25lbnRQbHVnaW5zKHR5cGUsIHBhaXJzLCAocGx1Z2lucywgcGx1Z2luKSA9PiBwbHVnaW5zLmFkZChwbHVnaW4pKTtcbn1cbmZ1bmN0aW9uIGRlbGV0ZUNvbXBvbmVudFBsdWdpbnModHlwZSwgcGFpcnMpIHtcbiAgICBpdGVyYXRlQ29tcG9uZW50UGx1Z2lucyh0eXBlLCBwYWlycywgKHBsdWdpbnMsIHBsdWdpbikgPT4gcGx1Z2lucy5kZWxldGUocGx1Z2luKSk7XG59XG5mdW5jdGlvbiBjcmVhdGVQbHVnaW5zQVBJKGtleSkge1xuICAgIGNvbnN0IGFwaSA9IHtcbiAgICAgICAgYWRkKHR5cGUsIHBsdWdpbikge1xuICAgICAgICAgICAgaWYgKCF0eXBlW2tleV0pIHtcbiAgICAgICAgICAgICAgICB0eXBlW2tleV0gPSBbXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHR5cGVba2V5XS5wdXNoKHBsdWdpbik7XG4gICAgICAgICAgICByZXR1cm4gYXBpO1xuICAgICAgICB9LFxuICAgIH07XG4gICAgcmV0dXJuIGFwaTtcbn1cblxuY29uc3QgWEhUTUxfTlMgPSAnaHR0cDovL3d3dy53My5vcmcvMTk5OS94aHRtbCc7XG5jb25zdCBTVkdfTlMgPSAnaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnO1xuY29uc3QgUExVR0lOU19DUkVBVEVfRUxFTUVOVCA9IFN5bWJvbCgpO1xuY29uc3QgcGx1Z2luc0NyZWF0ZUVsZW1lbnQgPSBjcmVhdGVQbHVnaW5zU3RvcmUoKTtcbmZ1bmN0aW9uIGNyZWF0ZUVsZW1lbnQoc3BlYywgcGFyZW50KSB7XG4gICAgY29uc3QgcmVzdWx0ID0gcGx1Z2luc0NyZWF0ZUVsZW1lbnQuYXBwbHkoeyBzcGVjLCBwYXJlbnQgfSk7XG4gICAgaWYgKHJlc3VsdCkge1xuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICBjb25zdCB0YWcgPSBzcGVjLnR5cGU7XG4gICAgaWYgKHRhZyA9PT0gJ3N2ZycpIHtcbiAgICAgICAgcmV0dXJuIGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUyhTVkdfTlMsICdzdmcnKTtcbiAgICB9XG4gICAgY29uc3QgbmFtZXNwYWNlID0gcGFyZW50Lm5hbWVzcGFjZVVSSTtcbiAgICBpZiAobmFtZXNwYWNlID09PSBYSFRNTF9OUyB8fCBuYW1lc3BhY2UgPT0gbnVsbCkge1xuICAgICAgICByZXR1cm4gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCh0YWcpO1xuICAgIH1cbiAgICByZXR1cm4gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKG5hbWVzcGFjZSwgdGFnKTtcbn1cblxuZnVuY3Rpb24gY2xhc3NlcyguLi5hcmdzKSB7XG4gICAgY29uc3QgY2xhc3NlcyA9IFtdO1xuICAgIGFyZ3MuZmlsdGVyKChjKSA9PiBCb29sZWFuKGMpKS5mb3JFYWNoKChjKSA9PiB7XG4gICAgICAgIGlmICh0eXBlb2YgYyA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIGNsYXNzZXMucHVzaChjKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmICh0eXBlb2YgYyA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgIGNsYXNzZXMucHVzaCguLi5PYmplY3Qua2V5cyhjKS5maWx0ZXIoKGtleSkgPT4gQm9vbGVhbihjW2tleV0pKSk7XG4gICAgICAgIH1cbiAgICB9KTtcbiAgICByZXR1cm4gY2xhc3Nlcy5qb2luKCcgJyk7XG59XG5mdW5jdGlvbiBzZXRJbmxpbmVDU1NQcm9wZXJ0eVZhbHVlKGVsZW1lbnQsIHByb3AsICR2YWx1ZSkge1xuICAgIGlmICgkdmFsdWUgIT0gbnVsbCAmJiAkdmFsdWUgIT09ICcnKSB7XG4gICAgICAgIGxldCB2YWx1ZSA9IFN0cmluZygkdmFsdWUpO1xuICAgICAgICBsZXQgaW1wb3J0YW50ID0gJyc7XG4gICAgICAgIGlmICh2YWx1ZS5lbmRzV2l0aCgnIWltcG9ydGFudCcpKSB7XG4gICAgICAgICAgICB2YWx1ZSA9IHZhbHVlLnN1YnN0cmluZygwLCB2YWx1ZS5sZW5ndGggLSAxMCk7XG4gICAgICAgICAgICBpbXBvcnRhbnQgPSAnaW1wb3J0YW50JztcbiAgICAgICAgfVxuICAgICAgICBlbGVtZW50LnN0eWxlLnNldFByb3BlcnR5KHByb3AsIHZhbHVlLCBpbXBvcnRhbnQpO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgZWxlbWVudC5zdHlsZS5yZW1vdmVQcm9wZXJ0eShwcm9wKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGlzT2JqZWN0KHZhbHVlKSB7XG4gICAgcmV0dXJuIHZhbHVlICE9IG51bGwgJiYgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0Jztcbn1cblxuY29uc3QgZXZlbnRMaXN0ZW5lcnMgPSBuZXcgV2Vha01hcCgpO1xuZnVuY3Rpb24gYWRkRXZlbnRMaXN0ZW5lcihlbGVtZW50LCBldmVudCwgbGlzdGVuZXIpIHtcbiAgICBsZXQgbGlzdGVuZXJzO1xuICAgIGlmIChldmVudExpc3RlbmVycy5oYXMoZWxlbWVudCkpIHtcbiAgICAgICAgbGlzdGVuZXJzID0gZXZlbnRMaXN0ZW5lcnMuZ2V0KGVsZW1lbnQpO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgbGlzdGVuZXJzID0gbmV3IE1hcCgpO1xuICAgICAgICBldmVudExpc3RlbmVycy5zZXQoZWxlbWVudCwgbGlzdGVuZXJzKTtcbiAgICB9XG4gICAgaWYgKGxpc3RlbmVycy5nZXQoZXZlbnQpICE9PSBsaXN0ZW5lcikge1xuICAgICAgICBpZiAobGlzdGVuZXJzLmhhcyhldmVudCkpIHtcbiAgICAgICAgICAgIGVsZW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcihldmVudCwgbGlzdGVuZXJzLmdldChldmVudCkpO1xuICAgICAgICB9XG4gICAgICAgIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihldmVudCwgbGlzdGVuZXIpO1xuICAgICAgICBsaXN0ZW5lcnMuc2V0KGV2ZW50LCBsaXN0ZW5lcik7XG4gICAgfVxufVxuZnVuY3Rpb24gcmVtb3ZlRXZlbnRMaXN0ZW5lcihlbGVtZW50LCBldmVudCkge1xuICAgIGlmICghZXZlbnRMaXN0ZW5lcnMuaGFzKGVsZW1lbnQpKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgbGlzdGVuZXJzID0gZXZlbnRMaXN0ZW5lcnMuZ2V0KGVsZW1lbnQpO1xuICAgIGVsZW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcihldmVudCwgbGlzdGVuZXJzLmdldChldmVudCkpO1xuICAgIGxpc3RlbmVycy5kZWxldGUoZXZlbnQpO1xufVxuXG5mdW5jdGlvbiBzZXRDbGFzc09iamVjdChlbGVtZW50LCBjbGFzc09iaikge1xuICAgIGNvbnN0IGNscyA9IEFycmF5LmlzQXJyYXkoY2xhc3NPYmopXG4gICAgICAgID8gY2xhc3NlcyguLi5jbGFzc09iailcbiAgICAgICAgOiBjbGFzc2VzKGNsYXNzT2JqKTtcbiAgICBpZiAoY2xzKSB7XG4gICAgICAgIGVsZW1lbnQuc2V0QXR0cmlidXRlKCdjbGFzcycsIGNscyk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICBlbGVtZW50LnJlbW92ZUF0dHJpYnV0ZSgnY2xhc3MnKTtcbiAgICB9XG59XG5mdW5jdGlvbiBtZXJnZVZhbHVlcyhvYmosIG9sZCkge1xuICAgIGNvbnN0IHZhbHVlcyA9IG5ldyBNYXAoKTtcbiAgICBjb25zdCBuZXdQcm9wcyA9IG5ldyBTZXQoT2JqZWN0LmtleXMob2JqKSk7XG4gICAgY29uc3Qgb2xkUHJvcHMgPSBPYmplY3Qua2V5cyhvbGQpO1xuICAgIG9sZFByb3BzXG4gICAgICAgIC5maWx0ZXIoKHByb3ApID0+ICFuZXdQcm9wcy5oYXMocHJvcCkpXG4gICAgICAgIC5mb3JFYWNoKChwcm9wKSA9PiB2YWx1ZXMuc2V0KHByb3AsIG51bGwpKTtcbiAgICBuZXdQcm9wcy5mb3JFYWNoKChwcm9wKSA9PiB2YWx1ZXMuc2V0KHByb3AsIG9ialtwcm9wXSkpO1xuICAgIHJldHVybiB2YWx1ZXM7XG59XG5mdW5jdGlvbiBzZXRTdHlsZU9iamVjdChlbGVtZW50LCBzdHlsZU9iaiwgcHJldikge1xuICAgIGxldCBwcmV2T2JqO1xuICAgIGlmIChpc09iamVjdChwcmV2KSkge1xuICAgICAgICBwcmV2T2JqID0gcHJldjtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHByZXZPYmogPSB7fTtcbiAgICAgICAgZWxlbWVudC5yZW1vdmVBdHRyaWJ1dGUoJ3N0eWxlJyk7XG4gICAgfVxuICAgIGNvbnN0IGRlY2xhcmF0aW9ucyA9IG1lcmdlVmFsdWVzKHN0eWxlT2JqLCBwcmV2T2JqKTtcbiAgICBkZWNsYXJhdGlvbnMuZm9yRWFjaCgoJHZhbHVlLCBwcm9wKSA9PiBzZXRJbmxpbmVDU1NQcm9wZXJ0eVZhbHVlKGVsZW1lbnQsIHByb3AsICR2YWx1ZSkpO1xufVxuZnVuY3Rpb24gc2V0RXZlbnRMaXN0ZW5lcihlbGVtZW50LCBldmVudCwgbGlzdGVuZXIpIHtcbiAgICBpZiAodHlwZW9mIGxpc3RlbmVyID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIGFkZEV2ZW50TGlzdGVuZXIoZWxlbWVudCwgZXZlbnQsIGxpc3RlbmVyKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHJlbW92ZUV2ZW50TGlzdGVuZXIoZWxlbWVudCwgZXZlbnQpO1xuICAgIH1cbn1cbmNvbnN0IHNwZWNpYWxBdHRycyA9IG5ldyBTZXQoW1xuICAgICdrZXknLFxuICAgICdvbmNyZWF0ZScsXG4gICAgJ29udXBkYXRlJyxcbiAgICAnb25yZW5kZXInLFxuICAgICdvbnJlbW92ZScsXG5dKTtcbmNvbnN0IFBMVUdJTlNfU0VUX0FUVFJJQlVURSA9IFN5bWJvbCgpO1xuY29uc3QgcGx1Z2luc1NldEF0dHJpYnV0ZSA9IGNyZWF0ZVBsdWdpbnNTdG9yZSgpO1xuZnVuY3Rpb24gZ2V0UHJvcGVydHlWYWx1ZShvYmosIHByb3ApIHtcbiAgICByZXR1cm4gb2JqICYmIG9iai5oYXNPd25Qcm9wZXJ0eShwcm9wKSA/IG9ialtwcm9wXSA6IG51bGw7XG59XG5mdW5jdGlvbiBzeW5jQXR0cnMoZWxlbWVudCwgYXR0cnMsIHByZXYpIHtcbiAgICBjb25zdCB2YWx1ZXMgPSBtZXJnZVZhbHVlcyhhdHRycywgcHJldiB8fCB7fSk7XG4gICAgdmFsdWVzLmZvckVhY2goKHZhbHVlLCBhdHRyKSA9PiB7XG4gICAgICAgIGlmICghcGx1Z2luc1NldEF0dHJpYnV0ZS5lbXB0eSgpKSB7XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBwbHVnaW5zU2V0QXR0cmlidXRlLmFwcGx5KHtcbiAgICAgICAgICAgICAgICBlbGVtZW50LFxuICAgICAgICAgICAgICAgIGF0dHIsXG4gICAgICAgICAgICAgICAgdmFsdWUsXG4gICAgICAgICAgICAgICAgZ2V0IHByZXYoKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBnZXRQcm9wZXJ0eVZhbHVlKHByZXYsIGF0dHIpO1xuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGlmIChyZXN1bHQgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoYXR0ciA9PT0gJ2NsYXNzJyAmJiBpc09iamVjdCh2YWx1ZSkpIHtcbiAgICAgICAgICAgIHNldENsYXNzT2JqZWN0KGVsZW1lbnQsIHZhbHVlKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChhdHRyID09PSAnc3R5bGUnICYmIGlzT2JqZWN0KHZhbHVlKSkge1xuICAgICAgICAgICAgY29uc3QgcHJldlZhbHVlID0gZ2V0UHJvcGVydHlWYWx1ZShwcmV2LCBhdHRyKTtcbiAgICAgICAgICAgIHNldFN0eWxlT2JqZWN0KGVsZW1lbnQsIHZhbHVlLCBwcmV2VmFsdWUpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGF0dHIuc3RhcnRzV2l0aCgnb24nKSkge1xuICAgICAgICAgICAgY29uc3QgZXZlbnQgPSBhdHRyLnN1YnN0cmluZygyKTtcbiAgICAgICAgICAgIHNldEV2ZW50TGlzdGVuZXIoZWxlbWVudCwgZXZlbnQsIHZhbHVlKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChzcGVjaWFsQXR0cnMuaGFzKGF0dHIpKSA7XG4gICAgICAgIGVsc2UgaWYgKHZhbHVlID09IG51bGwgfHwgdmFsdWUgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICBlbGVtZW50LnJlbW92ZUF0dHJpYnV0ZShhdHRyKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGVsZW1lbnQuc2V0QXR0cmlidXRlKGF0dHIsIHZhbHVlID09PSB0cnVlID8gJycgOiBTdHJpbmcodmFsdWUpKTtcbiAgICAgICAgfVxuICAgIH0pO1xufVxuXG5jbGFzcyBMaW5rZWRMaXN0IHtcbiAgICBjb25zdHJ1Y3RvciguLi5pdGVtcykge1xuICAgICAgICB0aGlzLm5leHRzID0gbmV3IFdlYWtNYXAoKTtcbiAgICAgICAgdGhpcy5wcmV2cyA9IG5ldyBXZWFrTWFwKCk7XG4gICAgICAgIHRoaXMuZmlyc3QgPSBudWxsO1xuICAgICAgICB0aGlzLmxhc3QgPSBudWxsO1xuICAgICAgICBpdGVtcy5mb3JFYWNoKChpdGVtKSA9PiB0aGlzLnB1c2goaXRlbSkpO1xuICAgIH1cbiAgICBlbXB0eSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZmlyc3QgPT0gbnVsbDtcbiAgICB9XG4gICAgcHVzaChpdGVtKSB7XG4gICAgICAgIGlmICh0aGlzLmVtcHR5KCkpIHtcbiAgICAgICAgICAgIHRoaXMuZmlyc3QgPSBpdGVtO1xuICAgICAgICAgICAgdGhpcy5sYXN0ID0gaXRlbTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMubmV4dHMuc2V0KHRoaXMubGFzdCwgaXRlbSk7XG4gICAgICAgICAgICB0aGlzLnByZXZzLnNldChpdGVtLCB0aGlzLmxhc3QpO1xuICAgICAgICAgICAgdGhpcy5sYXN0ID0gaXRlbTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBpbnNlcnRCZWZvcmUobmV3SXRlbSwgcmVmSXRlbSkge1xuICAgICAgICBjb25zdCBwcmV2ID0gdGhpcy5iZWZvcmUocmVmSXRlbSk7XG4gICAgICAgIHRoaXMucHJldnMuc2V0KG5ld0l0ZW0sIHByZXYpO1xuICAgICAgICB0aGlzLm5leHRzLnNldChuZXdJdGVtLCByZWZJdGVtKTtcbiAgICAgICAgdGhpcy5wcmV2cy5zZXQocmVmSXRlbSwgbmV3SXRlbSk7XG4gICAgICAgIHByZXYgJiYgdGhpcy5uZXh0cy5zZXQocHJldiwgbmV3SXRlbSk7XG4gICAgICAgIHJlZkl0ZW0gPT09IHRoaXMuZmlyc3QgJiYgKHRoaXMuZmlyc3QgPSBuZXdJdGVtKTtcbiAgICB9XG4gICAgZGVsZXRlKGl0ZW0pIHtcbiAgICAgICAgY29uc3QgcHJldiA9IHRoaXMuYmVmb3JlKGl0ZW0pO1xuICAgICAgICBjb25zdCBuZXh0ID0gdGhpcy5hZnRlcihpdGVtKTtcbiAgICAgICAgcHJldiAmJiB0aGlzLm5leHRzLnNldChwcmV2LCBuZXh0KTtcbiAgICAgICAgbmV4dCAmJiB0aGlzLnByZXZzLnNldChuZXh0LCBwcmV2KTtcbiAgICAgICAgaXRlbSA9PT0gdGhpcy5maXJzdCAmJiAodGhpcy5maXJzdCA9IG5leHQpO1xuICAgICAgICBpdGVtID09PSB0aGlzLmxhc3QgJiYgKHRoaXMubGFzdCA9IHByZXYpO1xuICAgIH1cbiAgICBiZWZvcmUoaXRlbSkge1xuICAgICAgICByZXR1cm4gdGhpcy5wcmV2cy5nZXQoaXRlbSkgfHwgbnVsbDtcbiAgICB9XG4gICAgYWZ0ZXIoaXRlbSkge1xuICAgICAgICByZXR1cm4gdGhpcy5uZXh0cy5nZXQoaXRlbSkgfHwgbnVsbDtcbiAgICB9XG4gICAgbG9vcChpdGVyYXRvcikge1xuICAgICAgICBpZiAodGhpcy5lbXB0eSgpKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgbGV0IGN1cnJlbnQgPSB0aGlzLmZpcnN0O1xuICAgICAgICBkbyB7XG4gICAgICAgICAgICBpZiAoaXRlcmF0b3IoY3VycmVudCkpIHtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSB3aGlsZSAoKGN1cnJlbnQgPSB0aGlzLmFmdGVyKGN1cnJlbnQpKSk7XG4gICAgfVxuICAgIGNvcHkoKSB7XG4gICAgICAgIGNvbnN0IGxpc3QgPSBuZXcgTGlua2VkTGlzdCgpO1xuICAgICAgICB0aGlzLmxvb3AoKGl0ZW0pID0+IHtcbiAgICAgICAgICAgIGxpc3QucHVzaChpdGVtKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBsaXN0O1xuICAgIH1cbiAgICBmb3JFYWNoKGl0ZXJhdG9yKSB7XG4gICAgICAgIHRoaXMubG9vcCgoaXRlbSkgPT4ge1xuICAgICAgICAgICAgaXRlcmF0b3IoaXRlbSk7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBmaW5kKGl0ZXJhdG9yKSB7XG4gICAgICAgIGxldCByZXN1bHQgPSBudWxsO1xuICAgICAgICB0aGlzLmxvb3AoKGl0ZW0pID0+IHtcbiAgICAgICAgICAgIGlmIChpdGVyYXRvcihpdGVtKSkge1xuICAgICAgICAgICAgICAgIHJlc3VsdCA9IGl0ZW07XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICBtYXAoaXRlcmF0b3IpIHtcbiAgICAgICAgY29uc3QgcmVzdWx0cyA9IFtdO1xuICAgICAgICB0aGlzLmxvb3AoKGl0ZW0pID0+IHtcbiAgICAgICAgICAgIHJlc3VsdHMucHVzaChpdGVyYXRvcihpdGVtKSk7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcmVzdWx0cztcbiAgICB9XG59XG5cbmZ1bmN0aW9uIG1hdGNoQ2hpbGRyZW4odm5vZGUsIG9sZCkge1xuICAgIGNvbnN0IG9sZENoaWxkcmVuID0gb2xkLmNoaWxkcmVuKCk7XG4gICAgY29uc3Qgb2xkQ2hpbGRyZW5CeUtleSA9IG5ldyBNYXAoKTtcbiAgICBjb25zdCBvbGRDaGlsZHJlbldpdGhvdXRLZXkgPSBbXTtcbiAgICBvbGRDaGlsZHJlbi5mb3JFYWNoKCh2KSA9PiB7XG4gICAgICAgIGNvbnN0IGtleSA9IHYua2V5KCk7XG4gICAgICAgIGlmIChrZXkgPT0gbnVsbCkge1xuICAgICAgICAgICAgb2xkQ2hpbGRyZW5XaXRob3V0S2V5LnB1c2godik7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBvbGRDaGlsZHJlbkJ5S2V5LnNldChrZXksIHYpO1xuICAgICAgICB9XG4gICAgfSk7XG4gICAgY29uc3QgY2hpbGRyZW4gPSB2bm9kZS5jaGlsZHJlbigpO1xuICAgIGNvbnN0IG1hdGNoZXMgPSBbXTtcbiAgICBjb25zdCB1bm1hdGNoZWQgPSBuZXcgU2V0KG9sZENoaWxkcmVuKTtcbiAgICBjb25zdCBrZXlzID0gbmV3IFNldCgpO1xuICAgIGNoaWxkcmVuLmZvckVhY2goKHYpID0+IHtcbiAgICAgICAgbGV0IG1hdGNoID0gbnVsbDtcbiAgICAgICAgbGV0IGd1ZXNzID0gbnVsbDtcbiAgICAgICAgY29uc3Qga2V5ID0gdi5rZXkoKTtcbiAgICAgICAgaWYgKGtleSAhPSBudWxsKSB7XG4gICAgICAgICAgICBpZiAoa2V5cy5oYXMoa2V5KSkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignRHVwbGljYXRlIGtleScpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAga2V5cy5hZGQoa2V5KTtcbiAgICAgICAgICAgIGlmIChvbGRDaGlsZHJlbkJ5S2V5LmhhcyhrZXkpKSB7XG4gICAgICAgICAgICAgICAgZ3Vlc3MgPSBvbGRDaGlsZHJlbkJ5S2V5LmdldChrZXkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKG9sZENoaWxkcmVuV2l0aG91dEtleS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBndWVzcyA9IG9sZENoaWxkcmVuV2l0aG91dEtleS5zaGlmdCgpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh2Lm1hdGNoZXMoZ3Vlc3MpKSB7XG4gICAgICAgICAgICBtYXRjaCA9IGd1ZXNzO1xuICAgICAgICB9XG4gICAgICAgIG1hdGNoZXMucHVzaChbdiwgbWF0Y2hdKTtcbiAgICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgICAgICB1bm1hdGNoZWQuZGVsZXRlKG1hdGNoKTtcbiAgICAgICAgfVxuICAgIH0pO1xuICAgIHJldHVybiB7IG1hdGNoZXMsIHVubWF0Y2hlZCB9O1xufVxuXG5mdW5jdGlvbiBleGVjdXRlKHZub2RlLCBvbGQsIHZkb20pIHtcbiAgICBjb25zdCBkaWRNYXRjaCA9IHZub2RlICYmIG9sZCAmJiB2bm9kZS5tYXRjaGVzKG9sZCk7XG4gICAgaWYgKGRpZE1hdGNoICYmIHZub2RlLnBhcmVudCgpID09PSBvbGQucGFyZW50KCkpIHtcbiAgICAgICAgdmRvbS5yZXBsYWNlVk5vZGUob2xkLCB2bm9kZSk7XG4gICAgfVxuICAgIGVsc2UgaWYgKHZub2RlKSB7XG4gICAgICAgIHZkb20uYWRkVk5vZGUodm5vZGUpO1xuICAgIH1cbiAgICBjb25zdCBjb250ZXh0ID0gdmRvbS5nZXRWTm9kZUNvbnRleHQodm5vZGUpO1xuICAgIGNvbnN0IG9sZENvbnRleHQgPSB2ZG9tLmdldFZOb2RlQ29udGV4dChvbGQpO1xuICAgIGlmIChvbGQgJiYgIWRpZE1hdGNoKSB7XG4gICAgICAgIG9sZC5kZXRhY2gob2xkQ29udGV4dCk7XG4gICAgICAgIG9sZC5jaGlsZHJlbigpLmZvckVhY2goKHYpID0+IGV4ZWN1dGUobnVsbCwgdiwgdmRvbSkpO1xuICAgICAgICBvbGQuZGV0YWNoZWQob2xkQ29udGV4dCk7XG4gICAgfVxuICAgIGlmICh2bm9kZSAmJiAhZGlkTWF0Y2gpIHtcbiAgICAgICAgdm5vZGUuYXR0YWNoKGNvbnRleHQpO1xuICAgICAgICB2bm9kZS5jaGlsZHJlbigpLmZvckVhY2goKHYpID0+IGV4ZWN1dGUodiwgbnVsbCwgdmRvbSkpO1xuICAgICAgICB2bm9kZS5hdHRhY2hlZChjb250ZXh0KTtcbiAgICB9XG4gICAgaWYgKGRpZE1hdGNoKSB7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IHZub2RlLnVwZGF0ZShvbGQsIGNvbnRleHQpO1xuICAgICAgICBpZiAocmVzdWx0ICE9PSB2ZG9tLkxFQVZFKSB7XG4gICAgICAgICAgICBjb25zdCB7IG1hdGNoZXMsIHVubWF0Y2hlZCB9ID0gbWF0Y2hDaGlsZHJlbih2bm9kZSwgb2xkKTtcbiAgICAgICAgICAgIHVubWF0Y2hlZC5mb3JFYWNoKCh2KSA9PiBleGVjdXRlKG51bGwsIHYsIHZkb20pKTtcbiAgICAgICAgICAgIG1hdGNoZXMuZm9yRWFjaCgoW3YsIG9dKSA9PiBleGVjdXRlKHYsIG8sIHZkb20pKTtcbiAgICAgICAgICAgIHZub2RlLnVwZGF0ZWQoY29udGV4dCk7XG4gICAgICAgIH1cbiAgICB9XG59XG5cbmZ1bmN0aW9uIGlzU3BlYyh4KSB7XG4gICAgcmV0dXJuIGlzT2JqZWN0KHgpICYmIHgudHlwZSAhPSBudWxsICYmIHgubm9kZVR5cGUgPT0gbnVsbDtcbn1cbmZ1bmN0aW9uIGlzTm9kZVNwZWMoeCkge1xuICAgIHJldHVybiBpc1NwZWMoeCkgJiYgdHlwZW9mIHgudHlwZSA9PT0gJ3N0cmluZyc7XG59XG5mdW5jdGlvbiBpc0NvbXBvbmVudFNwZWMoeCkge1xuICAgIHJldHVybiBpc1NwZWMoeCkgJiYgdHlwZW9mIHgudHlwZSA9PT0gJ2Z1bmN0aW9uJztcbn1cblxuY2xhc3MgVk5vZGVCYXNlIHtcbiAgICBjb25zdHJ1Y3RvcihwYXJlbnQpIHtcbiAgICAgICAgdGhpcy5wYXJlbnRWTm9kZSA9IHBhcmVudDtcbiAgICB9XG4gICAga2V5KCkge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgcGFyZW50KHZub2RlKSB7XG4gICAgICAgIGlmICh2bm9kZSkge1xuICAgICAgICAgICAgdGhpcy5wYXJlbnRWTm9kZSA9IHZub2RlO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLnBhcmVudFZOb2RlO1xuICAgIH1cbiAgICBjaGlsZHJlbigpIHtcbiAgICAgICAgcmV0dXJuIFtdO1xuICAgIH1cbiAgICBhdHRhY2goY29udGV4dCkgeyB9XG4gICAgZGV0YWNoKGNvbnRleHQpIHsgfVxuICAgIHVwZGF0ZShvbGQsIGNvbnRleHQpIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIGF0dGFjaGVkKGNvbnRleHQpIHsgfVxuICAgIGRldGFjaGVkKGNvbnRleHQpIHsgfVxuICAgIHVwZGF0ZWQoY29udGV4dCkgeyB9XG59XG5mdW5jdGlvbiBub2RlTWF0Y2hlc1NwZWMobm9kZSwgc3BlYykge1xuICAgIHJldHVybiBub2RlIGluc3RhbmNlb2YgRWxlbWVudCAmJiBzcGVjLnR5cGUgPT09IG5vZGUudGFnTmFtZS50b0xvd2VyQ2FzZSgpO1xufVxuY29uc3QgcmVmaW5lZEVsZW1lbnRzID0gbmV3IFdlYWtNYXAoKTtcbmZ1bmN0aW9uIG1hcmtFbGVtZW50QXNSZWZpbmVkKGVsZW1lbnQsIHZkb20pIHtcbiAgICBsZXQgcmVmaW5lZDtcbiAgICBpZiAocmVmaW5lZEVsZW1lbnRzLmhhcyh2ZG9tKSkge1xuICAgICAgICByZWZpbmVkID0gcmVmaW5lZEVsZW1lbnRzLmdldCh2ZG9tKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHJlZmluZWQgPSBuZXcgV2Vha1NldCgpO1xuICAgICAgICByZWZpbmVkRWxlbWVudHMuc2V0KHZkb20sIHJlZmluZWQpO1xuICAgIH1cbiAgICByZWZpbmVkLmFkZChlbGVtZW50KTtcbn1cbmZ1bmN0aW9uIGlzRWxlbWVudFJlZmluZWQoZWxlbWVudCwgdmRvbSkge1xuICAgIHJldHVybiByZWZpbmVkRWxlbWVudHMuaGFzKHZkb20pICYmIHJlZmluZWRFbGVtZW50cy5nZXQodmRvbSkuaGFzKGVsZW1lbnQpO1xufVxuY2xhc3MgRWxlbWVudFZOb2RlIGV4dGVuZHMgVk5vZGVCYXNlIHtcbiAgICBjb25zdHJ1Y3RvcihzcGVjLCBwYXJlbnQpIHtcbiAgICAgICAgc3VwZXIocGFyZW50KTtcbiAgICAgICAgdGhpcy5zcGVjID0gc3BlYztcbiAgICB9XG4gICAgbWF0Y2hlcyhvdGhlcikge1xuICAgICAgICByZXR1cm4gKG90aGVyIGluc3RhbmNlb2YgRWxlbWVudFZOb2RlICYmIHRoaXMuc3BlYy50eXBlID09PSBvdGhlci5zcGVjLnR5cGUpO1xuICAgIH1cbiAgICBrZXkoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnNwZWMucHJvcHMua2V5O1xuICAgIH1cbiAgICBjaGlsZHJlbigpIHtcbiAgICAgICAgcmV0dXJuIFt0aGlzLmNoaWxkXTtcbiAgICB9XG4gICAgZ2V0RXhpc3RpbmdFbGVtZW50KGNvbnRleHQpIHtcbiAgICAgICAgY29uc3QgcGFyZW50ID0gY29udGV4dC5wYXJlbnQ7XG4gICAgICAgIGNvbnN0IGV4aXN0aW5nID0gY29udGV4dC5ub2RlO1xuICAgICAgICBsZXQgZWxlbWVudDtcbiAgICAgICAgaWYgKG5vZGVNYXRjaGVzU3BlYyhleGlzdGluZywgdGhpcy5zcGVjKSkge1xuICAgICAgICAgICAgZWxlbWVudCA9IGV4aXN0aW5nO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKCFpc0VsZW1lbnRSZWZpbmVkKHBhcmVudCwgY29udGV4dC52ZG9tKSAmJlxuICAgICAgICAgICAgY29udGV4dC52ZG9tLmlzRE9NTm9kZUNhcHR1cmVkKHBhcmVudCkpIHtcbiAgICAgICAgICAgIGNvbnN0IHNpYmxpbmcgPSBjb250ZXh0LnNpYmxpbmc7XG4gICAgICAgICAgICBjb25zdCBndWVzcyA9IHNpYmxpbmdcbiAgICAgICAgICAgICAgICA/IHNpYmxpbmcubmV4dEVsZW1lbnRTaWJsaW5nXG4gICAgICAgICAgICAgICAgOiBwYXJlbnQuZmlyc3RFbGVtZW50Q2hpbGQ7XG4gICAgICAgICAgICBpZiAoZ3Vlc3MgJiYgIWNvbnRleHQudmRvbS5pc0RPTU5vZGVDYXB0dXJlZChndWVzcykpIHtcbiAgICAgICAgICAgICAgICBpZiAobm9kZU1hdGNoZXNTcGVjKGd1ZXNzLCB0aGlzLnNwZWMpKSB7XG4gICAgICAgICAgICAgICAgICAgIGVsZW1lbnQgPSBndWVzcztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHBhcmVudC5yZW1vdmVDaGlsZChndWVzcyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBlbGVtZW50O1xuICAgIH1cbiAgICBhdHRhY2goY29udGV4dCkge1xuICAgICAgICBsZXQgZWxlbWVudDtcbiAgICAgICAgY29uc3QgZXhpc3RpbmcgPSB0aGlzLmdldEV4aXN0aW5nRWxlbWVudChjb250ZXh0KTtcbiAgICAgICAgaWYgKGV4aXN0aW5nKSB7XG4gICAgICAgICAgICBlbGVtZW50ID0gZXhpc3Rpbmc7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBlbGVtZW50ID0gY3JlYXRlRWxlbWVudCh0aGlzLnNwZWMsIGNvbnRleHQucGFyZW50KTtcbiAgICAgICAgICAgIG1hcmtFbGVtZW50QXNSZWZpbmVkKGVsZW1lbnQsIGNvbnRleHQudmRvbSk7XG4gICAgICAgIH1cbiAgICAgICAgc3luY0F0dHJzKGVsZW1lbnQsIHRoaXMuc3BlYy5wcm9wcywgbnVsbCk7XG4gICAgICAgIHRoaXMuY2hpbGQgPSBjcmVhdGVET01WTm9kZShlbGVtZW50LCB0aGlzLnNwZWMuY2hpbGRyZW4sIHRoaXMsIGZhbHNlKTtcbiAgICB9XG4gICAgdXBkYXRlKHByZXYsIGNvbnRleHQpIHtcbiAgICAgICAgY29uc3QgcHJldkNvbnRleHQgPSBjb250ZXh0LnZkb20uZ2V0Vk5vZGVDb250ZXh0KHByZXYpO1xuICAgICAgICBjb25zdCBlbGVtZW50ID0gcHJldkNvbnRleHQubm9kZTtcbiAgICAgICAgc3luY0F0dHJzKGVsZW1lbnQsIHRoaXMuc3BlYy5wcm9wcywgcHJldi5zcGVjLnByb3BzKTtcbiAgICAgICAgdGhpcy5jaGlsZCA9IGNyZWF0ZURPTVZOb2RlKGVsZW1lbnQsIHRoaXMuc3BlYy5jaGlsZHJlbiwgdGhpcywgZmFsc2UpO1xuICAgIH1cbiAgICBhdHRhY2hlZChjb250ZXh0KSB7XG4gICAgICAgIGNvbnN0IHsgb25jcmVhdGUsIG9ucmVuZGVyIH0gPSB0aGlzLnNwZWMucHJvcHM7XG4gICAgICAgIGlmIChvbmNyZWF0ZSkge1xuICAgICAgICAgICAgb25jcmVhdGUoY29udGV4dC5ub2RlKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAob25yZW5kZXIpIHtcbiAgICAgICAgICAgIG9ucmVuZGVyKGNvbnRleHQubm9kZSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZGV0YWNoZWQoY29udGV4dCkge1xuICAgICAgICBjb25zdCB7IG9ucmVtb3ZlIH0gPSB0aGlzLnNwZWMucHJvcHM7XG4gICAgICAgIGlmIChvbnJlbW92ZSkge1xuICAgICAgICAgICAgb25yZW1vdmUoY29udGV4dC5ub2RlKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICB1cGRhdGVkKGNvbnRleHQpIHtcbiAgICAgICAgY29uc3QgeyBvbnVwZGF0ZSwgb25yZW5kZXIgfSA9IHRoaXMuc3BlYy5wcm9wcztcbiAgICAgICAgaWYgKG9udXBkYXRlKSB7XG4gICAgICAgICAgICBvbnVwZGF0ZShjb250ZXh0Lm5vZGUpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChvbnJlbmRlcikge1xuICAgICAgICAgICAgb25yZW5kZXIoY29udGV4dC5ub2RlKTtcbiAgICAgICAgfVxuICAgIH1cbn1cbmNvbnN0IHN5bWJvbHMgPSB7XG4gICAgQ1JFQVRFRDogU3ltYm9sKCksXG4gICAgUkVNT1ZFRDogU3ltYm9sKCksXG4gICAgVVBEQVRFRDogU3ltYm9sKCksXG4gICAgUkVOREVSRUQ6IFN5bWJvbCgpLFxuICAgIEFDVElWRTogU3ltYm9sKCksXG4gICAgREVGQVVMVFNfQVNTSUdORUQ6IFN5bWJvbCgpLFxufTtcbmNvbnN0IGRvbVBsdWdpbnMgPSBbXG4gICAgW1BMVUdJTlNfQ1JFQVRFX0VMRU1FTlQsIHBsdWdpbnNDcmVhdGVFbGVtZW50XSxcbiAgICBbUExVR0lOU19TRVRfQVRUUklCVVRFLCBwbHVnaW5zU2V0QXR0cmlidXRlXSxcbl07XG5jbGFzcyBDb21wb25lbnRWTm9kZSBleHRlbmRzIFZOb2RlQmFzZSB7XG4gICAgY29uc3RydWN0b3Ioc3BlYywgcGFyZW50KSB7XG4gICAgICAgIHN1cGVyKHBhcmVudCk7XG4gICAgICAgIHRoaXMubG9jayA9IGZhbHNlO1xuICAgICAgICB0aGlzLnNwZWMgPSBzcGVjO1xuICAgICAgICB0aGlzLnByZXYgPSBudWxsO1xuICAgICAgICB0aGlzLnN0b3JlID0ge307XG4gICAgICAgIHRoaXMuc3RvcmVbc3ltYm9scy5BQ1RJVkVdID0gdGhpcztcbiAgICB9XG4gICAgbWF0Y2hlcyhvdGhlcikge1xuICAgICAgICByZXR1cm4gKG90aGVyIGluc3RhbmNlb2YgQ29tcG9uZW50Vk5vZGUgJiZcbiAgICAgICAgICAgIHRoaXMuc3BlYy50eXBlID09PSBvdGhlci5zcGVjLnR5cGUpO1xuICAgIH1cbiAgICBrZXkoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnNwZWMucHJvcHMua2V5O1xuICAgIH1cbiAgICBjaGlsZHJlbigpIHtcbiAgICAgICAgcmV0dXJuIFt0aGlzLmNoaWxkXTtcbiAgICB9XG4gICAgY3JlYXRlQ29udGV4dChjb250ZXh0KSB7XG4gICAgICAgIGNvbnN0IHsgcGFyZW50IH0gPSBjb250ZXh0O1xuICAgICAgICBjb25zdCB7IHNwZWMsIHByZXYsIHN0b3JlIH0gPSB0aGlzO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgc3BlYyxcbiAgICAgICAgICAgIHByZXYsXG4gICAgICAgICAgICBzdG9yZSxcbiAgICAgICAgICAgIGdldCBub2RlKCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBjb250ZXh0Lm5vZGU7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZ2V0IG5vZGVzKCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBjb250ZXh0Lm5vZGVzO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHBhcmVudCxcbiAgICAgICAgICAgIG9uQ3JlYXRlOiAoZm4pID0+IChzdG9yZVtzeW1ib2xzLkNSRUFURURdID0gZm4pLFxuICAgICAgICAgICAgb25VcGRhdGU6IChmbikgPT4gKHN0b3JlW3N5bWJvbHMuVVBEQVRFRF0gPSBmbiksXG4gICAgICAgICAgICBvblJlbW92ZTogKGZuKSA9PiAoc3RvcmVbc3ltYm9scy5SRU1PVkVEXSA9IGZuKSxcbiAgICAgICAgICAgIG9uUmVuZGVyOiAoZm4pID0+IChzdG9yZVtzeW1ib2xzLlJFTkRFUkVEXSA9IGZuKSxcbiAgICAgICAgICAgIHJlZnJlc2g6ICgpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBhY3RpdmVWTm9kZSA9IHN0b3JlW3N5bWJvbHMuQUNUSVZFXTtcbiAgICAgICAgICAgICAgICBhY3RpdmVWTm9kZS5yZWZyZXNoKGNvbnRleHQpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGxlYXZlOiAoKSA9PiBjb250ZXh0LnZkb20uTEVBVkUsXG4gICAgICAgICAgICBnZXRTdG9yZTogKGRlZmF1bHRzKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGRlZmF1bHRzICYmICFzdG9yZVtzeW1ib2xzLkRFRkFVTFRTX0FTU0lHTkVEXSkge1xuICAgICAgICAgICAgICAgICAgICBPYmplY3QuZW50cmllcyhkZWZhdWx0cykuZm9yRWFjaCgoW3Byb3AsIHZhbHVlXSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgc3RvcmVbcHJvcF0gPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHN0b3JlW3N5bWJvbHMuREVGQVVMVFNfQVNTSUdORURdID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIHN0b3JlO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgfTtcbiAgICB9XG4gICAgdW5ib3goY29udGV4dCkge1xuICAgICAgICBjb25zdCBDb21wb25lbnQgPSB0aGlzLnNwZWMudHlwZTtcbiAgICAgICAgY29uc3QgcHJvcHMgPSB0aGlzLnNwZWMucHJvcHM7XG4gICAgICAgIGNvbnN0IGNoaWxkcmVuID0gdGhpcy5zcGVjLmNoaWxkcmVuO1xuICAgICAgICB0aGlzLmxvY2sgPSB0cnVlO1xuICAgICAgICBjb25zdCBwcmV2Q29udGV4dCA9IENvbXBvbmVudFZOb2RlLmNvbnRleHQ7XG4gICAgICAgIENvbXBvbmVudFZOb2RlLmNvbnRleHQgPSB0aGlzLmNyZWF0ZUNvbnRleHQoY29udGV4dCk7XG4gICAgICAgIGxldCB1bmJveGVkID0gbnVsbDtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHVuYm94ZWQgPSBDb21wb25lbnQocHJvcHMsIC4uLmNoaWxkcmVuKTtcbiAgICAgICAgfVxuICAgICAgICBmaW5hbGx5IHtcbiAgICAgICAgICAgIENvbXBvbmVudFZOb2RlLmNvbnRleHQgPSBwcmV2Q29udGV4dDtcbiAgICAgICAgICAgIHRoaXMubG9jayA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB1bmJveGVkO1xuICAgIH1cbiAgICByZWZyZXNoKGNvbnRleHQpIHtcbiAgICAgICAgaWYgKHRoaXMubG9jaykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdDYWxsaW5nIHJlZnJlc2ggZHVyaW5nIHVuYm94aW5nIGNhdXNlcyBpbmZpbml0ZSBsb29wJyk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5wcmV2ID0gdGhpcy5zcGVjO1xuICAgICAgICBjb25zdCBsYXRlc3RDb250ZXh0ID0gY29udGV4dC52ZG9tLmdldFZOb2RlQ29udGV4dCh0aGlzKTtcbiAgICAgICAgY29uc3QgdW5ib3hlZCA9IHRoaXMudW5ib3gobGF0ZXN0Q29udGV4dCk7XG4gICAgICAgIGlmICh1bmJveGVkID09PSBjb250ZXh0LnZkb20uTEVBVkUpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBwcmV2Q2hpbGQgPSB0aGlzLmNoaWxkO1xuICAgICAgICB0aGlzLmNoaWxkID0gY3JlYXRlVk5vZGUodW5ib3hlZCwgdGhpcyk7XG4gICAgICAgIGNvbnRleHQudmRvbS5leGVjdXRlKHRoaXMuY2hpbGQsIHByZXZDaGlsZCk7XG4gICAgICAgIHRoaXMudXBkYXRlZChjb250ZXh0KTtcbiAgICB9XG4gICAgYWRkUGx1Z2lucygpIHtcbiAgICAgICAgYWRkQ29tcG9uZW50UGx1Z2lucyh0aGlzLnNwZWMudHlwZSwgZG9tUGx1Z2lucyk7XG4gICAgfVxuICAgIGRlbGV0ZVBsdWdpbnMoKSB7XG4gICAgICAgIGRlbGV0ZUNvbXBvbmVudFBsdWdpbnModGhpcy5zcGVjLnR5cGUsIGRvbVBsdWdpbnMpO1xuICAgIH1cbiAgICBhdHRhY2goY29udGV4dCkge1xuICAgICAgICB0aGlzLmFkZFBsdWdpbnMoKTtcbiAgICAgICAgY29uc3QgdW5ib3hlZCA9IHRoaXMudW5ib3goY29udGV4dCk7XG4gICAgICAgIGNvbnN0IGNoaWxkU3BlYyA9IHVuYm94ZWQgPT09IGNvbnRleHQudmRvbS5MRUFWRSA/IG51bGwgOiB1bmJveGVkO1xuICAgICAgICB0aGlzLmNoaWxkID0gY3JlYXRlVk5vZGUoY2hpbGRTcGVjLCB0aGlzKTtcbiAgICB9XG4gICAgdXBkYXRlKHByZXYsIGNvbnRleHQpIHtcbiAgICAgICAgdGhpcy5zdG9yZSA9IHByZXYuc3RvcmU7XG4gICAgICAgIHRoaXMucHJldiA9IHByZXYuc3BlYztcbiAgICAgICAgdGhpcy5zdG9yZVtzeW1ib2xzLkFDVElWRV0gPSB0aGlzO1xuICAgICAgICBjb25zdCBwcmV2Q29udGV4dCA9IGNvbnRleHQudmRvbS5nZXRWTm9kZUNvbnRleHQocHJldik7XG4gICAgICAgIHRoaXMuYWRkUGx1Z2lucygpO1xuICAgICAgICBjb25zdCB1bmJveGVkID0gdGhpcy51bmJveChwcmV2Q29udGV4dCk7XG4gICAgICAgIGxldCByZXN1bHQgPSBudWxsO1xuICAgICAgICBpZiAodW5ib3hlZCA9PT0gY29udGV4dC52ZG9tLkxFQVZFKSB7XG4gICAgICAgICAgICByZXN1bHQgPSB1bmJveGVkO1xuICAgICAgICAgICAgdGhpcy5jaGlsZCA9IHByZXYuY2hpbGQ7XG4gICAgICAgICAgICBjb250ZXh0LnZkb20uYWRvcHRWTm9kZSh0aGlzLmNoaWxkLCB0aGlzKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuY2hpbGQgPSBjcmVhdGVWTm9kZSh1bmJveGVkLCB0aGlzKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICBoYW5kbGUoZXZlbnQsIGNvbnRleHQpIHtcbiAgICAgICAgY29uc3QgZm4gPSB0aGlzLnN0b3JlW2V2ZW50XTtcbiAgICAgICAgaWYgKGZuKSB7XG4gICAgICAgICAgICBjb25zdCBub2RlcyA9IGNvbnRleHQubm9kZXMubGVuZ3RoID09PSAwID8gW251bGxdIDogY29udGV4dC5ub2RlcztcbiAgICAgICAgICAgIGZuKC4uLm5vZGVzKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBhdHRhY2hlZChjb250ZXh0KSB7XG4gICAgICAgIHRoaXMuZGVsZXRlUGx1Z2lucygpO1xuICAgICAgICB0aGlzLmhhbmRsZShzeW1ib2xzLkNSRUFURUQsIGNvbnRleHQpO1xuICAgICAgICB0aGlzLmhhbmRsZShzeW1ib2xzLlJFTkRFUkVELCBjb250ZXh0KTtcbiAgICB9XG4gICAgZGV0YWNoZWQoY29udGV4dCkge1xuICAgICAgICB0aGlzLmhhbmRsZShzeW1ib2xzLlJFTU9WRUQsIGNvbnRleHQpO1xuICAgIH1cbiAgICB1cGRhdGVkKGNvbnRleHQpIHtcbiAgICAgICAgdGhpcy5kZWxldGVQbHVnaW5zKCk7XG4gICAgICAgIHRoaXMuaGFuZGxlKHN5bWJvbHMuVVBEQVRFRCwgY29udGV4dCk7XG4gICAgICAgIHRoaXMuaGFuZGxlKHN5bWJvbHMuUkVOREVSRUQsIGNvbnRleHQpO1xuICAgIH1cbn1cbkNvbXBvbmVudFZOb2RlLmNvbnRleHQgPSBudWxsO1xuZnVuY3Rpb24gZ2V0Q29tcG9uZW50Q29udGV4dCgpIHtcbiAgICByZXR1cm4gQ29tcG9uZW50Vk5vZGUuY29udGV4dDtcbn1cbmNsYXNzIFRleHRWTm9kZSBleHRlbmRzIFZOb2RlQmFzZSB7XG4gICAgY29uc3RydWN0b3IodGV4dCwgcGFyZW50KSB7XG4gICAgICAgIHN1cGVyKHBhcmVudCk7XG4gICAgICAgIHRoaXMudGV4dCA9IHRleHQ7XG4gICAgfVxuICAgIG1hdGNoZXMob3RoZXIpIHtcbiAgICAgICAgcmV0dXJuIG90aGVyIGluc3RhbmNlb2YgVGV4dFZOb2RlO1xuICAgIH1cbiAgICBjaGlsZHJlbigpIHtcbiAgICAgICAgcmV0dXJuIFt0aGlzLmNoaWxkXTtcbiAgICB9XG4gICAgZ2V0RXhpc3RpbmdOb2RlKGNvbnRleHQpIHtcbiAgICAgICAgY29uc3QgeyBwYXJlbnQgfSA9IGNvbnRleHQ7XG4gICAgICAgIGxldCBub2RlO1xuICAgICAgICBpZiAoY29udGV4dC5ub2RlIGluc3RhbmNlb2YgVGV4dCkge1xuICAgICAgICAgICAgbm9kZSA9IGNvbnRleHQubm9kZTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmICghaXNFbGVtZW50UmVmaW5lZChwYXJlbnQsIGNvbnRleHQudmRvbSkgJiZcbiAgICAgICAgICAgIGNvbnRleHQudmRvbS5pc0RPTU5vZGVDYXB0dXJlZChwYXJlbnQpKSB7XG4gICAgICAgICAgICBjb25zdCBzaWJsaW5nID0gY29udGV4dC5zaWJsaW5nO1xuICAgICAgICAgICAgY29uc3QgZ3Vlc3MgPSBzaWJsaW5nID8gc2libGluZy5uZXh0U2libGluZyA6IHBhcmVudC5maXJzdENoaWxkO1xuICAgICAgICAgICAgaWYgKGd1ZXNzICYmXG4gICAgICAgICAgICAgICAgIWNvbnRleHQudmRvbS5pc0RPTU5vZGVDYXB0dXJlZChndWVzcykgJiZcbiAgICAgICAgICAgICAgICBndWVzcyBpbnN0YW5jZW9mIFRleHQpIHtcbiAgICAgICAgICAgICAgICBub2RlID0gZ3Vlc3M7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5vZGU7XG4gICAgfVxuICAgIGF0dGFjaChjb250ZXh0KSB7XG4gICAgICAgIGNvbnN0IGV4aXN0aW5nID0gdGhpcy5nZXRFeGlzdGluZ05vZGUoY29udGV4dCk7XG4gICAgICAgIGxldCBub2RlO1xuICAgICAgICBpZiAoZXhpc3RpbmcpIHtcbiAgICAgICAgICAgIG5vZGUgPSBleGlzdGluZztcbiAgICAgICAgICAgIG5vZGUudGV4dENvbnRlbnQgPSB0aGlzLnRleHQ7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBub2RlID0gZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUodGhpcy50ZXh0KTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmNoaWxkID0gY3JlYXRlVk5vZGUobm9kZSwgdGhpcyk7XG4gICAgfVxuICAgIHVwZGF0ZShwcmV2LCBjb250ZXh0KSB7XG4gICAgICAgIGNvbnN0IHByZXZDb250ZXh0ID0gY29udGV4dC52ZG9tLmdldFZOb2RlQ29udGV4dChwcmV2KTtcbiAgICAgICAgY29uc3QgeyBub2RlIH0gPSBwcmV2Q29udGV4dDtcbiAgICAgICAgaWYgKHRoaXMudGV4dCAhPT0gcHJldi50ZXh0KSB7XG4gICAgICAgICAgICBub2RlLnRleHRDb250ZW50ID0gdGhpcy50ZXh0O1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuY2hpbGQgPSBjcmVhdGVWTm9kZShub2RlLCB0aGlzKTtcbiAgICB9XG59XG5jbGFzcyBJbmxpbmVGdW5jdGlvblZOb2RlIGV4dGVuZHMgVk5vZGVCYXNlIHtcbiAgICBjb25zdHJ1Y3RvcihmbiwgcGFyZW50KSB7XG4gICAgICAgIHN1cGVyKHBhcmVudCk7XG4gICAgICAgIHRoaXMuZm4gPSBmbjtcbiAgICB9XG4gICAgbWF0Y2hlcyhvdGhlcikge1xuICAgICAgICByZXR1cm4gb3RoZXIgaW5zdGFuY2VvZiBJbmxpbmVGdW5jdGlvblZOb2RlO1xuICAgIH1cbiAgICBjaGlsZHJlbigpIHtcbiAgICAgICAgcmV0dXJuIFt0aGlzLmNoaWxkXTtcbiAgICB9XG4gICAgY2FsbChjb250ZXh0KSB7XG4gICAgICAgIGNvbnN0IGZuID0gdGhpcy5mbjtcbiAgICAgICAgY29uc3QgaW5saW5lRm5Db250ZXh0ID0ge1xuICAgICAgICAgICAgcGFyZW50OiBjb250ZXh0LnBhcmVudCxcbiAgICAgICAgICAgIGdldCBub2RlKCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBjb250ZXh0Lm5vZGU7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZ2V0IG5vZGVzKCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBjb250ZXh0Lm5vZGVzO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgfTtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gZm4oaW5saW5lRm5Db250ZXh0KTtcbiAgICAgICAgdGhpcy5jaGlsZCA9IGNyZWF0ZVZOb2RlKHJlc3VsdCwgdGhpcyk7XG4gICAgfVxuICAgIGF0dGFjaChjb250ZXh0KSB7XG4gICAgICAgIHRoaXMuY2FsbChjb250ZXh0KTtcbiAgICB9XG4gICAgdXBkYXRlKHByZXYsIGNvbnRleHQpIHtcbiAgICAgICAgY29uc3QgcHJldkNvbnRleHQgPSBjb250ZXh0LnZkb20uZ2V0Vk5vZGVDb250ZXh0KHByZXYpO1xuICAgICAgICB0aGlzLmNhbGwocHJldkNvbnRleHQpO1xuICAgIH1cbn1cbmNsYXNzIE51bGxWTm9kZSBleHRlbmRzIFZOb2RlQmFzZSB7XG4gICAgbWF0Y2hlcyhvdGhlcikge1xuICAgICAgICByZXR1cm4gb3RoZXIgaW5zdGFuY2VvZiBOdWxsVk5vZGU7XG4gICAgfVxufVxuY2xhc3MgRE9NVk5vZGUgZXh0ZW5kcyBWTm9kZUJhc2Uge1xuICAgIGNvbnN0cnVjdG9yKG5vZGUsIGNoaWxkU3BlY3MsIHBhcmVudCwgaXNOYXRpdmUpIHtcbiAgICAgICAgc3VwZXIocGFyZW50KTtcbiAgICAgICAgdGhpcy5ub2RlID0gbm9kZTtcbiAgICAgICAgdGhpcy5jaGlsZFNwZWNzID0gY2hpbGRTcGVjcztcbiAgICAgICAgdGhpcy5pc05hdGl2ZSA9IGlzTmF0aXZlO1xuICAgIH1cbiAgICBtYXRjaGVzKG90aGVyKSB7XG4gICAgICAgIHJldHVybiBvdGhlciBpbnN0YW5jZW9mIERPTVZOb2RlICYmIHRoaXMubm9kZSA9PT0gb3RoZXIubm9kZTtcbiAgICB9XG4gICAgd3JhcCgpIHtcbiAgICAgICAgdGhpcy5jaGlsZFZOb2RlcyA9IHRoaXMuY2hpbGRTcGVjcy5tYXAoKHNwZWMpID0+IGNyZWF0ZVZOb2RlKHNwZWMsIHRoaXMpKTtcbiAgICB9XG4gICAgaW5zZXJ0Tm9kZShjb250ZXh0KSB7XG4gICAgICAgIGNvbnN0IHsgcGFyZW50LCBzaWJsaW5nIH0gPSBjb250ZXh0O1xuICAgICAgICBjb25zdCBzaG91bGRJbnNlcnQgPSAhKHBhcmVudCA9PT0gdGhpcy5ub2RlLnBhcmVudEVsZW1lbnQgJiZcbiAgICAgICAgICAgIHNpYmxpbmcgPT09IHRoaXMubm9kZS5wcmV2aW91c1NpYmxpbmcpO1xuICAgICAgICBpZiAoc2hvdWxkSW5zZXJ0KSB7XG4gICAgICAgICAgICBjb25zdCB0YXJnZXQgPSBzaWJsaW5nID8gc2libGluZy5uZXh0U2libGluZyA6IHBhcmVudC5maXJzdENoaWxkO1xuICAgICAgICAgICAgcGFyZW50Lmluc2VydEJlZm9yZSh0aGlzLm5vZGUsIHRhcmdldCk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgYXR0YWNoKGNvbnRleHQpIHtcbiAgICAgICAgdGhpcy53cmFwKCk7XG4gICAgICAgIHRoaXMuaW5zZXJ0Tm9kZShjb250ZXh0KTtcbiAgICB9XG4gICAgZGV0YWNoKGNvbnRleHQpIHtcbiAgICAgICAgY29udGV4dC5wYXJlbnQucmVtb3ZlQ2hpbGQodGhpcy5ub2RlKTtcbiAgICB9XG4gICAgdXBkYXRlKHByZXYsIGNvbnRleHQpIHtcbiAgICAgICAgdGhpcy53cmFwKCk7XG4gICAgICAgIHRoaXMuaW5zZXJ0Tm9kZShjb250ZXh0KTtcbiAgICB9XG4gICAgY2xlYW51cERPTUNoaWxkcmVuKGNvbnRleHQpIHtcbiAgICAgICAgY29uc3QgZWxlbWVudCA9IHRoaXMubm9kZTtcbiAgICAgICAgZm9yIChsZXQgY3VycmVudCA9IGVsZW1lbnQubGFzdENoaWxkOyBjdXJyZW50ICE9IG51bGw7KSB7XG4gICAgICAgICAgICBpZiAoY29udGV4dC52ZG9tLmlzRE9NTm9kZUNhcHR1cmVkKGN1cnJlbnQpKSB7XG4gICAgICAgICAgICAgICAgY3VycmVudCA9IGN1cnJlbnQucHJldmlvdXNTaWJsaW5nO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcHJldiA9IGN1cnJlbnQucHJldmlvdXNTaWJsaW5nO1xuICAgICAgICAgICAgICAgIGVsZW1lbnQucmVtb3ZlQ2hpbGQoY3VycmVudCk7XG4gICAgICAgICAgICAgICAgY3VycmVudCA9IHByZXY7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmVmaW5lKGNvbnRleHQpIHtcbiAgICAgICAgaWYgKCF0aGlzLmlzTmF0aXZlKSB7XG4gICAgICAgICAgICB0aGlzLmNsZWFudXBET01DaGlsZHJlbihjb250ZXh0KTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBlbGVtZW50ID0gdGhpcy5ub2RlO1xuICAgICAgICBtYXJrRWxlbWVudEFzUmVmaW5lZChlbGVtZW50LCBjb250ZXh0LnZkb20pO1xuICAgIH1cbiAgICBhdHRhY2hlZChjb250ZXh0KSB7XG4gICAgICAgIGNvbnN0IHsgbm9kZSB9ID0gdGhpcztcbiAgICAgICAgaWYgKG5vZGUgaW5zdGFuY2VvZiBFbGVtZW50ICYmXG4gICAgICAgICAgICAhaXNFbGVtZW50UmVmaW5lZChub2RlLCBjb250ZXh0LnZkb20pICYmXG4gICAgICAgICAgICBjb250ZXh0LnZkb20uaXNET01Ob2RlQ2FwdHVyZWQobm9kZSkpIHtcbiAgICAgICAgICAgIHRoaXMucmVmaW5lKGNvbnRleHQpO1xuICAgICAgICB9XG4gICAgfVxuICAgIGNoaWxkcmVuKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5jaGlsZFZOb2RlcztcbiAgICB9XG59XG5mdW5jdGlvbiBpc0RPTVZOb2RlKHYpIHtcbiAgICByZXR1cm4gdiBpbnN0YW5jZW9mIERPTVZOb2RlO1xufVxuZnVuY3Rpb24gY3JlYXRlRE9NVk5vZGUobm9kZSwgY2hpbGRTcGVjcywgcGFyZW50LCBpc05hdGl2ZSkge1xuICAgIHJldHVybiBuZXcgRE9NVk5vZGUobm9kZSwgY2hpbGRTcGVjcywgcGFyZW50LCBpc05hdGl2ZSk7XG59XG5jbGFzcyBBcnJheVZOb2RlIGV4dGVuZHMgVk5vZGVCYXNlIHtcbiAgICBjb25zdHJ1Y3RvcihpdGVtcywga2V5LCBwYXJlbnQpIHtcbiAgICAgICAgc3VwZXIocGFyZW50KTtcbiAgICAgICAgdGhpcy5pdGVtcyA9IGl0ZW1zO1xuICAgICAgICB0aGlzLmlkID0ga2V5O1xuICAgIH1cbiAgICBtYXRjaGVzKG90aGVyKSB7XG4gICAgICAgIHJldHVybiBvdGhlciBpbnN0YW5jZW9mIEFycmF5Vk5vZGU7XG4gICAgfVxuICAgIGtleSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuaWQ7XG4gICAgfVxuICAgIGNoaWxkcmVuKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5jaGlsZFZOb2RlcztcbiAgICB9XG4gICAgd3JhcCgpIHtcbiAgICAgICAgdGhpcy5jaGlsZFZOb2RlcyA9IHRoaXMuaXRlbXMubWFwKChzcGVjKSA9PiBjcmVhdGVWTm9kZShzcGVjLCB0aGlzKSk7XG4gICAgfVxuICAgIGF0dGFjaCgpIHtcbiAgICAgICAgdGhpcy53cmFwKCk7XG4gICAgfVxuICAgIHVwZGF0ZSgpIHtcbiAgICAgICAgdGhpcy53cmFwKCk7XG4gICAgfVxufVxuZnVuY3Rpb24gY3JlYXRlVk5vZGUoc3BlYywgcGFyZW50KSB7XG4gICAgaWYgKGlzTm9kZVNwZWMoc3BlYykpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBFbGVtZW50Vk5vZGUoc3BlYywgcGFyZW50KTtcbiAgICB9XG4gICAgaWYgKGlzQ29tcG9uZW50U3BlYyhzcGVjKSkge1xuICAgICAgICBpZiAoc3BlYy50eXBlID09PSBBcnJheSkge1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBBcnJheVZOb2RlKHNwZWMuY2hpbGRyZW4sIHNwZWMucHJvcHMua2V5LCBwYXJlbnQpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBuZXcgQ29tcG9uZW50Vk5vZGUoc3BlYywgcGFyZW50KTtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBzcGVjID09PSAnc3RyaW5nJykge1xuICAgICAgICByZXR1cm4gbmV3IFRleHRWTm9kZShzcGVjLCBwYXJlbnQpO1xuICAgIH1cbiAgICBpZiAoc3BlYyA9PSBudWxsKSB7XG4gICAgICAgIHJldHVybiBuZXcgTnVsbFZOb2RlKHBhcmVudCk7XG4gICAgfVxuICAgIGlmICh0eXBlb2Ygc3BlYyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICByZXR1cm4gbmV3IElubGluZUZ1bmN0aW9uVk5vZGUoc3BlYywgcGFyZW50KTtcbiAgICB9XG4gICAgaWYgKHNwZWMgaW5zdGFuY2VvZiBOb2RlKSB7XG4gICAgICAgIHJldHVybiBjcmVhdGVET01WTm9kZShzcGVjLCBbXSwgcGFyZW50LCB0cnVlKTtcbiAgICB9XG4gICAgaWYgKEFycmF5LmlzQXJyYXkoc3BlYykpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBBcnJheVZOb2RlKHNwZWMsIG51bGwsIHBhcmVudCk7XG4gICAgfVxuICAgIHRocm93IG5ldyBFcnJvcignVW5hYmxlIHRvIGNyZWF0ZSB2aXJ0dWFsIG5vZGUgZm9yIHNwZWMnKTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlVkRPTShyb290Tm9kZSkge1xuICAgIGNvbnN0IGNvbnRleHRzID0gbmV3IFdlYWtNYXAoKTtcbiAgICBjb25zdCBodWJzID0gbmV3IFdlYWtNYXAoKTtcbiAgICBjb25zdCBwYXJlbnROb2RlcyA9IG5ldyBXZWFrTWFwKCk7XG4gICAgY29uc3QgcGFzc2luZ0xpbmtzID0gbmV3IFdlYWtNYXAoKTtcbiAgICBjb25zdCBsaW5rZWRQYXJlbnRzID0gbmV3IFdlYWtTZXQoKTtcbiAgICBjb25zdCBMRUFWRSA9IFN5bWJvbCgpO1xuICAgIGZ1bmN0aW9uIGV4ZWN1dGUkMSh2bm9kZSwgb2xkKSB7XG4gICAgICAgIGV4ZWN1dGUodm5vZGUsIG9sZCwgdmRvbSk7XG4gICAgfVxuICAgIGZ1bmN0aW9uIGNyZWF0Vk5vZGVDb250ZXh0KHZub2RlKSB7XG4gICAgICAgIGNvbnN0IHBhcmVudE5vZGUgPSBwYXJlbnROb2Rlcy5nZXQodm5vZGUpO1xuICAgICAgICBjb250ZXh0cy5zZXQodm5vZGUsIHtcbiAgICAgICAgICAgIHBhcmVudDogcGFyZW50Tm9kZSxcbiAgICAgICAgICAgIGdldCBub2RlKCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGxpbmtlZCA9IHBhc3NpbmdMaW5rc1xuICAgICAgICAgICAgICAgICAgICAuZ2V0KHZub2RlKVxuICAgICAgICAgICAgICAgICAgICAuZmluZCgobGluaykgPT4gbGluay5ub2RlICE9IG51bGwpO1xuICAgICAgICAgICAgICAgIHJldHVybiBsaW5rZWQgPyBsaW5rZWQubm9kZSA6IG51bGw7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZ2V0IG5vZGVzKCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBwYXNzaW5nTGlua3NcbiAgICAgICAgICAgICAgICAgICAgLmdldCh2bm9kZSlcbiAgICAgICAgICAgICAgICAgICAgLm1hcCgobGluaykgPT4gbGluay5ub2RlKVxuICAgICAgICAgICAgICAgICAgICAuZmlsdGVyKChub2RlKSA9PiBub2RlKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBnZXQgc2libGluZygpIHtcbiAgICAgICAgICAgICAgICBpZiAocGFyZW50Tm9kZSA9PT0gcm9vdE5vZGUucGFyZW50RWxlbWVudCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcGFzc2luZ0xpbmtzLmdldCh2bm9kZSkuZmlyc3Qubm9kZS5wcmV2aW91c1NpYmxpbmc7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IGh1YiA9IGh1YnMuZ2V0KHBhcmVudE5vZGUpO1xuICAgICAgICAgICAgICAgIGxldCBjdXJyZW50ID0gcGFzc2luZ0xpbmtzLmdldCh2bm9kZSkuZmlyc3Q7XG4gICAgICAgICAgICAgICAgd2hpbGUgKChjdXJyZW50ID0gaHViLmxpbmtzLmJlZm9yZShjdXJyZW50KSkpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGN1cnJlbnQubm9kZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGN1cnJlbnQubm9kZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB2ZG9tLFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgZnVuY3Rpb24gY3JlYXRlUm9vdFZOb2RlTGlua3Modm5vZGUpIHtcbiAgICAgICAgY29uc3QgcGFyZW50Tm9kZSA9IHJvb3ROb2RlLnBhcmVudEVsZW1lbnQgfHwgZG9jdW1lbnQuY3JlYXRlRG9jdW1lbnRGcmFnbWVudCgpO1xuICAgICAgICBjb25zdCBub2RlID0gcm9vdE5vZGU7XG4gICAgICAgIGNvbnN0IGxpbmtzID0gbmV3IExpbmtlZExpc3Qoe1xuICAgICAgICAgICAgcGFyZW50Tm9kZSxcbiAgICAgICAgICAgIG5vZGUsXG4gICAgICAgIH0pO1xuICAgICAgICBwYXNzaW5nTGlua3Muc2V0KHZub2RlLCBsaW5rcy5jb3B5KCkpO1xuICAgICAgICBwYXJlbnROb2Rlcy5zZXQodm5vZGUsIHBhcmVudE5vZGUpO1xuICAgICAgICBodWJzLnNldChwYXJlbnROb2RlLCB7XG4gICAgICAgICAgICBub2RlOiBwYXJlbnROb2RlLFxuICAgICAgICAgICAgbGlua3MsXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBmdW5jdGlvbiBjcmVhdGVWTm9kZUxpbmtzKHZub2RlKSB7XG4gICAgICAgIGNvbnN0IHBhcmVudCA9IHZub2RlLnBhcmVudCgpO1xuICAgICAgICBjb25zdCBpc0JyYW5jaCA9IGxpbmtlZFBhcmVudHMuaGFzKHBhcmVudCk7XG4gICAgICAgIGNvbnN0IHBhcmVudE5vZGUgPSBpc0RPTVZOb2RlKHBhcmVudClcbiAgICAgICAgICAgID8gcGFyZW50Lm5vZGVcbiAgICAgICAgICAgIDogcGFyZW50Tm9kZXMuZ2V0KHBhcmVudCk7XG4gICAgICAgIHBhcmVudE5vZGVzLnNldCh2bm9kZSwgcGFyZW50Tm9kZSk7XG4gICAgICAgIGNvbnN0IHZub2RlTGlua3MgPSBuZXcgTGlua2VkTGlzdCgpO1xuICAgICAgICBwYXNzaW5nTGlua3Muc2V0KHZub2RlLCB2bm9kZUxpbmtzKTtcbiAgICAgICAgaWYgKGlzQnJhbmNoKSB7XG4gICAgICAgICAgICBjb25zdCBuZXdMaW5rID0ge1xuICAgICAgICAgICAgICAgIHBhcmVudE5vZGUsXG4gICAgICAgICAgICAgICAgbm9kZTogbnVsbCxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBsZXQgY3VycmVudCA9IHZub2RlO1xuICAgICAgICAgICAgZG8ge1xuICAgICAgICAgICAgICAgIHBhc3NpbmdMaW5rcy5nZXQoY3VycmVudCkucHVzaChuZXdMaW5rKTtcbiAgICAgICAgICAgICAgICBjdXJyZW50ID0gY3VycmVudC5wYXJlbnQoKTtcbiAgICAgICAgICAgIH0gd2hpbGUgKGN1cnJlbnQgJiYgIWlzRE9NVk5vZGUoY3VycmVudCkpO1xuICAgICAgICAgICAgaHVicy5nZXQocGFyZW50Tm9kZSkubGlua3MucHVzaChuZXdMaW5rKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGxpbmtlZFBhcmVudHMuYWRkKHBhcmVudCk7XG4gICAgICAgICAgICBjb25zdCBsaW5rcyA9IGlzRE9NVk5vZGUocGFyZW50KVxuICAgICAgICAgICAgICAgID8gaHVicy5nZXQocGFyZW50Tm9kZSkubGlua3NcbiAgICAgICAgICAgICAgICA6IHBhc3NpbmdMaW5rcy5nZXQocGFyZW50KTtcbiAgICAgICAgICAgIGxpbmtzLmZvckVhY2goKGxpbmspID0+IHZub2RlTGlua3MucHVzaChsaW5rKSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZnVuY3Rpb24gY29ubmVjdERPTVZOb2RlKHZub2RlKSB7XG4gICAgICAgIGlmIChpc0RPTVZOb2RlKHZub2RlKSkge1xuICAgICAgICAgICAgY29uc3QgeyBub2RlIH0gPSB2bm9kZTtcbiAgICAgICAgICAgIGh1YnMuc2V0KG5vZGUsIHtcbiAgICAgICAgICAgICAgICBub2RlLFxuICAgICAgICAgICAgICAgIGxpbmtzOiBuZXcgTGlua2VkTGlzdCh7XG4gICAgICAgICAgICAgICAgICAgIHBhcmVudE5vZGU6IG5vZGUsXG4gICAgICAgICAgICAgICAgICAgIG5vZGU6IG51bGwsXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHBhc3NpbmdMaW5rcy5nZXQodm5vZGUpLmZvckVhY2goKGxpbmspID0+IChsaW5rLm5vZGUgPSBub2RlKSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZnVuY3Rpb24gYWRkVk5vZGUodm5vZGUpIHtcbiAgICAgICAgY29uc3QgcGFyZW50ID0gdm5vZGUucGFyZW50KCk7XG4gICAgICAgIGlmIChwYXJlbnQgPT0gbnVsbCkge1xuICAgICAgICAgICAgY3JlYXRlUm9vdFZOb2RlTGlua3Modm5vZGUpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgY3JlYXRlVk5vZGVMaW5rcyh2bm9kZSk7XG4gICAgICAgIH1cbiAgICAgICAgY29ubmVjdERPTVZOb2RlKHZub2RlKTtcbiAgICAgICAgY3JlYXRWTm9kZUNvbnRleHQodm5vZGUpO1xuICAgIH1cbiAgICBmdW5jdGlvbiBnZXRWTm9kZUNvbnRleHQodm5vZGUpIHtcbiAgICAgICAgcmV0dXJuIGNvbnRleHRzLmdldCh2bm9kZSk7XG4gICAgfVxuICAgIGZ1bmN0aW9uIGdldEFuY2VzdG9yc0xpbmtzKHZub2RlKSB7XG4gICAgICAgIGNvbnN0IHBhcmVudE5vZGUgPSBwYXJlbnROb2Rlcy5nZXQodm5vZGUpO1xuICAgICAgICBjb25zdCBodWIgPSBodWJzLmdldChwYXJlbnROb2RlKTtcbiAgICAgICAgY29uc3QgYWxsTGlua3MgPSBbXTtcbiAgICAgICAgbGV0IGN1cnJlbnQgPSB2bm9kZTtcbiAgICAgICAgd2hpbGUgKChjdXJyZW50ID0gY3VycmVudC5wYXJlbnQoKSkgJiYgIWlzRE9NVk5vZGUoY3VycmVudCkpIHtcbiAgICAgICAgICAgIGFsbExpbmtzLnB1c2gocGFzc2luZ0xpbmtzLmdldChjdXJyZW50KSk7XG4gICAgICAgIH1cbiAgICAgICAgYWxsTGlua3MucHVzaChodWIubGlua3MpO1xuICAgICAgICByZXR1cm4gYWxsTGlua3M7XG4gICAgfVxuICAgIGZ1bmN0aW9uIHJlcGxhY2VWTm9kZShvbGQsIHZub2RlKSB7XG4gICAgICAgIGlmICh2bm9kZS5wYXJlbnQoKSA9PSBudWxsKSB7XG4gICAgICAgICAgICBhZGRWTm9kZSh2bm9kZSk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qgb2xkQ29udGV4dCA9IGNvbnRleHRzLmdldChvbGQpO1xuICAgICAgICBjb25zdCB7IHBhcmVudDogcGFyZW50Tm9kZSB9ID0gb2xkQ29udGV4dDtcbiAgICAgICAgcGFyZW50Tm9kZXMuc2V0KHZub2RlLCBwYXJlbnROb2RlKTtcbiAgICAgICAgY29uc3Qgb2xkTGlua3MgPSBwYXNzaW5nTGlua3MuZ2V0KG9sZCk7XG4gICAgICAgIGNvbnN0IG5ld0xpbmsgPSB7XG4gICAgICAgICAgICBwYXJlbnROb2RlLFxuICAgICAgICAgICAgbm9kZTogbnVsbCxcbiAgICAgICAgfTtcbiAgICAgICAgZ2V0QW5jZXN0b3JzTGlua3Modm5vZGUpLmZvckVhY2goKGxpbmtzKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBuZXh0TGluayA9IGxpbmtzLmFmdGVyKG9sZExpbmtzLmxhc3QpO1xuICAgICAgICAgICAgb2xkTGlua3MuZm9yRWFjaCgobGluaykgPT4gbGlua3MuZGVsZXRlKGxpbmspKTtcbiAgICAgICAgICAgIGlmIChuZXh0TGluaykge1xuICAgICAgICAgICAgICAgIGxpbmtzLmluc2VydEJlZm9yZShuZXdMaW5rLCBuZXh0TGluayk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBsaW5rcy5wdXNoKG5ld0xpbmspO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgY29uc3Qgdm5vZGVMaW5rcyA9IG5ldyBMaW5rZWRMaXN0KG5ld0xpbmspO1xuICAgICAgICBwYXNzaW5nTGlua3Muc2V0KHZub2RlLCB2bm9kZUxpbmtzKTtcbiAgICAgICAgY3JlYXRWTm9kZUNvbnRleHQodm5vZGUpO1xuICAgIH1cbiAgICBmdW5jdGlvbiBhZG9wdFZOb2RlKHZub2RlLCBwYXJlbnQpIHtcbiAgICAgICAgY29uc3Qgdm5vZGVMaW5rcyA9IHBhc3NpbmdMaW5rcy5nZXQodm5vZGUpO1xuICAgICAgICBjb25zdCBwYXJlbnRMaW5rcyA9IHBhc3NpbmdMaW5rcy5nZXQocGFyZW50KS5jb3B5KCk7XG4gICAgICAgIHZub2RlLnBhcmVudChwYXJlbnQpO1xuICAgICAgICBnZXRBbmNlc3RvcnNMaW5rcyh2bm9kZSkuZm9yRWFjaCgobGlua3MpID0+IHtcbiAgICAgICAgICAgIHZub2RlTGlua3MuZm9yRWFjaCgobGluaykgPT4gbGlua3MuaW5zZXJ0QmVmb3JlKGxpbmssIHBhcmVudExpbmtzLmZpcnN0KSk7XG4gICAgICAgICAgICBwYXJlbnRMaW5rcy5mb3JFYWNoKChsaW5rKSA9PiBsaW5rcy5kZWxldGUobGluaykpO1xuICAgICAgICB9KTtcbiAgICB9XG4gICAgZnVuY3Rpb24gaXNET01Ob2RlQ2FwdHVyZWQobm9kZSkge1xuICAgICAgICByZXR1cm4gaHVicy5oYXMobm9kZSkgJiYgbm9kZSAhPT0gcm9vdE5vZGUucGFyZW50RWxlbWVudDtcbiAgICB9XG4gICAgY29uc3QgdmRvbSA9IHtcbiAgICAgICAgZXhlY3V0ZTogZXhlY3V0ZSQxLFxuICAgICAgICBhZGRWTm9kZSxcbiAgICAgICAgZ2V0Vk5vZGVDb250ZXh0LFxuICAgICAgICByZXBsYWNlVk5vZGUsXG4gICAgICAgIGFkb3B0Vk5vZGUsXG4gICAgICAgIGlzRE9NTm9kZUNhcHR1cmVkLFxuICAgICAgICBMRUFWRSxcbiAgICB9O1xuICAgIHJldHVybiB2ZG9tO1xufVxuXG5jb25zdCByb290cyA9IG5ldyBXZWFrTWFwKCk7XG5jb25zdCB2ZG9tcyA9IG5ldyBXZWFrTWFwKCk7XG5mdW5jdGlvbiByZWFsaXplKG5vZGUsIHZub2RlKSB7XG4gICAgY29uc3Qgb2xkID0gcm9vdHMuZ2V0KG5vZGUpIHx8IG51bGw7XG4gICAgcm9vdHMuc2V0KG5vZGUsIHZub2RlKTtcbiAgICBsZXQgdmRvbTtcbiAgICBpZiAodmRvbXMuaGFzKG5vZGUpKSB7XG4gICAgICAgIHZkb20gPSB2ZG9tcy5nZXQobm9kZSk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICB2ZG9tID0gY3JlYXRlVkRPTShub2RlKTtcbiAgICAgICAgdmRvbXMuc2V0KG5vZGUsIHZkb20pO1xuICAgIH1cbiAgICB2ZG9tLmV4ZWN1dGUodm5vZGUsIG9sZCk7XG4gICAgcmV0dXJuIHZkb20uZ2V0Vk5vZGVDb250ZXh0KHZub2RlKTtcbn1cbmZ1bmN0aW9uIHJlbmRlcihlbGVtZW50LCBzcGVjKSB7XG4gICAgY29uc3Qgdm5vZGUgPSBjcmVhdGVET01WTm9kZShlbGVtZW50LCBBcnJheS5pc0FycmF5KHNwZWMpID8gc3BlYyA6IFtzcGVjXSwgbnVsbCwgZmFsc2UpO1xuICAgIHJlYWxpemUoZWxlbWVudCwgdm5vZGUpO1xuICAgIHJldHVybiBlbGVtZW50O1xufVxuZnVuY3Rpb24gc3luYyhub2RlLCBzcGVjKSB7XG4gICAgY29uc3Qgdm5vZGUgPSBjcmVhdGVWTm9kZShzcGVjLCBudWxsKTtcbiAgICBjb25zdCBjb250ZXh0ID0gcmVhbGl6ZShub2RlLCB2bm9kZSk7XG4gICAgY29uc3QgeyBub2RlcyB9ID0gY29udGV4dDtcbiAgICBpZiAobm9kZXMubGVuZ3RoICE9PSAxIHx8IG5vZGVzWzBdICE9PSBub2RlKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignU3BlYyBkb2VzIG5vdCBtYXRjaCB0aGUgbm9kZScpO1xuICAgIH1cbiAgICByZXR1cm4gbm9kZXNbMF07XG59XG5mdW5jdGlvbiB0ZWFyZG93bihub2RlKSB7XG4gICAgcm9vdHMuZGVsZXRlKG5vZGUpO1xuICAgIHZkb21zLmRlbGV0ZShub2RlKTtcbn1cblxuY29uc3QgcGx1Z2lucyA9IHtcbiAgICBjcmVhdGVFbGVtZW50OiBjcmVhdGVQbHVnaW5zQVBJKFBMVUdJTlNfQ1JFQVRFX0VMRU1FTlQpLFxuICAgIHNldEF0dHJpYnV0ZTogY3JlYXRlUGx1Z2luc0FQSShQTFVHSU5TX1NFVF9BVFRSSUJVVEUpLFxufTtcblxuZXhwb3J0IHsgZ2V0Q29tcG9uZW50Q29udGV4dCBhcyBnZXRDb250ZXh0LCBwbHVnaW5zLCByZW5kZXIsIHN5bmMsIHRlYXJkb3duIH07XG4iLCIvKiBtYWxldmljQDAuMTguNiAtIEp1bCAxNSwgMjAyMCAqL1xuaW1wb3J0IHsgZ2V0Q29udGV4dCB9IGZyb20gJ21hbGV2aWMvZG9tJztcblxubGV0IGN1cnJlbnRVc2VTdGF0ZUZuID0gbnVsbDtcbmZ1bmN0aW9uIHVzZVN0YXRlKGluaXRpYWxTdGF0ZSkge1xuICAgIGlmICghY3VycmVudFVzZVN0YXRlRm4pIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdgdXNlU3RhdGUoKWAgc2hvdWxkIGJlIGNhbGxlZCBpbnNpZGUgYSBjb21wb25lbnQnKTtcbiAgICB9XG4gICAgcmV0dXJuIGN1cnJlbnRVc2VTdGF0ZUZuKGluaXRpYWxTdGF0ZSk7XG59XG5mdW5jdGlvbiB3aXRoU3RhdGUodHlwZSkge1xuICAgIGNvbnN0IFN0YXRlZnVsID0gKHByb3BzLCAuLi5jaGlsZHJlbikgPT4ge1xuICAgICAgICBjb25zdCBjb250ZXh0ID0gZ2V0Q29udGV4dCgpO1xuICAgICAgICBjb25zdCB1c2VTdGF0ZSA9IChpbml0aWFsKSA9PiB7XG4gICAgICAgICAgICBpZiAoIWNvbnRleHQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdGF0ZTogaW5pdGlhbCwgc2V0U3RhdGU6IG51bGwgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHsgc3RvcmUsIHJlZnJlc2ggfSA9IGNvbnRleHQ7XG4gICAgICAgICAgICBzdG9yZS5zdGF0ZSA9IHN0b3JlLnN0YXRlIHx8IGluaXRpYWw7XG4gICAgICAgICAgICBjb25zdCBzZXRTdGF0ZSA9IChuZXdTdGF0ZSkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChsb2NrKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignU2V0dGluZyBzdGF0ZSBkdXJpbmcgdW5ib3hpbmcgY2F1c2VzIGluZmluaXRlIGxvb3AnKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgc3RvcmUuc3RhdGUgPSBPYmplY3QuYXNzaWduKE9iamVjdC5hc3NpZ24oe30sIHN0b3JlLnN0YXRlKSwgbmV3U3RhdGUpO1xuICAgICAgICAgICAgICAgIHJlZnJlc2goKTtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN0YXRlOiBzdG9yZS5zdGF0ZSxcbiAgICAgICAgICAgICAgICBzZXRTdGF0ZSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH07XG4gICAgICAgIGxldCBsb2NrID0gdHJ1ZTtcbiAgICAgICAgY29uc3QgcHJldlVzZVN0YXRlRm4gPSBjdXJyZW50VXNlU3RhdGVGbjtcbiAgICAgICAgY3VycmVudFVzZVN0YXRlRm4gPSB1c2VTdGF0ZTtcbiAgICAgICAgbGV0IHJlc3VsdDtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHJlc3VsdCA9IHR5cGUocHJvcHMsIC4uLmNoaWxkcmVuKTtcbiAgICAgICAgfVxuICAgICAgICBmaW5hbGx5IHtcbiAgICAgICAgICAgIGN1cnJlbnRVc2VTdGF0ZUZuID0gcHJldlVzZVN0YXRlRm47XG4gICAgICAgICAgICBsb2NrID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9O1xuICAgIHJldHVybiBTdGF0ZWZ1bDtcbn1cblxuZXhwb3J0IHsgdXNlU3RhdGUsIHdpdGhTdGF0ZSB9O1xuIiwiZXhwb3J0IGZ1bmN0aW9uIGlzQ2hyb21pdW1CYXNlZCgpIHtcbiAgICByZXR1cm4gbmF2aWdhdG9yLnVzZXJBZ2VudC50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdjaHJvbWUnKSB8fCBuYXZpZ2F0b3IudXNlckFnZW50LnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ2Nocm9taXVtJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0ZpcmVmb3goKSB7XG4gICAgcmV0dXJuIG5hdmlnYXRvci51c2VyQWdlbnQuaW5jbHVkZXMoJ0ZpcmVmb3gnKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzVml2YWxkaSgpIHtcbiAgICByZXR1cm4gbmF2aWdhdG9yLnVzZXJBZ2VudC50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCd2aXZhbGRpJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1lhQnJvd3NlcigpIHtcbiAgICByZXR1cm4gbmF2aWdhdG9yLnVzZXJBZ2VudC50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCd5YWJyb3dzZXInKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzT3BlcmEoKSB7XG4gICAgY29uc3QgYWdlbnQgPSBuYXZpZ2F0b3IudXNlckFnZW50LnRvTG93ZXJDYXNlKCk7XG4gICAgcmV0dXJuIGFnZW50LmluY2x1ZGVzKCdvcHInKSB8fCBhZ2VudC5pbmNsdWRlcygnb3BlcmEnKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzRWRnZSgpIHtcbiAgICByZXR1cm4gbmF2aWdhdG9yLnVzZXJBZ2VudC5pbmNsdWRlcygnRWRnJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1dpbmRvd3MoKSB7XG4gICAgaWYgKHR5cGVvZiBuYXZpZ2F0b3IgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICByZXR1cm4gbmF2aWdhdG9yLnBsYXRmb3JtLnRvTG93ZXJDYXNlKCkuc3RhcnRzV2l0aCgnd2luJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc01hY09TKCkge1xuICAgIGlmICh0eXBlb2YgbmF2aWdhdG9yID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgcmV0dXJuIG5hdmlnYXRvci5wbGF0Zm9ybS50b0xvd2VyQ2FzZSgpLnN0YXJ0c1dpdGgoJ21hYycpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNNb2JpbGUoKSB7XG4gICAgaWYgKHR5cGVvZiBuYXZpZ2F0b3IgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICByZXR1cm4gbmF2aWdhdG9yLnVzZXJBZ2VudC50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdtb2JpbGUnKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldENocm9tZVZlcnNpb24oKSB7XG4gICAgY29uc3QgYWdlbnQgPSBuYXZpZ2F0b3IudXNlckFnZW50LnRvTG93ZXJDYXNlKCk7XG4gICAgY29uc3QgbSA9IGFnZW50Lm1hdGNoKC9jaHJvbVtlfGl1bV1cXC8oW14gXSspLyk7XG4gICAgaWYgKG0gJiYgbVsxXSkge1xuICAgICAgICByZXR1cm4gbVsxXTtcbiAgICB9XG4gICAgcmV0dXJuIG51bGw7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjb21wYXJlQ2hyb21lVmVyc2lvbnMoJGE6IHN0cmluZywgJGI6IHN0cmluZykge1xuICAgIGNvbnN0IGEgPSAkYS5zcGxpdCgnLicpLm1hcCgoeCkgPT4gcGFyc2VJbnQoeCkpO1xuICAgIGNvbnN0IGIgPSAkYi5zcGxpdCgnLicpLm1hcCgoeCkgPT4gcGFyc2VJbnQoeCkpO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYS5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAoYVtpXSAhPT0gYltpXSkge1xuICAgICAgICAgICAgcmV0dXJuIGFbaV0gPCBiW2ldID8gLTEgOiAxO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiAwO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNEZWZpbmVkU2VsZWN0b3JTdXBwb3J0ZWQoKSB7XG4gICAgdHJ5IHtcbiAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignOmRlZmluZWQnKTtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG59XG5cbmV4cG9ydCBjb25zdCBJU19TSEFET1dfRE9NX1NVUFBPUlRFRCA9IHR5cGVvZiBTaGFkb3dSb290ID09PSAnZnVuY3Rpb24nO1xuXG5leHBvcnQgZnVuY3Rpb24gaXNDU1NTdHlsZVNoZWV0Q29uc3RydWN0b3JTdXBwb3J0ZWQoKSB7XG4gICAgdHJ5IHtcbiAgICAgICAgbmV3IENTU1N0eWxlU2hlZXQoKTtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG59XG4iLCJpbXBvcnQge2lzRmlyZWZveH0gZnJvbSAnLi4vdXRpbHMvcGxhdGZvcm0nO1xuXG5leHBvcnQgZnVuY3Rpb24gY2xhc3NlcyguLi5hcmdzOiAoc3RyaW5nIHwge1tjbHM6IHN0cmluZ106IGJvb2xlYW59KVtdKSB7XG4gICAgY29uc3QgY2xhc3NlcyA9IFtdO1xuICAgIGFyZ3MuZmlsdGVyKChjKSA9PiBCb29sZWFuKGMpKS5mb3JFYWNoKChjKSA9PiB7XG4gICAgICAgIGlmICh0eXBlb2YgYyA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIGNsYXNzZXMucHVzaChjKTtcbiAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgYyA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgIGNsYXNzZXMucHVzaCguLi5PYmplY3Qua2V5cyhjKS5maWx0ZXIoKGtleSkgPT4gQm9vbGVhbihjW2tleV0pKSk7XG4gICAgICAgIH1cbiAgICB9KTtcbiAgICByZXR1cm4gY2xhc3Nlcy5qb2luKCcgJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjb21wb3NlPFQgZXh0ZW5kcyBNYWxldmljLkNvbXBvbmVudD4odHlwZTogVCwgLi4ud3JhcHBlcnM6ICgodDogVCkgPT4gVClbXSkge1xuICAgIHJldHVybiB3cmFwcGVycy5yZWR1Y2UoKHQsIHcpID0+IHcodCksIHR5cGUpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gb3BlbkZpbGUob3B0aW9uczoge2V4dGVuc2lvbnM6IHN0cmluZ1tdfSwgY2FsbGJhY2s6IChjb250ZW50OiBzdHJpbmcpID0+IHZvaWQpIHtcbiAgICBjb25zdCBpbnB1dCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2lucHV0Jyk7XG4gICAgaW5wdXQudHlwZSA9ICdmaWxlJztcbiAgICBpbnB1dC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgIGlmIChvcHRpb25zLmV4dGVuc2lvbnMgJiYgb3B0aW9ucy5leHRlbnNpb25zLmxlbmd0aCA+IDApIHtcbiAgICAgICAgaW5wdXQuYWNjZXB0ID0gb3B0aW9ucy5leHRlbnNpb25zLm1hcCgoZXh0KSA9PiBgLiR7ZXh0fWApLmpvaW4oJywnKTtcbiAgICB9XG4gICAgY29uc3QgcmVhZGVyID0gbmV3IEZpbGVSZWFkZXIoKTtcbiAgICByZWFkZXIub25sb2FkZW5kID0gKCkgPT4gY2FsbGJhY2socmVhZGVyLnJlc3VsdCBhcyBzdHJpbmcpO1xuICAgIGlucHV0Lm9uY2hhbmdlID0gKCkgPT4ge1xuICAgICAgICBpZiAoaW5wdXQuZmlsZXNbMF0pIHtcbiAgICAgICAgICAgIHJlYWRlci5yZWFkQXNUZXh0KGlucHV0LmZpbGVzWzBdKTtcbiAgICAgICAgICAgIGRvY3VtZW50LmJvZHkucmVtb3ZlQ2hpbGQoaW5wdXQpO1xuICAgICAgICB9XG4gICAgfTtcbiAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGlucHV0KTtcbiAgICBpbnB1dC5jbGljaygpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2F2ZUZpbGUobmFtZTogc3RyaW5nLCBjb250ZW50OiBzdHJpbmcpIHtcbiAgICBpZiAoaXNGaXJlZm94KCkpIHtcbiAgICAgICAgY29uc3QgYSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EnKTtcbiAgICAgICAgYS5ocmVmID0gVVJMLmNyZWF0ZU9iamVjdFVSTChuZXcgQmxvYihbY29udGVudF0pKTtcbiAgICAgICAgYS5kb3dubG9hZCA9IG5hbWU7XG4gICAgICAgIGEuY2xpY2soKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7dHlwZTogJ3NhdmUtZmlsZScsIGRhdGE6IHtuYW1lLCBjb250ZW50fX0pO1xuICAgIH1cbn1cblxudHlwZSBBbnlWb2lkRnVuY3Rpb24gPSAoLi4uYXJnczogYW55W10pID0+IHZvaWQ7XG5cbmV4cG9ydCBmdW5jdGlvbiB0aHJvdHRsZTxGIGV4dGVuZHMgQW55Vm9pZEZ1bmN0aW9uPihjYWxsYmFjazogRik6IEYge1xuICAgIGxldCBmcmFtZUlkID0gbnVsbDtcbiAgICByZXR1cm4gKCguLi5hcmdzOiBhbnlbXSkgPT4ge1xuICAgICAgICBpZiAoIWZyYW1lSWQpIHtcbiAgICAgICAgICAgIGNhbGxiYWNrKC4uLmFyZ3MpO1xuICAgICAgICAgICAgZnJhbWVJZCA9IHJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiAoZnJhbWVJZCA9IG51bGwpKTtcbiAgICAgICAgfVxuICAgIH0pIGFzIEY7XG59XG5cbmludGVyZmFjZSBTd2lwZUV2ZW50T2JqZWN0IHtcbiAgICBjbGllbnRYOiBudW1iZXI7XG4gICAgY2xpZW50WTogbnVtYmVyO1xufVxuXG50eXBlIFN3aXBlRXZlbnRIYW5kbGVyPFQgPSB2b2lkPiA9IChlOiBTd2lwZUV2ZW50T2JqZWN0LCBuYXRpdmVFdmVudDogTW91c2VFdmVudCB8IFRvdWNoRXZlbnQpID0+IFQ7XG50eXBlIFN0YXJ0U3dpcGVIYW5kbGVyID0gU3dpcGVFdmVudEhhbmRsZXI8e21vdmU6IFN3aXBlRXZlbnRIYW5kbGVyOyB1cDogU3dpcGVFdmVudEhhbmRsZXJ9PjtcblxuZnVuY3Rpb24gb25Td2lwZVN0YXJ0KFxuICAgIHN0YXJ0RXZlbnRPYmo6IE1vdXNlRXZlbnQgfCBUb3VjaEV2ZW50LFxuICAgIHN0YXJ0SGFuZGxlcjogU3RhcnRTd2lwZUhhbmRsZXIsXG4pIHtcbiAgICBjb25zdCBpc1RvdWNoRXZlbnQgPVxuICAgICAgICB0eXBlb2YgVG91Y2hFdmVudCAhPT0gJ3VuZGVmaW5lZCcgJiZcbiAgICAgICAgc3RhcnRFdmVudE9iaiBpbnN0YW5jZW9mIFRvdWNoRXZlbnQ7XG4gICAgY29uc3QgdG91Y2hJZCA9IGlzVG91Y2hFdmVudFxuICAgICAgICA/IChzdGFydEV2ZW50T2JqIGFzIFRvdWNoRXZlbnQpLmNoYW5nZWRUb3VjaGVzWzBdLmlkZW50aWZpZXJcbiAgICAgICAgOiBudWxsO1xuICAgIGNvbnN0IHBvaW50ZXJNb3ZlRXZlbnQgPSBpc1RvdWNoRXZlbnQgPyAndG91Y2htb3ZlJyA6ICdtb3VzZW1vdmUnO1xuICAgIGNvbnN0IHBvaW50ZXJVcEV2ZW50ID0gaXNUb3VjaEV2ZW50ID8gJ3RvdWNoZW5kJyA6ICdtb3VzZXVwJztcblxuICAgIGlmICghaXNUb3VjaEV2ZW50KSB7XG4gICAgICAgIHN0YXJ0RXZlbnRPYmoucHJldmVudERlZmF1bHQoKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRTd2lwZUV2ZW50T2JqZWN0KGU6IE1vdXNlRXZlbnQgfCBUb3VjaEV2ZW50KSB7XG4gICAgICAgIGNvbnN0IHtjbGllbnRYLCBjbGllbnRZfSA9IGlzVG91Y2hFdmVudFxuICAgICAgICAgICAgPyBnZXRUb3VjaChlIGFzIFRvdWNoRXZlbnQpXG4gICAgICAgICAgICA6IGUgYXMgTW91c2VFdmVudDtcbiAgICAgICAgcmV0dXJuIHtjbGllbnRYLCBjbGllbnRZfTtcbiAgICB9XG5cbiAgICBjb25zdCBzdGFydFNFID0gZ2V0U3dpcGVFdmVudE9iamVjdChzdGFydEV2ZW50T2JqKTtcbiAgICBjb25zdCB7bW92ZTogbW92ZUhhbmRsZXIsIHVwOiB1cEhhbmRsZXJ9ID0gc3RhcnRIYW5kbGVyKHN0YXJ0U0UsIHN0YXJ0RXZlbnRPYmopO1xuXG4gICAgZnVuY3Rpb24gZ2V0VG91Y2goZTogVG91Y2hFdmVudCkge1xuICAgICAgICByZXR1cm4gQXJyYXkuZnJvbShlLmNoYW5nZWRUb3VjaGVzKS5maW5kKFxuICAgICAgICAgICAgKHtpZGVudGlmaWVyOiBpZH0pID0+IGlkID09PSB0b3VjaElkLFxuICAgICAgICApO1xuICAgIH1cblxuICAgIGNvbnN0IG9uUG9pbnRlck1vdmUgPSB0aHJvdHRsZSgoZSkgPT4ge1xuICAgICAgICBjb25zdCBzZSA9IGdldFN3aXBlRXZlbnRPYmplY3QoZSk7XG4gICAgICAgIG1vdmVIYW5kbGVyKHNlLCBlKTtcbiAgICB9KTtcblxuICAgIGZ1bmN0aW9uIG9uUG9pbnRlclVwKGUpIHtcbiAgICAgICAgdW5zdWJzY3JpYmUoKTtcbiAgICAgICAgY29uc3Qgc2UgPSBnZXRTd2lwZUV2ZW50T2JqZWN0KGUpO1xuICAgICAgICB1cEhhbmRsZXIoc2UsIGUpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHVuc3Vic2NyaWJlKCkge1xuICAgICAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcihwb2ludGVyTW92ZUV2ZW50LCBvblBvaW50ZXJNb3ZlKTtcbiAgICAgICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIocG9pbnRlclVwRXZlbnQsIG9uUG9pbnRlclVwKTtcbiAgICB9XG5cbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihwb2ludGVyTW92ZUV2ZW50LCBvblBvaW50ZXJNb3ZlLCB7cGFzc2l2ZTogdHJ1ZX0pO1xuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKHBvaW50ZXJVcEV2ZW50LCBvblBvaW50ZXJVcCwge3Bhc3NpdmU6IHRydWV9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVN3aXBlSGFuZGxlcihzdGFydEhhbmRsZXI6IFN0YXJ0U3dpcGVIYW5kbGVyKSB7XG4gICAgcmV0dXJuIChlOiBNb3VzZUV2ZW50IHwgVG91Y2hFdmVudCkgPT4gb25Td2lwZVN0YXJ0KGUsIHN0YXJ0SGFuZGxlcik7XG59XG4iLCJpbXBvcnQge2NsYXNzZXN9IGZyb20gJy4uL3V0aWxzJztcblxuZnVuY3Rpb24gdG9BcnJheTxUPih4OiBUIHwgVFtdKSB7XG4gICAgcmV0dXJuIEFycmF5LmlzQXJyYXkoeCkgPyB4IDogW3hdO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbWVyZ2VDbGFzcyhcbiAgICBjbHM6IHN0cmluZyB8IHtbY2xzOiBzdHJpbmddOiBhbnl9IHwgKHN0cmluZyB8IHtbY2xzOiBzdHJpbmddOiBhbnl9KVtdLFxuICAgIHByb3BzQ2xzOiBzdHJpbmcgfCB7W2Nsczogc3RyaW5nXTogYW55fSB8IChzdHJpbmcgfCB7W2Nsczogc3RyaW5nXTogYW55fSlbXVxuKSB7XG4gICAgY29uc3Qgbm9ybWFsaXplZCA9IHRvQXJyYXkoY2xzKS5jb25jYXQodG9BcnJheShwcm9wc0NscykpO1xuICAgIHJldHVybiBjbGFzc2VzKC4uLm5vcm1hbGl6ZWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gb21pdEF0dHJzKG9taXQ6IHN0cmluZ1tdLCBhdHRyczogTWFsZXZpYy5Ob2RlQXR0cnMpIHtcbiAgICBjb25zdCByZXN1bHQ6IE1hbGV2aWMuTm9kZUF0dHJzID0ge307XG4gICAgT2JqZWN0LmtleXMoYXR0cnMpLmZvckVhY2goKGtleSkgPT4ge1xuICAgICAgICBpZiAob21pdC5pbmRleE9mKGtleSkgPCAwKSB7XG4gICAgICAgICAgICByZXN1bHRba2V5XSA9IGF0dHJzW2tleV07XG4gICAgICAgIH1cbiAgICB9KTtcbiAgICByZXR1cm4gcmVzdWx0O1xufVxuIiwiaW1wb3J0IHttfSBmcm9tICdtYWxldmljJztcbmltcG9ydCB7bWVyZ2VDbGFzcywgb21pdEF0dHJzfSBmcm9tICcuLi91dGlscyc7XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIEJ1dHRvbihwcm9wczogTWFsZXZpYy5Ob2RlQXR0cnMsIC4uLmNoaWxkcmVuKSB7XG4gICAgY29uc3QgY2xzID0gbWVyZ2VDbGFzcygnYnV0dG9uJywgcHJvcHMuY2xhc3MpO1xuICAgIGNvbnN0IGF0dHJzID0gb21pdEF0dHJzKFsnY2xhc3MnXSwgcHJvcHMpO1xuXG4gICAgcmV0dXJuIChcbiAgICAgICAgPGJ1dHRvbiBjbGFzcz17Y2xzfSB7Li4uYXR0cnN9PlxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJidXR0b25fX3dyYXBwZXJcIj5cbiAgICAgICAgICAgICAgICB7Li4uY2hpbGRyZW59XG4gICAgICAgICAgICA8L3NwYW4+XG4gICAgICAgIDwvYnV0dG9uPlxuICAgICk7XG59XG4iLCJleHBvcnQgaW50ZXJmYWNlIFJHQkEge1xuICAgIHI6IG51bWJlcjtcbiAgICBnOiBudW1iZXI7XG4gICAgYjogbnVtYmVyO1xuICAgIGE/OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSFNMQSB7XG4gICAgaDogbnVtYmVyO1xuICAgIHM6IG51bWJlcjtcbiAgICBsOiBudW1iZXI7XG4gICAgYT86IG51bWJlcjtcbn1cblxuLy8gaHR0cHM6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvSFNMX2FuZF9IU1ZcbmV4cG9ydCBmdW5jdGlvbiBoc2xUb1JHQih7aCwgcywgbCwgYSA9IDF9OiBIU0xBKTogUkdCQSB7XG4gICAgaWYgKHMgPT09IDApIHtcbiAgICAgICAgY29uc3QgW3IsIGIsIGddID0gW2wsIGwsIGxdLm1hcCgoeCkgPT4gTWF0aC5yb3VuZCh4ICogMjU1KSk7XG4gICAgICAgIHJldHVybiB7ciwgZywgYiwgYX07XG4gICAgfVxuXG4gICAgY29uc3QgYyA9ICgxIC0gTWF0aC5hYnMoMiAqIGwgLSAxKSkgKiBzO1xuICAgIGNvbnN0IHggPSBjICogKDEgLSBNYXRoLmFicygoaCAvIDYwKSAlIDIgLSAxKSk7XG4gICAgY29uc3QgbSA9IGwgLSBjIC8gMjtcbiAgICBjb25zdCBbciwgZywgYl0gPSAoXG4gICAgICAgIGggPCA2MCA/IFtjLCB4LCAwXSA6XG4gICAgICAgICAgICBoIDwgMTIwID8gW3gsIGMsIDBdIDpcbiAgICAgICAgICAgICAgICBoIDwgMTgwID8gWzAsIGMsIHhdIDpcbiAgICAgICAgICAgICAgICAgICAgaCA8IDI0MCA/IFswLCB4LCBjXSA6XG4gICAgICAgICAgICAgICAgICAgICAgICBoIDwgMzAwID8gW3gsIDAsIGNdIDpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBbYywgMCwgeF1cbiAgICApLm1hcCgobikgPT4gTWF0aC5yb3VuZCgobiArIG0pICogMjU1KSk7XG5cbiAgICByZXR1cm4ge3IsIGcsIGIsIGF9O1xufVxuXG4vLyBodHRwczovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9IU0xfYW5kX0hTVlxuZXhwb3J0IGZ1bmN0aW9uIHJnYlRvSFNMKHtyOiByMjU1LCBnOiBnMjU1LCBiOiBiMjU1LCBhID0gMX06IFJHQkEpOiBIU0xBIHtcbiAgICBjb25zdCByID0gcjI1NSAvIDI1NTtcbiAgICBjb25zdCBnID0gZzI1NSAvIDI1NTtcbiAgICBjb25zdCBiID0gYjI1NSAvIDI1NTtcblxuICAgIGNvbnN0IG1heCA9IE1hdGgubWF4KHIsIGcsIGIpO1xuICAgIGNvbnN0IG1pbiA9IE1hdGgubWluKHIsIGcsIGIpO1xuICAgIGNvbnN0IGMgPSBtYXggLSBtaW47XG5cbiAgICBjb25zdCBsID0gKG1heCArIG1pbikgLyAyO1xuXG4gICAgaWYgKGMgPT09IDApIHtcbiAgICAgICAgcmV0dXJuIHtoOiAwLCBzOiAwLCBsLCBhfTtcbiAgICB9XG5cbiAgICBsZXQgaCA9IChcbiAgICAgICAgbWF4ID09PSByID8gKCgoZyAtIGIpIC8gYykgJSA2KSA6XG4gICAgICAgICAgICBtYXggPT09IGcgPyAoKGIgLSByKSAvIGMgKyAyKSA6XG4gICAgICAgICAgICAgICAgKChyIC0gZykgLyBjICsgNClcbiAgICApICogNjA7XG4gICAgaWYgKGggPCAwKSB7XG4gICAgICAgIGggKz0gMzYwO1xuICAgIH1cblxuICAgIGNvbnN0IHMgPSBjIC8gKDEgLSBNYXRoLmFicygyICogbCAtIDEpKTtcblxuICAgIHJldHVybiB7aCwgcywgbCwgYX07XG59XG5cbmZ1bmN0aW9uIHRvRml4ZWQobjogbnVtYmVyLCBkaWdpdHMgPSAwKSB7XG4gICAgY29uc3QgZml4ZWQgPSBuLnRvRml4ZWQoZGlnaXRzKTtcbiAgICBpZiAoZGlnaXRzID09PSAwKSB7XG4gICAgICAgIHJldHVybiBmaXhlZDtcbiAgICB9XG4gICAgY29uc3QgZG90ID0gZml4ZWQuaW5kZXhPZignLicpO1xuICAgIGlmIChkb3QgPj0gMCkge1xuICAgICAgICBjb25zdCB6ZXJvc01hdGNoID0gZml4ZWQubWF0Y2goLzArJC8pO1xuICAgICAgICBpZiAoemVyb3NNYXRjaCkge1xuICAgICAgICAgICAgaWYgKHplcm9zTWF0Y2guaW5kZXggPT09IGRvdCArIDEpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZml4ZWQuc3Vic3RyaW5nKDAsIGRvdCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gZml4ZWQuc3Vic3RyaW5nKDAsIHplcm9zTWF0Y2guaW5kZXgpO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBmaXhlZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJnYlRvU3RyaW5nKHJnYjogUkdCQSkge1xuICAgIGNvbnN0IHtyLCBnLCBiLCBhfSA9IHJnYjtcbiAgICBpZiAoYSAhPSBudWxsICYmIGEgPCAxKSB7XG4gICAgICAgIHJldHVybiBgcmdiYSgke3RvRml4ZWQocil9LCAke3RvRml4ZWQoZyl9LCAke3RvRml4ZWQoYil9LCAke3RvRml4ZWQoYSwgMil9KWA7XG4gICAgfVxuICAgIHJldHVybiBgcmdiKCR7dG9GaXhlZChyKX0sICR7dG9GaXhlZChnKX0sICR7dG9GaXhlZChiKX0pYDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJnYlRvSGV4U3RyaW5nKHtyLCBnLCBiLCBhfTogUkdCQSkge1xuICAgIHJldHVybiBgIyR7KGEgIT0gbnVsbCAmJiBhIDwgMSA/IFtyLCBnLCBiLCBNYXRoLnJvdW5kKGEgKiAyNTUpXSA6IFtyLCBnLCBiXSkubWFwKCh4KSA9PiB7XG4gICAgICAgIHJldHVybiBgJHt4IDwgMTYgPyAnMCcgOiAnJ30ke3gudG9TdHJpbmcoMTYpfWA7XG4gICAgfSkuam9pbignJyl9YDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhzbFRvU3RyaW5nKGhzbDogSFNMQSkge1xuICAgIGNvbnN0IHtoLCBzLCBsLCBhfSA9IGhzbDtcbiAgICBpZiAoYSAhPSBudWxsICYmIGEgPCAxKSB7XG4gICAgICAgIHJldHVybiBgaHNsYSgke3RvRml4ZWQoaCl9LCAke3RvRml4ZWQocyAqIDEwMCl9JSwgJHt0b0ZpeGVkKGwgKiAxMDApfSUsICR7dG9GaXhlZChhLCAyKX0pYDtcbiAgICB9XG4gICAgcmV0dXJuIGBoc2woJHt0b0ZpeGVkKGgpfSwgJHt0b0ZpeGVkKHMgKiAxMDApfSUsICR7dG9GaXhlZChsICogMTAwKX0lKWA7XG59XG5cbmNvbnN0IHJnYk1hdGNoID0gL15yZ2JhP1xcKFteXFwoXFwpXStcXCkkLztcbmNvbnN0IGhzbE1hdGNoID0gL15oc2xhP1xcKFteXFwoXFwpXStcXCkkLztcbmNvbnN0IGhleE1hdGNoID0gL14jWzAtOWEtZl0rJC9pO1xuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2UoJGNvbG9yOiBzdHJpbmcpOiBSR0JBIHtcbiAgICBjb25zdCBjID0gJGNvbG9yLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuXG4gICAgaWYgKGMubWF0Y2gocmdiTWF0Y2gpKSB7XG4gICAgICAgIHJldHVybiBwYXJzZVJHQihjKTtcbiAgICB9XG5cbiAgICBpZiAoYy5tYXRjaChoc2xNYXRjaCkpIHtcbiAgICAgICAgcmV0dXJuIHBhcnNlSFNMKGMpO1xuICAgIH1cblxuICAgIGlmIChjLm1hdGNoKGhleE1hdGNoKSkge1xuICAgICAgICByZXR1cm4gcGFyc2VIZXgoYyk7XG4gICAgfVxuXG4gICAgaWYgKGtub3duQ29sb3JzLmhhcyhjKSkge1xuICAgICAgICByZXR1cm4gZ2V0Q29sb3JCeU5hbWUoYyk7XG4gICAgfVxuXG4gICAgaWYgKHN5c3RlbUNvbG9ycy5oYXMoYykpIHtcbiAgICAgICAgcmV0dXJuIGdldFN5c3RlbUNvbG9yKGMpO1xuICAgIH1cblxuICAgIGlmICgkY29sb3IgPT09ICd0cmFuc3BhcmVudCcpIHtcbiAgICAgICAgcmV0dXJuIHtyOiAwLCBnOiAwLCBiOiAwLCBhOiAwfTtcbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgRXJyb3IoYFVuYWJsZSB0byBwYXJzZSAkeyRjb2xvcn1gKTtcbn1cblxuZnVuY3Rpb24gZ2V0TnVtYmVyc0Zyb21TdHJpbmcoc3RyOiBzdHJpbmcsIHNwbGl0dGVyOiBSZWdFeHAsIHJhbmdlOiBudW1iZXJbXSwgdW5pdHM6IHtbdW5pdDogc3RyaW5nXTogbnVtYmVyfSkge1xuICAgIGNvbnN0IHJhdyA9IHN0ci5zcGxpdChzcGxpdHRlcikuZmlsdGVyKCh4KSA9PiB4KTtcbiAgICBjb25zdCB1bml0c0xpc3QgPSBPYmplY3QuZW50cmllcyh1bml0cyk7XG4gICAgY29uc3QgbnVtYmVycyA9IHJhdy5tYXAoKHIpID0+IHIudHJpbSgpKS5tYXAoKHIsIGkpID0+IHtcbiAgICAgICAgbGV0IG46IG51bWJlcjtcbiAgICAgICAgY29uc3QgdW5pdCA9IHVuaXRzTGlzdC5maW5kKChbdV0pID0+IHIuZW5kc1dpdGgodSkpO1xuICAgICAgICBpZiAodW5pdCkge1xuICAgICAgICAgICAgbiA9IHBhcnNlRmxvYXQoci5zdWJzdHJpbmcoMCwgci5sZW5ndGggLSB1bml0WzBdLmxlbmd0aCkpIC8gdW5pdFsxXSAqIHJhbmdlW2ldO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbiA9IHBhcnNlRmxvYXQocik7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJhbmdlW2ldID4gMSkge1xuICAgICAgICAgICAgcmV0dXJuIE1hdGgucm91bmQobik7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG47XG4gICAgfSk7XG4gICAgcmV0dXJuIG51bWJlcnM7XG59XG5cbmNvbnN0IHJnYlNwbGl0dGVyID0gL3JnYmE/fFxcKHxcXCl8XFwvfCx8XFxzL2lnO1xuY29uc3QgcmdiUmFuZ2UgPSBbMjU1LCAyNTUsIDI1NSwgMV07XG5jb25zdCByZ2JVbml0cyA9IHsnJSc6IDEwMH07XG5cbmZ1bmN0aW9uIHBhcnNlUkdCKCRyZ2I6IHN0cmluZykge1xuICAgIGNvbnN0IFtyLCBnLCBiLCBhID0gMV0gPSBnZXROdW1iZXJzRnJvbVN0cmluZygkcmdiLCByZ2JTcGxpdHRlciwgcmdiUmFuZ2UsIHJnYlVuaXRzKTtcbiAgICByZXR1cm4ge3IsIGcsIGIsIGF9O1xufVxuXG5jb25zdCBoc2xTcGxpdHRlciA9IC9oc2xhP3xcXCh8XFwpfFxcL3wsfFxccy9pZztcbmNvbnN0IGhzbFJhbmdlID0gWzM2MCwgMSwgMSwgMV07XG5jb25zdCBoc2xVbml0cyA9IHsnJSc6IDEwMCwgJ2RlZyc6IDM2MCwgJ3JhZCc6IDIgKiBNYXRoLlBJLCAndHVybic6IDF9O1xuXG5mdW5jdGlvbiBwYXJzZUhTTCgkaHNsOiBzdHJpbmcpIHtcbiAgICBjb25zdCBbaCwgcywgbCwgYSA9IDFdID0gZ2V0TnVtYmVyc0Zyb21TdHJpbmcoJGhzbCwgaHNsU3BsaXR0ZXIsIGhzbFJhbmdlLCBoc2xVbml0cyk7XG4gICAgcmV0dXJuIGhzbFRvUkdCKHtoLCBzLCBsLCBhfSk7XG59XG5cbmZ1bmN0aW9uIHBhcnNlSGV4KCRoZXg6IHN0cmluZykge1xuICAgIGNvbnN0IGggPSAkaGV4LnN1YnN0cmluZygxKTtcbiAgICBzd2l0Y2ggKGgubGVuZ3RoKSB7XG4gICAgICAgIGNhc2UgMzpcbiAgICAgICAgY2FzZSA0OiB7XG4gICAgICAgICAgICBjb25zdCBbciwgZywgYl0gPSBbMCwgMSwgMl0ubWFwKChpKSA9PiBwYXJzZUludChgJHtoW2ldfSR7aFtpXX1gLCAxNikpO1xuICAgICAgICAgICAgY29uc3QgYSA9IGgubGVuZ3RoID09PSAzID8gMSA6IChwYXJzZUludChgJHtoWzNdfSR7aFszXX1gLCAxNikgLyAyNTUpO1xuICAgICAgICAgICAgcmV0dXJuIHtyLCBnLCBiLCBhfTtcbiAgICAgICAgfVxuICAgICAgICBjYXNlIDY6XG4gICAgICAgIGNhc2UgODoge1xuICAgICAgICAgICAgY29uc3QgW3IsIGcsIGJdID0gWzAsIDIsIDRdLm1hcCgoaSkgPT4gcGFyc2VJbnQoaC5zdWJzdHJpbmcoaSwgaSArIDIpLCAxNikpO1xuICAgICAgICAgICAgY29uc3QgYSA9IGgubGVuZ3RoID09PSA2ID8gMSA6IChwYXJzZUludChoLnN1YnN0cmluZyg2LCA4KSwgMTYpIC8gMjU1KTtcbiAgICAgICAgICAgIHJldHVybiB7ciwgZywgYiwgYX07XG4gICAgICAgIH1cbiAgICB9XG4gICAgdGhyb3cgbmV3IEVycm9yKGBVbmFibGUgdG8gcGFyc2UgJHskaGV4fWApO1xufVxuXG5mdW5jdGlvbiBnZXRDb2xvckJ5TmFtZSgkY29sb3I6IHN0cmluZykge1xuICAgIGNvbnN0IG4gPSBrbm93bkNvbG9ycy5nZXQoJGNvbG9yKTtcbiAgICByZXR1cm4ge1xuICAgICAgICByOiAobiA+PiAxNikgJiAyNTUsXG4gICAgICAgIGc6IChuID4+IDgpICYgMjU1LFxuICAgICAgICBiOiAobiA+PiAwKSAmIDI1NSxcbiAgICAgICAgYTogMVxuICAgIH07XG59XG5cbmZ1bmN0aW9uIGdldFN5c3RlbUNvbG9yKCRjb2xvcjogc3RyaW5nKSB7XG4gICAgY29uc3QgbiA9IHN5c3RlbUNvbG9ycy5nZXQoJGNvbG9yKTtcbiAgICByZXR1cm4ge1xuICAgICAgICByOiAobiA+PiAxNikgJiAyNTUsXG4gICAgICAgIGc6IChuID4+IDgpICYgMjU1LFxuICAgICAgICBiOiAobiA+PiAwKSAmIDI1NSxcbiAgICAgICAgYTogMVxuICAgIH07XG59XG5cbmNvbnN0IGtub3duQ29sb3JzOiBNYXA8c3RyaW5nLCBudW1iZXI+ID0gbmV3IE1hcChPYmplY3QuZW50cmllcyh7XG4gICAgYWxpY2VibHVlOiAweGYwZjhmZixcbiAgICBhbnRpcXVld2hpdGU6IDB4ZmFlYmQ3LFxuICAgIGFxdWE6IDB4MDBmZmZmLFxuICAgIGFxdWFtYXJpbmU6IDB4N2ZmZmQ0LFxuICAgIGF6dXJlOiAweGYwZmZmZixcbiAgICBiZWlnZTogMHhmNWY1ZGMsXG4gICAgYmlzcXVlOiAweGZmZTRjNCxcbiAgICBibGFjazogMHgwMDAwMDAsXG4gICAgYmxhbmNoZWRhbG1vbmQ6IDB4ZmZlYmNkLFxuICAgIGJsdWU6IDB4MDAwMGZmLFxuICAgIGJsdWV2aW9sZXQ6IDB4OGEyYmUyLFxuICAgIGJyb3duOiAweGE1MmEyYSxcbiAgICBidXJseXdvb2Q6IDB4ZGViODg3LFxuICAgIGNhZGV0Ymx1ZTogMHg1ZjllYTAsXG4gICAgY2hhcnRyZXVzZTogMHg3ZmZmMDAsXG4gICAgY2hvY29sYXRlOiAweGQyNjkxZSxcbiAgICBjb3JhbDogMHhmZjdmNTAsXG4gICAgY29ybmZsb3dlcmJsdWU6IDB4NjQ5NWVkLFxuICAgIGNvcm5zaWxrOiAweGZmZjhkYyxcbiAgICBjcmltc29uOiAweGRjMTQzYyxcbiAgICBjeWFuOiAweDAwZmZmZixcbiAgICBkYXJrYmx1ZTogMHgwMDAwOGIsXG4gICAgZGFya2N5YW46IDB4MDA4YjhiLFxuICAgIGRhcmtnb2xkZW5yb2Q6IDB4Yjg4NjBiLFxuICAgIGRhcmtncmF5OiAweGE5YTlhOSxcbiAgICBkYXJrZ3JleTogMHhhOWE5YTksXG4gICAgZGFya2dyZWVuOiAweDAwNjQwMCxcbiAgICBkYXJra2hha2k6IDB4YmRiNzZiLFxuICAgIGRhcmttYWdlbnRhOiAweDhiMDA4YixcbiAgICBkYXJrb2xpdmVncmVlbjogMHg1NTZiMmYsXG4gICAgZGFya29yYW5nZTogMHhmZjhjMDAsXG4gICAgZGFya29yY2hpZDogMHg5OTMyY2MsXG4gICAgZGFya3JlZDogMHg4YjAwMDAsXG4gICAgZGFya3NhbG1vbjogMHhlOTk2N2EsXG4gICAgZGFya3NlYWdyZWVuOiAweDhmYmM4ZixcbiAgICBkYXJrc2xhdGVibHVlOiAweDQ4M2Q4YixcbiAgICBkYXJrc2xhdGVncmF5OiAweDJmNGY0ZixcbiAgICBkYXJrc2xhdGVncmV5OiAweDJmNGY0ZixcbiAgICBkYXJrdHVycXVvaXNlOiAweDAwY2VkMSxcbiAgICBkYXJrdmlvbGV0OiAweDk0MDBkMyxcbiAgICBkZWVwcGluazogMHhmZjE0OTMsXG4gICAgZGVlcHNreWJsdWU6IDB4MDBiZmZmLFxuICAgIGRpbWdyYXk6IDB4Njk2OTY5LFxuICAgIGRpbWdyZXk6IDB4Njk2OTY5LFxuICAgIGRvZGdlcmJsdWU6IDB4MWU5MGZmLFxuICAgIGZpcmVicmljazogMHhiMjIyMjIsXG4gICAgZmxvcmFsd2hpdGU6IDB4ZmZmYWYwLFxuICAgIGZvcmVzdGdyZWVuOiAweDIyOGIyMixcbiAgICBmdWNoc2lhOiAweGZmMDBmZixcbiAgICBnYWluc2Jvcm86IDB4ZGNkY2RjLFxuICAgIGdob3N0d2hpdGU6IDB4ZjhmOGZmLFxuICAgIGdvbGQ6IDB4ZmZkNzAwLFxuICAgIGdvbGRlbnJvZDogMHhkYWE1MjAsXG4gICAgZ3JheTogMHg4MDgwODAsXG4gICAgZ3JleTogMHg4MDgwODAsXG4gICAgZ3JlZW46IDB4MDA4MDAwLFxuICAgIGdyZWVueWVsbG93OiAweGFkZmYyZixcbiAgICBob25leWRldzogMHhmMGZmZjAsXG4gICAgaG90cGluazogMHhmZjY5YjQsXG4gICAgaW5kaWFucmVkOiAweGNkNWM1YyxcbiAgICBpbmRpZ286IDB4NGIwMDgyLFxuICAgIGl2b3J5OiAweGZmZmZmMCxcbiAgICBraGFraTogMHhmMGU2OGMsXG4gICAgbGF2ZW5kZXI6IDB4ZTZlNmZhLFxuICAgIGxhdmVuZGVyYmx1c2g6IDB4ZmZmMGY1LFxuICAgIGxhd25ncmVlbjogMHg3Y2ZjMDAsXG4gICAgbGVtb25jaGlmZm9uOiAweGZmZmFjZCxcbiAgICBsaWdodGJsdWU6IDB4YWRkOGU2LFxuICAgIGxpZ2h0Y29yYWw6IDB4ZjA4MDgwLFxuICAgIGxpZ2h0Y3lhbjogMHhlMGZmZmYsXG4gICAgbGlnaHRnb2xkZW5yb2R5ZWxsb3c6IDB4ZmFmYWQyLFxuICAgIGxpZ2h0Z3JheTogMHhkM2QzZDMsXG4gICAgbGlnaHRncmV5OiAweGQzZDNkMyxcbiAgICBsaWdodGdyZWVuOiAweDkwZWU5MCxcbiAgICBsaWdodHBpbms6IDB4ZmZiNmMxLFxuICAgIGxpZ2h0c2FsbW9uOiAweGZmYTA3YSxcbiAgICBsaWdodHNlYWdyZWVuOiAweDIwYjJhYSxcbiAgICBsaWdodHNreWJsdWU6IDB4ODdjZWZhLFxuICAgIGxpZ2h0c2xhdGVncmF5OiAweDc3ODg5OSxcbiAgICBsaWdodHNsYXRlZ3JleTogMHg3Nzg4OTksXG4gICAgbGlnaHRzdGVlbGJsdWU6IDB4YjBjNGRlLFxuICAgIGxpZ2h0eWVsbG93OiAweGZmZmZlMCxcbiAgICBsaW1lOiAweDAwZmYwMCxcbiAgICBsaW1lZ3JlZW46IDB4MzJjZDMyLFxuICAgIGxpbmVuOiAweGZhZjBlNixcbiAgICBtYWdlbnRhOiAweGZmMDBmZixcbiAgICBtYXJvb246IDB4ODAwMDAwLFxuICAgIG1lZGl1bWFxdWFtYXJpbmU6IDB4NjZjZGFhLFxuICAgIG1lZGl1bWJsdWU6IDB4MDAwMGNkLFxuICAgIG1lZGl1bW9yY2hpZDogMHhiYTU1ZDMsXG4gICAgbWVkaXVtcHVycGxlOiAweDkzNzBkYixcbiAgICBtZWRpdW1zZWFncmVlbjogMHgzY2IzNzEsXG4gICAgbWVkaXVtc2xhdGVibHVlOiAweDdiNjhlZSxcbiAgICBtZWRpdW1zcHJpbmdncmVlbjogMHgwMGZhOWEsXG4gICAgbWVkaXVtdHVycXVvaXNlOiAweDQ4ZDFjYyxcbiAgICBtZWRpdW12aW9sZXRyZWQ6IDB4YzcxNTg1LFxuICAgIG1pZG5pZ2h0Ymx1ZTogMHgxOTE5NzAsXG4gICAgbWludGNyZWFtOiAweGY1ZmZmYSxcbiAgICBtaXN0eXJvc2U6IDB4ZmZlNGUxLFxuICAgIG1vY2Nhc2luOiAweGZmZTRiNSxcbiAgICBuYXZham93aGl0ZTogMHhmZmRlYWQsXG4gICAgbmF2eTogMHgwMDAwODAsXG4gICAgb2xkbGFjZTogMHhmZGY1ZTYsXG4gICAgb2xpdmU6IDB4ODA4MDAwLFxuICAgIG9saXZlZHJhYjogMHg2YjhlMjMsXG4gICAgb3JhbmdlOiAweGZmYTUwMCxcbiAgICBvcmFuZ2VyZWQ6IDB4ZmY0NTAwLFxuICAgIG9yY2hpZDogMHhkYTcwZDYsXG4gICAgcGFsZWdvbGRlbnJvZDogMHhlZWU4YWEsXG4gICAgcGFsZWdyZWVuOiAweDk4ZmI5OCxcbiAgICBwYWxldHVycXVvaXNlOiAweGFmZWVlZSxcbiAgICBwYWxldmlvbGV0cmVkOiAweGRiNzA5MyxcbiAgICBwYXBheWF3aGlwOiAweGZmZWZkNSxcbiAgICBwZWFjaHB1ZmY6IDB4ZmZkYWI5LFxuICAgIHBlcnU6IDB4Y2Q4NTNmLFxuICAgIHBpbms6IDB4ZmZjMGNiLFxuICAgIHBsdW06IDB4ZGRhMGRkLFxuICAgIHBvd2RlcmJsdWU6IDB4YjBlMGU2LFxuICAgIHB1cnBsZTogMHg4MDAwODAsXG4gICAgcmViZWNjYXB1cnBsZTogMHg2NjMzOTksXG4gICAgcmVkOiAweGZmMDAwMCxcbiAgICByb3N5YnJvd246IDB4YmM4ZjhmLFxuICAgIHJveWFsYmx1ZTogMHg0MTY5ZTEsXG4gICAgc2FkZGxlYnJvd246IDB4OGI0NTEzLFxuICAgIHNhbG1vbjogMHhmYTgwNzIsXG4gICAgc2FuZHlicm93bjogMHhmNGE0NjAsXG4gICAgc2VhZ3JlZW46IDB4MmU4YjU3LFxuICAgIHNlYXNoZWxsOiAweGZmZjVlZSxcbiAgICBzaWVubmE6IDB4YTA1MjJkLFxuICAgIHNpbHZlcjogMHhjMGMwYzAsXG4gICAgc2t5Ymx1ZTogMHg4N2NlZWIsXG4gICAgc2xhdGVibHVlOiAweDZhNWFjZCxcbiAgICBzbGF0ZWdyYXk6IDB4NzA4MDkwLFxuICAgIHNsYXRlZ3JleTogMHg3MDgwOTAsXG4gICAgc25vdzogMHhmZmZhZmEsXG4gICAgc3ByaW5nZ3JlZW46IDB4MDBmZjdmLFxuICAgIHN0ZWVsYmx1ZTogMHg0NjgyYjQsXG4gICAgdGFuOiAweGQyYjQ4YyxcbiAgICB0ZWFsOiAweDAwODA4MCxcbiAgICB0aGlzdGxlOiAweGQ4YmZkOCxcbiAgICB0b21hdG86IDB4ZmY2MzQ3LFxuICAgIHR1cnF1b2lzZTogMHg0MGUwZDAsXG4gICAgdmlvbGV0OiAweGVlODJlZSxcbiAgICB3aGVhdDogMHhmNWRlYjMsXG4gICAgd2hpdGU6IDB4ZmZmZmZmLFxuICAgIHdoaXRlc21va2U6IDB4ZjVmNWY1LFxuICAgIHllbGxvdzogMHhmZmZmMDAsXG4gICAgeWVsbG93Z3JlZW46IDB4OWFjZDMyLFxufSkpO1xuXG5jb25zdCBzeXN0ZW1Db2xvcnM6IE1hcDxzdHJpbmcsIG51bWJlcj4gPSBuZXcgTWFwKE9iamVjdC5lbnRyaWVzKHtcbiAgICBBY3RpdmVCb3JkZXI6IDB4M2I5OWZjLFxuICAgIEFjdGl2ZUNhcHRpb246IDB4MDAwMDAwLFxuICAgIEFwcFdvcmtzcGFjZTogMHhhYWFhYWEsXG4gICAgQmFja2dyb3VuZDogMHg2MzYzY2UsXG4gICAgQnV0dG9uRmFjZTogMHhmZmZmZmYsXG4gICAgQnV0dG9uSGlnaGxpZ2h0OiAweGU5ZTllOSxcbiAgICBCdXR0b25TaGFkb3c6IDB4OWZhMDlmLFxuICAgIEJ1dHRvblRleHQ6IDB4MDAwMDAwLFxuICAgIENhcHRpb25UZXh0OiAweDAwMDAwMCxcbiAgICBHcmF5VGV4dDogMHg3ZjdmN2YsXG4gICAgSGlnaGxpZ2h0OiAweGIyZDdmZixcbiAgICBIaWdobGlnaHRUZXh0OiAweDAwMDAwMCxcbiAgICBJbmFjdGl2ZUJvcmRlcjogMHhmZmZmZmYsXG4gICAgSW5hY3RpdmVDYXB0aW9uOiAweGZmZmZmZixcbiAgICBJbmFjdGl2ZUNhcHRpb25UZXh0OiAweDAwMDAwMCxcbiAgICBJbmZvQmFja2dyb3VuZDogMHhmYmZjYzUsXG4gICAgSW5mb1RleHQ6IDB4MDAwMDAwLFxuICAgIE1lbnU6IDB4ZjZmNmY2LFxuICAgIE1lbnVUZXh0OiAweGZmZmZmZixcbiAgICBTY3JvbGxiYXI6IDB4YWFhYWFhLFxuICAgIFRocmVlRERhcmtTaGFkb3c6IDB4MDAwMDAwLFxuICAgIFRocmVlREZhY2U6IDB4YzBjMGMwLFxuICAgIFRocmVlREhpZ2hsaWdodDogMHhmZmZmZmYsXG4gICAgVGhyZWVETGlnaHRTaGFkb3c6IDB4ZmZmZmZmLFxuICAgIFRocmVlRFNoYWRvdzogMHgwMDAwMDAsXG4gICAgV2luZG93OiAweGVjZWNlYyxcbiAgICBXaW5kb3dGcmFtZTogMHhhYWFhYWEsXG4gICAgV2luZG93VGV4dDogMHgwMDAwMDAsXG4gICAgJy13ZWJraXQtZm9jdXMtcmluZy1jb2xvcic6IDB4ZTU5NzAwXG59KS5tYXAoKFtrZXksIHZhbHVlXSkgPT4gW2tleS50b0xvd2VyQ2FzZSgpLCB2YWx1ZV0gYXMgW3N0cmluZywgbnVtYmVyXSkpO1xuIiwiaW1wb3J0IHttfSBmcm9tICdtYWxldmljJztcbmltcG9ydCB7bWVyZ2VDbGFzcywgb21pdEF0dHJzfSBmcm9tICcuLi91dGlscyc7XG5cbmludGVyZmFjZSBUZXh0Qm94UHJvcHMgZXh0ZW5kcyBNYWxldmljLk5vZGVBdHRycyB7XG4gICAgb25pbnB1dD86IChlOiBFdmVudCAmIHt0YXJnZXQ6IEhUTUxJbnB1dEVsZW1lbnR9KSA9PiB2b2lkO1xuICAgIG9uY2hhbmdlPzogKGU6IEV2ZW50ICYge3RhcmdldDogSFRNTElucHV0RWxlbWVudH0pID0+IHZvaWQ7XG59XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIFRleHRCb3gocHJvcHM6IFRleHRCb3hQcm9wcykge1xuICAgIGNvbnN0IGNscyA9IG1lcmdlQ2xhc3MoJ3RleHRib3gnLCBwcm9wcy5jbGFzcyk7XG4gICAgY29uc3QgYXR0cnMgPSBvbWl0QXR0cnMoWydjbGFzcycsICd0eXBlJ10sIHByb3BzKTtcblxuICAgIHJldHVybiAoXG4gICAgICAgIDxpbnB1dCBjbGFzcz17Y2xzfSB0eXBlPVwidGV4dFwiIHsuLi5hdHRyc30gLz5cbiAgICApO1xufVxuIiwiZXhwb3J0IGZ1bmN0aW9uIHNjYWxlKHg6IG51bWJlciwgaW5Mb3c6IG51bWJlciwgaW5IaWdoOiBudW1iZXIsIG91dExvdzogbnVtYmVyLCBvdXRIaWdoOiBudW1iZXIpIHtcbiAgICByZXR1cm4gKHggLSBpbkxvdykgKiAob3V0SGlnaCAtIG91dExvdykgLyAoaW5IaWdoIC0gaW5Mb3cpICsgb3V0TG93O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY2xhbXAoeDogbnVtYmVyLCBtaW46IG51bWJlciwgbWF4OiBudW1iZXIpIHtcbiAgICByZXR1cm4gTWF0aC5taW4obWF4LCBNYXRoLm1heChtaW4sIHgpKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG11bHRpcGx5TWF0cmljZXMobTE6IG51bWJlcltdW10sIG0yOiBudW1iZXJbXVtdKSB7XG4gICAgY29uc3QgcmVzdWx0OiBudW1iZXJbXVtdID0gW107XG4gICAgZm9yIChsZXQgaSA9IDAsIGxlbiA9IG0xLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgIHJlc3VsdFtpXSA9IFtdO1xuICAgICAgICBmb3IgKGxldCBqID0gMCwgbGVuMiA9IG0yWzBdLmxlbmd0aDsgaiA8IGxlbjI7IGorKykge1xuICAgICAgICAgICAgbGV0IHN1bSA9IDA7XG4gICAgICAgICAgICBmb3IgKGxldCBrID0gMCwgbGVuMyA9IG0xWzBdLmxlbmd0aDsgayA8IGxlbjM7IGsrKykge1xuICAgICAgICAgICAgICAgIHN1bSArPSBtMVtpXVtrXSAqIG0yW2tdW2pdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmVzdWx0W2ldW2pdID0gc3VtO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG59XG4iLCJpbXBvcnQge219IGZyb20gJ21hbGV2aWMnO1xuaW1wb3J0IHtnZXRDb250ZXh0fSBmcm9tICdtYWxldmljL2RvbSc7XG5pbXBvcnQge3JnYlRvSFNMLCBwYXJzZSwgaHNsVG9TdHJpbmcsIHJnYlRvSGV4U3RyaW5nLCBSR0JBfSBmcm9tICcuLi8uLi8uLi91dGlscy9jb2xvcic7XG5pbXBvcnQge2NsYW1wLCBzY2FsZX0gZnJvbSAnLi4vLi4vLi4vdXRpbHMvbWF0aCc7XG5pbXBvcnQge2NyZWF0ZVN3aXBlSGFuZGxlcn0gZnJvbSAnLi4vLi4vdXRpbHMnO1xuXG5pbnRlcmZhY2UgSFNCIHtcbiAgICBoOiBudW1iZXI7XG4gICAgczogbnVtYmVyO1xuICAgIGI6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIEhTQlBpY2tlclByb3BzIHtcbiAgICBjb2xvcjogc3RyaW5nO1xuICAgIG9uQ2hhbmdlOiAoY29sb3I6IHN0cmluZykgPT4gdm9pZDtcbiAgICBvbkNvbG9yUHJldmlldzogKGNvbG9yOiBzdHJpbmcpID0+IHZvaWQ7XG59XG5cbmludGVyZmFjZSBIU0JQaWNrZXJTdGF0ZSB7XG4gICAgYWN0aXZlSFNCOiBIU0I7XG4gICAgYWN0aXZlQ2hhbmdlSGFuZGxlcjogKGNvbG9yOiBzdHJpbmcpID0+IHZvaWQ7XG4gICAgaHVlVG91Y2hTdGFydEhhbmRsZXI6IChlOiBUb3VjaEV2ZW50KSA9PiB2b2lkO1xuICAgIHNiVG91Y2hTdGFydEhhbmRsZXI6IChlOiBUb3VjaEV2ZW50KSA9PiB2b2lkO1xufVxuXG5mdW5jdGlvbiByZ2JUb0hTQih7ciwgZywgYn06IFJHQkEpIHtcbiAgICBjb25zdCBtaW4gPSBNYXRoLm1pbihyLCBnLCBiKTtcbiAgICBjb25zdCBtYXggPSBNYXRoLm1heChyLCBnLCBiKTtcbiAgICByZXR1cm4ge1xuICAgICAgICBoOiByZ2JUb0hTTCh7ciwgZywgYn0pLmgsXG4gICAgICAgIHM6IG1heCA9PT0gMCA/IDAgOiAoMSAtIChtaW4gLyBtYXgpKSxcbiAgICAgICAgYjogbWF4IC8gMjU1LFxuICAgIH07XG59XG5cbmZ1bmN0aW9uIGhzYlRvUkdCKHtoOiBodWUsIHM6IHNhdCwgYjogYnJ9OiBIU0IpOiBSR0JBIHtcbiAgICBsZXQgYzogW251bWJlciwgbnVtYmVyLCBudW1iZXJdO1xuICAgIGlmIChodWUgPCA2MCkge1xuICAgICAgICBjID0gWzEsIGh1ZSAvIDYwLCAwXTtcbiAgICB9IGVsc2UgaWYgKGh1ZSA8IDEyMCkge1xuICAgICAgICBjID0gWygxMjAgLSBodWUpIC8gNjAsIDEsIDBdO1xuICAgIH0gZWxzZSBpZiAoaHVlIDwgMTgwKSB7XG4gICAgICAgIGMgPSBbMCwgMSwgKGh1ZSAtIDEyMCkgLyA2MF07XG4gICAgfSBlbHNlIGlmIChodWUgPCAyNDApIHtcbiAgICAgICAgYyA9IFswLCAoMjQwIC0gaHVlKSAvIDYwLCAxXTtcbiAgICB9IGVsc2UgaWYgKGh1ZSA8IDMwMCkge1xuICAgICAgICBjID0gWyhodWUgLSAyNDApIC8gNjAsIDAsIDFdO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIGMgPSBbMSwgMCwgKDM2MCAtIGh1ZSkgLyA2MF07XG4gICAgfVxuXG4gICAgY29uc3QgbWF4ID0gTWF0aC5tYXgoLi4uYyk7XG4gICAgY29uc3QgW3IsIGcsIGJdID0gY1xuICAgICAgICAubWFwKCh2KSA9PiB2ICsgKG1heCAtIHYpICogKDEgLSBzYXQpKVxuICAgICAgICAubWFwKCh2KSA9PiB2ICogYnIpXG4gICAgICAgIC5tYXAoKHYpID0+IE1hdGgucm91bmQodiAqIDI1NSkpO1xuXG4gICAgcmV0dXJuIHtyLCBnLCBiLCBhOiAxfTtcbn1cblxuZnVuY3Rpb24gaHNiVG9TdHJpbmcoaHNiOiBIU0IpIHtcbiAgICBjb25zdCByZ2IgPSBoc2JUb1JHQihoc2IpO1xuICAgIHJldHVybiByZ2JUb0hleFN0cmluZyhyZ2IpO1xufVxuXG5mdW5jdGlvbiByZW5kZXIoY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudCwgZ2V0UGl4ZWw6ICh4LCB5KSA9PiBVaW50OENsYW1wZWRBcnJheSkge1xuICAgIGNvbnN0IHt3aWR0aCwgaGVpZ2h0fSA9IGNhbnZhcztcbiAgICBjb25zdCBjb250ZXh0ID0gY2FudmFzLmdldENvbnRleHQoJzJkJyk7XG4gICAgY29uc3QgaW1hZ2VEYXRhID0gY29udGV4dC5nZXRJbWFnZURhdGEoMCwgMCwgd2lkdGgsIGhlaWdodCk7XG4gICAgY29uc3QgZCA9IGltYWdlRGF0YS5kYXRhO1xuICAgIGZvciAobGV0IHkgPSAwOyB5IDwgaGVpZ2h0OyB5KyspIHtcbiAgICAgICAgZm9yIChsZXQgeCA9IDA7IHggPCB3aWR0aDsgeCsrKSB7XG4gICAgICAgICAgICBjb25zdCBpID0gNCAqICh5ICogd2lkdGggKyB4KTtcbiAgICAgICAgICAgIGNvbnN0IGMgPSBnZXRQaXhlbCh4LCB5KTtcbiAgICAgICAgICAgIGZvciAobGV0IGogPSAwOyBqIDwgNDsgaisrKSB7XG4gICAgICAgICAgICAgICAgZFtpICsgal0gPSBjW2pdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIGNvbnRleHQucHV0SW1hZ2VEYXRhKGltYWdlRGF0YSwgMCwgMCk7XG59XG5cbmZ1bmN0aW9uIHJlbmRlckh1ZShjYW52YXM6IEhUTUxDYW52YXNFbGVtZW50KSB7XG4gICAgY29uc3Qge2hlaWdodH0gPSBjYW52YXM7XG4gICAgcmVuZGVyKGNhbnZhcywgKF8sIHkpID0+IHtcbiAgICAgICAgY29uc3QgaHVlID0gc2NhbGUoeSwgMCwgaGVpZ2h0LCAwLCAzNjApO1xuICAgICAgICBjb25zdCB7ciwgZywgYn0gPSBoc2JUb1JHQih7aDogaHVlLCBzOiAxLCBiOiAxfSk7XG4gICAgICAgIHJldHVybiBuZXcgVWludDhDbGFtcGVkQXJyYXkoW3IsIGcsIGIsIDI1NV0pO1xuICAgIH0pO1xufVxuXG5mdW5jdGlvbiByZW5kZXJTQihodWU6IG51bWJlciwgY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudCkge1xuICAgIGNvbnN0IHt3aWR0aCwgaGVpZ2h0fSA9IGNhbnZhcztcbiAgICByZW5kZXIoY2FudmFzLCAoeCwgeSkgPT4ge1xuICAgICAgICBjb25zdCBzYXQgPSBzY2FsZSh4LCAwLCB3aWR0aCAtIDEsIDAsIDEpO1xuICAgICAgICBjb25zdCBiciA9IHNjYWxlKHksIDAsIGhlaWdodCAtIDEsIDEsIDApO1xuICAgICAgICBjb25zdCB7ciwgZywgYn0gPSBoc2JUb1JHQih7aDogaHVlLCBzOiBzYXQsIGI6IGJyfSk7XG4gICAgICAgIHJldHVybiBuZXcgVWludDhDbGFtcGVkQXJyYXkoW3IsIGcsIGIsIDI1NV0pO1xuICAgIH0pO1xufVxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBIU0JQaWNrZXIocHJvcHM6IEhTQlBpY2tlclByb3BzKSB7XG4gICAgY29uc3QgY29udGV4dCA9IGdldENvbnRleHQoKTtcbiAgICBjb25zdCBzdG9yZSA9IGNvbnRleHQuc3RvcmUgYXMgSFNCUGlja2VyU3RhdGU7XG4gICAgc3RvcmUuYWN0aXZlQ2hhbmdlSGFuZGxlciA9IHByb3BzLm9uQ2hhbmdlO1xuXG4gICAgY29uc3QgcHJldkNvbG9yID0gY29udGV4dC5wcmV2ICYmIGNvbnRleHQucHJldi5wcm9wcy5jb2xvcjtcbiAgICBjb25zdCBwcmV2QWN0aXZlQ29sb3IgPSBzdG9yZS5hY3RpdmVIU0IgPyBoc2JUb1N0cmluZyhzdG9yZS5hY3RpdmVIU0IpIDogbnVsbDtcbiAgICBjb25zdCBkaWRDb2xvckNoYW5nZSA9IHByb3BzLmNvbG9yICE9PSBwcmV2Q29sb3IgJiYgcHJvcHMuY29sb3IgIT09IHByZXZBY3RpdmVDb2xvcjtcbiAgICBsZXQgYWN0aXZlSFNCOiBIU0I7XG4gICAgaWYgKGRpZENvbG9yQ2hhbmdlKSB7XG4gICAgICAgIGNvbnN0IHJnYiA9IHBhcnNlKHByb3BzLmNvbG9yKTtcbiAgICAgICAgYWN0aXZlSFNCID0gcmdiVG9IU0IocmdiKTtcbiAgICAgICAgc3RvcmUuYWN0aXZlSFNCID0gYWN0aXZlSFNCO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIGFjdGl2ZUhTQiA9IHN0b3JlLmFjdGl2ZUhTQjtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBvblNCQ2FudmFzUmVuZGVyKGNhbnZhczogSFRNTENhbnZhc0VsZW1lbnQpIHtcbiAgICAgICAgY29uc3QgaHVlID0gYWN0aXZlSFNCLmg7XG4gICAgICAgIGNvbnN0IHByZXZIdWUgPSBwcmV2Q29sb3IgJiYgcmdiVG9IU0IocGFyc2UocHJldkNvbG9yKSkuaDtcbiAgICAgICAgaWYgKGh1ZSA9PT0gcHJldkh1ZSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHJlbmRlclNCKGh1ZSwgY2FudmFzKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBvbkh1ZUNhbnZhc0NyZWF0ZShjYW52YXM6IEhUTUxDYW52YXNFbGVtZW50KSB7XG4gICAgICAgIHJlbmRlckh1ZShjYW52YXMpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNyZWF0ZUhTQlN3aXBlSGFuZGxlcihnZXRFdmVudEhTQjogKGU6IHtjbGllbnRYOiBudW1iZXI7IGNsaWVudFk6IG51bWJlcjsgcmVjdDogQ2xpZW50UmVjdH0pID0+IEhTQikge1xuICAgICAgICByZXR1cm4gY3JlYXRlU3dpcGVIYW5kbGVyKChzdGFydEV2dCwgc3RhcnROYXRpdmVFdnQpID0+IHtcbiAgICAgICAgICAgIHR5cGUgU3dpcGVFdmVudCA9IHR5cGVvZiBzdGFydEV2dDtcblxuICAgICAgICAgICAgY29uc3QgcmVjdCA9IChzdGFydE5hdGl2ZUV2dC5jdXJyZW50VGFyZ2V0IGFzIEhUTUxFbGVtZW50KS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblxuICAgICAgICAgICAgZnVuY3Rpb24gb25Qb2ludGVyTW92ZShlOiBTd2lwZUV2ZW50KSB7XG4gICAgICAgICAgICAgICAgc3RvcmUuYWN0aXZlSFNCID0gZ2V0RXZlbnRIU0Ioey4uLmUsIHJlY3R9KTtcbiAgICAgICAgICAgICAgICBwcm9wcy5vbkNvbG9yUHJldmlldyhoc2JUb1N0cmluZyhzdG9yZS5hY3RpdmVIU0IpKTtcbiAgICAgICAgICAgICAgICBjb250ZXh0LnJlZnJlc2goKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZnVuY3Rpb24gb25Qb2ludGVyVXAoZTogU3dpcGVFdmVudCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGhzYiA9IGdldEV2ZW50SFNCKHsuLi5lLCByZWN0fSk7XG4gICAgICAgICAgICAgICAgc3RvcmUuYWN0aXZlSFNCID0gaHNiO1xuICAgICAgICAgICAgICAgIHByb3BzLm9uQ2hhbmdlKGhzYlRvU3RyaW5nKGhzYikpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBzdG9yZS5hY3RpdmVIU0IgPSBnZXRFdmVudEhTQih7Li4uc3RhcnRFdnQsIHJlY3R9KTtcbiAgICAgICAgICAgIGNvbnRleHQucmVmcmVzaCgpO1xuXG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIG1vdmU6IG9uUG9pbnRlck1vdmUsXG4gICAgICAgICAgICAgICAgdXA6IG9uUG9pbnRlclVwLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgY29uc3Qgb25TQlBvaW50ZXJEb3duID0gY3JlYXRlSFNCU3dpcGVIYW5kbGVyKCh7Y2xpZW50WCwgY2xpZW50WSwgcmVjdH0pID0+IHtcbiAgICAgICAgY29uc3Qgc2F0ID0gY2xhbXAoKGNsaWVudFggLSByZWN0LmxlZnQpIC8gcmVjdC53aWR0aCwgMCwgMSk7XG4gICAgICAgIGNvbnN0IGJyID0gY2xhbXAoMSAtIChjbGllbnRZIC0gcmVjdC50b3ApIC8gcmVjdC5oZWlnaHQsIDAsIDEpO1xuICAgICAgICByZXR1cm4gey4uLmFjdGl2ZUhTQiwgczogc2F0LCBiOiBicn07XG4gICAgfSk7XG5cbiAgICBjb25zdCBvbkh1ZVBvaW50ZXJEb3duID0gY3JlYXRlSFNCU3dpcGVIYW5kbGVyKCh7Y2xpZW50WSwgcmVjdH0pID0+IHtcbiAgICAgICAgY29uc3QgaHVlID0gY2xhbXAoKGNsaWVudFkgLSByZWN0LnRvcCkgLyByZWN0LmhlaWdodCwgMCwgMSkgKiAzNjA7XG4gICAgICAgIHJldHVybiB7Li4uYWN0aXZlSFNCLCBoOiBodWV9O1xuICAgIH0pO1xuXG4gICAgY29uc3QgaHVlQ3Vyc29yU3R5bGUgPSB7XG4gICAgICAgICdiYWNrZ3JvdW5kLWNvbG9yJzogaHNsVG9TdHJpbmcoe2g6IGFjdGl2ZUhTQi5oLCBzOiAxLCBsOiAwLjUsIGE6IDF9KSxcbiAgICAgICAgJ2xlZnQnOiAnMCUnLFxuICAgICAgICAndG9wJzogYCR7YWN0aXZlSFNCLmggLyAzNjAgKiAxMDB9JWAsXG4gICAgfTtcbiAgICBjb25zdCBzYkN1cnNvclN0eWxlID0ge1xuICAgICAgICAnYmFja2dyb3VuZC1jb2xvcic6IHJnYlRvSGV4U3RyaW5nKGhzYlRvUkdCKGFjdGl2ZUhTQikpLFxuICAgICAgICAnbGVmdCc6IGAke2FjdGl2ZUhTQi5zICogMTAwfSVgLFxuICAgICAgICAndG9wJzogYCR7KDEgLSBhY3RpdmVIU0IuYikgKiAxMDB9JWAsXG4gICAgfTtcblxuICAgIHJldHVybiAoXG4gICAgICAgIDxzcGFuIGNsYXNzPVwiaHNiLXBpY2tlclwiPlxuICAgICAgICAgICAgPHNwYW5cbiAgICAgICAgICAgICAgICBjbGFzcz1cImhzYi1waWNrZXJfX3NiLWNvbnRhaW5lclwiXG4gICAgICAgICAgICAgICAgb25tb3VzZWRvd249e29uU0JQb2ludGVyRG93bn1cbiAgICAgICAgICAgICAgICBvbnVwZGF0ZT17KGVsOiBIVE1MRWxlbWVudCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAoc3RvcmUuc2JUb3VjaFN0YXJ0SGFuZGxlcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgZWwucmVtb3ZlRXZlbnRMaXN0ZW5lcigndG91Y2hzdGFydCcsIHN0b3JlLnNiVG91Y2hTdGFydEhhbmRsZXIpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGVsLmFkZEV2ZW50TGlzdGVuZXIoJ3RvdWNoc3RhcnQnLCBvblNCUG9pbnRlckRvd24sIHtwYXNzaXZlOiB0cnVlfSk7XG4gICAgICAgICAgICAgICAgICAgIHN0b3JlLnNiVG91Y2hTdGFydEhhbmRsZXIgPSBvblNCUG9pbnRlckRvd247XG4gICAgICAgICAgICAgICAgfX1cbiAgICAgICAgICAgID5cbiAgICAgICAgICAgICAgICA8Y2FudmFzIGNsYXNzPVwiaHNiLXBpY2tlcl9fc2ItY2FudmFzXCIgb25yZW5kZXI9e29uU0JDYW52YXNSZW5kZXJ9IC8+XG4gICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJoc2ItcGlja2VyX19zYi1jdXJzb3JcIiBzdHlsZT17c2JDdXJzb3JTdHlsZX0+PC9zcGFuPlxuICAgICAgICAgICAgPC9zcGFuPlxuICAgICAgICAgICAgPHNwYW5cbiAgICAgICAgICAgICAgICBjbGFzcz1cImhzYi1waWNrZXJfX2h1ZS1jb250YWluZXJcIlxuICAgICAgICAgICAgICAgIG9ubW91c2Vkb3duPXtvbkh1ZVBvaW50ZXJEb3dufVxuICAgICAgICAgICAgICAgIG9udXBkYXRlPXsoZWw6IEhUTUxFbGVtZW50KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChzdG9yZS5odWVUb3VjaFN0YXJ0SGFuZGxlcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgZWwucmVtb3ZlRXZlbnRMaXN0ZW5lcigndG91Y2hzdGFydCcsIHN0b3JlLmh1ZVRvdWNoU3RhcnRIYW5kbGVyKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBlbC5hZGRFdmVudExpc3RlbmVyKCd0b3VjaHN0YXJ0Jywgb25IdWVQb2ludGVyRG93biwge3Bhc3NpdmU6IHRydWV9KTtcbiAgICAgICAgICAgICAgICAgICAgc3RvcmUuaHVlVG91Y2hTdGFydEhhbmRsZXIgPSBvbkh1ZVBvaW50ZXJEb3duO1xuICAgICAgICAgICAgICAgIH19XG4gICAgICAgICAgICA+XG4gICAgICAgICAgICAgICAgPGNhbnZhcyBjbGFzcz1cImhzYi1waWNrZXJfX2h1ZS1jYW52YXNcIiBvbmNyZWF0ZT17b25IdWVDYW52YXNDcmVhdGV9IC8+XG4gICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJoc2ItcGlja2VyX19odWUtY3Vyc29yXCIgc3R5bGU9e2h1ZUN1cnNvclN0eWxlfT48L3NwYW4+XG4gICAgICAgICAgICA8L3NwYW4+XG4gICAgICAgIDwvc3Bhbj5cbiAgICApO1xufVxuIiwiaW1wb3J0IHttfSBmcm9tICdtYWxldmljJztcbmltcG9ydCB7Z2V0Q29udGV4dH0gZnJvbSAnbWFsZXZpYy9kb20nO1xuaW1wb3J0IHtwYXJzZX0gZnJvbSAnLi4vLi4vLi4vdXRpbHMvY29sb3InO1xuaW1wb3J0IFRleHRCb3ggZnJvbSAnLi4vdGV4dGJveCc7XG5pbXBvcnQgSFNCUGlja2VyIGZyb20gJy4vaHNiLXBpY2tlcic7XG5cbmludGVyZmFjZSBDb2xvclBpY2tlclByb3BzIHtcbiAgICBjbGFzcz86IGFueTtcbiAgICBjb2xvcjogc3RyaW5nO1xuICAgIG9uQ2hhbmdlOiAoY29sb3I6IHN0cmluZykgPT4gdm9pZDtcbiAgICBjYW5SZXNldDogYm9vbGVhbjtcbiAgICBvblJlc2V0OiAoKSA9PiB2b2lkO1xufVxuXG5mdW5jdGlvbiBpc1ZhbGlkQ29sb3IoY29sb3I6IHN0cmluZykge1xuICAgIHRyeSB7XG4gICAgICAgIHBhcnNlKGNvbG9yKTtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG59XG5cbmNvbnN0IGNvbG9yUGlja2VyRm9jdXNlcyA9IG5ldyBXZWFrTWFwPE5vZGUsICgpID0+IHZvaWQ+KCk7XG5cbmZ1bmN0aW9uIGZvY3VzQ29sb3JQaWNrZXIobm9kZTogTm9kZSkge1xuICAgIGNvbnN0IGZvY3VzID0gY29sb3JQaWNrZXJGb2N1c2VzLmdldChub2RlKTtcbiAgICBmb2N1cygpO1xufVxuXG5mdW5jdGlvbiBDb2xvclBpY2tlcihwcm9wczogQ29sb3JQaWNrZXJQcm9wcykge1xuICAgIGNvbnN0IGNvbnRleHQgPSBnZXRDb250ZXh0KCk7XG4gICAgY29udGV4dC5vblJlbmRlcigobm9kZSkgPT4gY29sb3JQaWNrZXJGb2N1c2VzLnNldChub2RlLCBmb2N1cykpO1xuICAgIGNvbnN0IHN0b3JlID0gY29udGV4dC5zdG9yZSBhcyB7aXNGb2N1c2VkOiBib29sZWFuOyB0ZXh0Qm94Tm9kZTogSFRNTElucHV0RWxlbWVudDsgcHJldmlld05vZGU6IEhUTUxFbGVtZW50fTtcblxuICAgIGNvbnN0IGlzQ29sb3JWYWxpZCA9IGlzVmFsaWRDb2xvcihwcm9wcy5jb2xvcik7XG5cbiAgICBmdW5jdGlvbiBvbkNvbG9yUHJldmlldyhwcmV2aWV3Q29sb3I6IHN0cmluZykge1xuICAgICAgICBzdG9yZS5wcmV2aWV3Tm9kZS5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSBwcmV2aWV3Q29sb3I7XG4gICAgICAgIHN0b3JlLnRleHRCb3hOb2RlLnZhbHVlID0gcHJldmlld0NvbG9yO1xuICAgICAgICBzdG9yZS50ZXh0Qm94Tm9kZS5ibHVyKCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gb25Db2xvckNoYW5nZShyYXdWYWx1ZTogc3RyaW5nKSB7XG4gICAgICAgIGNvbnN0IHZhbHVlID0gcmF3VmFsdWUudHJpbSgpO1xuICAgICAgICBpZiAoaXNWYWxpZENvbG9yKHZhbHVlKSkge1xuICAgICAgICAgICAgcHJvcHMub25DaGFuZ2UodmFsdWUpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcHJvcHMub25DaGFuZ2UocHJvcHMuY29sb3IpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZm9jdXMoKSB7XG4gICAgICAgIGlmIChzdG9yZS5pc0ZvY3VzZWQpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBzdG9yZS5pc0ZvY3VzZWQgPSB0cnVlO1xuICAgICAgICBjb250ZXh0LnJlZnJlc2goKTtcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZG93bicsIG9uT3V0ZXJDbGljayk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gYmx1cigpIHtcbiAgICAgICAgaWYgKCFzdG9yZS5pc0ZvY3VzZWQpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcignbW91c2Vkb3duJywgb25PdXRlckNsaWNrKTtcbiAgICAgICAgc3RvcmUuaXNGb2N1c2VkID0gZmFsc2U7XG4gICAgICAgIGNvbnRleHQucmVmcmVzaCgpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHRvZ2dsZUZvY3VzKCkge1xuICAgICAgICBpZiAoc3RvcmUuaXNGb2N1c2VkKSB7XG4gICAgICAgICAgICBibHVyKCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBmb2N1cygpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gb25PdXRlckNsaWNrKGU6IE1vdXNlRXZlbnQpIHtcbiAgICAgICAgaWYgKCFlLmNvbXBvc2VkUGF0aCgpLnNvbWUoKGVsKSA9PiBlbCA9PT0gY29udGV4dC5ub2RlKSkge1xuICAgICAgICAgICAgYmx1cigpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgdGV4dEJveCA9IChcbiAgICAgICAgPFRleHRCb3hcbiAgICAgICAgICAgIGNsYXNzPVwiY29sb3ItcGlja2VyX19pbnB1dFwiXG4gICAgICAgICAgICBvbnJlbmRlcj17KGVsKSA9PiB7XG4gICAgICAgICAgICAgICAgc3RvcmUudGV4dEJveE5vZGUgPSBlbCBhcyBIVE1MSW5wdXRFbGVtZW50O1xuICAgICAgICAgICAgICAgIHN0b3JlLnRleHRCb3hOb2RlLnZhbHVlID0gaXNDb2xvclZhbGlkID8gcHJvcHMuY29sb3IgOiAnJztcbiAgICAgICAgICAgIH19XG4gICAgICAgICAgICBvbmtleXByZXNzPXsoZSkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGlucHV0ID0gZS50YXJnZXQgYXMgSFRNTElucHV0RWxlbWVudDtcbiAgICAgICAgICAgICAgICBpZiAoZS5rZXkgPT09ICdFbnRlcicpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qge3ZhbHVlfSA9IGlucHV0O1xuICAgICAgICAgICAgICAgICAgICBvbkNvbG9yQ2hhbmdlKHZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgYmx1cigpO1xuICAgICAgICAgICAgICAgICAgICBvbkNvbG9yUHJldmlldyh2YWx1ZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfX1cbiAgICAgICAgICAgIG9uZm9jdXM9e2ZvY3VzfVxuICAgICAgICAvPlxuICAgICk7XG5cbiAgICBjb25zdCBwcmV2aWV3RWxlbWVudCA9IChcbiAgICAgICAgPHNwYW5cbiAgICAgICAgICAgIGNsYXNzPVwiY29sb3ItcGlja2VyX19wcmV2aWV3XCJcbiAgICAgICAgICAgIG9uY2xpY2s9e3RvZ2dsZUZvY3VzfVxuICAgICAgICAgICAgb25yZW5kZXI9eyhlbDogSFRNTEVsZW1lbnQpID0+IHtcbiAgICAgICAgICAgICAgICBzdG9yZS5wcmV2aWV3Tm9kZSA9IGVsO1xuICAgICAgICAgICAgICAgIGVsLnN0eWxlLmJhY2tncm91bmRDb2xvciA9IGlzQ29sb3JWYWxpZCA/IHByb3BzLmNvbG9yIDogJ3RyYW5zcGFyZW50JztcbiAgICAgICAgICAgIH19XG4gICAgICAgID48L3NwYW4+XG4gICAgKTtcblxuICAgIGNvbnN0IHJlc2V0QnV0dG9uID0gcHJvcHMuY2FuUmVzZXQgPyAoXG4gICAgICAgIDxzcGFuXG4gICAgICAgICAgICByb2xlPVwiYnV0dG9uXCJcbiAgICAgICAgICAgIGNsYXNzPVwiY29sb3ItcGlja2VyX19yZXNldFwiXG4gICAgICAgICAgICBvbmNsaWNrPXsoKSA9PiB7XG4gICAgICAgICAgICAgICAgcHJvcHMub25SZXNldCgpO1xuICAgICAgICAgICAgICAgIGJsdXIoKTtcbiAgICAgICAgICAgIH19XG4gICAgICAgID48L3NwYW4+XG4gICAgKSA6IG51bGw7XG5cbiAgICBjb25zdCB0ZXh0Qm94TGluZSA9IChcbiAgICAgICAgPHNwYW4gY2xhc3M9XCJjb2xvci1waWNrZXJfX3RleHRib3gtbGluZVwiPlxuICAgICAgICAgICAge3RleHRCb3h9XG4gICAgICAgICAgICB7cHJldmlld0VsZW1lbnR9XG4gICAgICAgICAgICB7cmVzZXRCdXR0b259XG4gICAgICAgIDwvc3Bhbj5cbiAgICApO1xuXG4gICAgY29uc3QgaHNiTGluZSA9IGlzQ29sb3JWYWxpZCA/IChcbiAgICAgICAgPHNwYW4gY2xhc3M9XCJjb2xvci1waWNrZXJfX2hzYi1saW5lXCI+XG4gICAgICAgICAgICA8SFNCUGlja2VyXG4gICAgICAgICAgICAgICAgY29sb3I9e3Byb3BzLmNvbG9yfVxuICAgICAgICAgICAgICAgIG9uQ2hhbmdlPXtvbkNvbG9yQ2hhbmdlfVxuICAgICAgICAgICAgICAgIG9uQ29sb3JQcmV2aWV3PXtvbkNvbG9yUHJldmlld31cbiAgICAgICAgICAgIC8+XG4gICAgICAgIDwvc3Bhbj5cbiAgICApIDogbnVsbDtcblxuICAgIHJldHVybiAoXG4gICAgICAgIDxzcGFuIGNsYXNzPXtbJ2NvbG9yLXBpY2tlcicsIHN0b3JlLmlzRm9jdXNlZCAmJiAnY29sb3ItcGlja2VyLS1mb2N1c2VkJywgcHJvcHMuY2xhc3NdfT5cbiAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwiY29sb3ItcGlja2VyX193cmFwcGVyXCI+XG4gICAgICAgICAgICAgICAge3RleHRCb3hMaW5lfVxuICAgICAgICAgICAgICAgIHtoc2JMaW5lfVxuICAgICAgICAgICAgPC9zcGFuPlxuICAgICAgICA8L3NwYW4+XG4gICAgKTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgT2JqZWN0LmFzc2lnbihDb2xvclBpY2tlciwge2ZvY3VzOiBmb2N1c0NvbG9yUGlja2VyfSk7XG4iLCJpbXBvcnQge2dldENvbnRleHQsIHJlbmRlcn0gZnJvbSAnbWFsZXZpYy9kb20nO1xuaW1wb3J0IHtpc1N0cmluZ2lmeWluZ30gZnJvbSAnbWFsZXZpYy9zdHJpbmcnO1xuXG5jb25zdCBERUZBVUxUX09WRVJMQVlfS0VZID0gU3ltYm9sKCk7XG5jb25zdCBvdmVybGF5Tm9kZXMgPSBuZXcgTWFwPGFueSwgSFRNTEVsZW1lbnQ+KCk7XG5jb25zdCBjbGlja0xpc3RlbmVycyA9IG5ldyBXZWFrTWFwPEhUTUxFbGVtZW50LCAoKSA9PiB2b2lkPigpO1xuXG5mdW5jdGlvbiBnZXRPdmVybGF5RE9NTm9kZShrZXk6IGFueSkge1xuICAgIGlmIChrZXkgPT0gbnVsbCkge1xuICAgICAgICBrZXkgPSBERUZBVUxUX09WRVJMQVlfS0VZO1xuICAgIH1cblxuICAgIGlmICghb3ZlcmxheU5vZGVzLmhhcyhrZXkpKSB7XG4gICAgICAgIGNvbnN0IG5vZGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgbm9kZS5jbGFzc0xpc3QuYWRkKCdvdmVybGF5Jyk7XG4gICAgICAgIG5vZGUuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4ge1xuICAgICAgICAgICAgaWYgKGNsaWNrTGlzdGVuZXJzLmhhcyhub2RlKSAmJiBlLmN1cnJlbnRUYXJnZXQgPT09IG5vZGUpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBsaXN0ZW5lciA9IGNsaWNrTGlzdGVuZXJzLmdldChub2RlKTtcbiAgICAgICAgICAgICAgICBsaXN0ZW5lcigpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgb3ZlcmxheU5vZGVzLnNldChrZXksIG5vZGUpO1xuICAgIH1cbiAgICByZXR1cm4gb3ZlcmxheU5vZGVzLmdldChrZXkpO1xufVxuXG5pbnRlcmZhY2UgT3ZlcmxheVByb3BzIHtcbiAgICBrZXk/OiBhbnk7XG59XG5cbmZ1bmN0aW9uIE92ZXJsYXkocHJvcHM6IE92ZXJsYXlQcm9wcykge1xuICAgIGlmIChpc1N0cmluZ2lmeWluZygpKSB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICByZXR1cm4gZ2V0T3ZlcmxheURPTU5vZGUocHJvcHMua2V5KTtcbn1cblxuaW50ZXJmYWNlIE92ZXJsYXlQb3J0YWxQcm9wcyB7XG4gICAga2V5PzogYW55O1xuICAgIG9uT3V0ZXJDbGljaz86ICgpID0+IHZvaWQ7XG59XG5cbmZ1bmN0aW9uIFBvcnRhbChwcm9wczogT3ZlcmxheVBvcnRhbFByb3BzLCAuLi5jb250ZW50OiBNYWxldmljLkNoaWxkW10pIHtcbiAgICBjb25zdCBjb250ZXh0ID0gZ2V0Q29udGV4dCgpO1xuXG4gICAgY29udGV4dC5vblJlbmRlcigoKSA9PiB7XG4gICAgICAgIGNvbnN0IG5vZGUgPSBnZXRPdmVybGF5RE9NTm9kZShwcm9wcy5rZXkpO1xuICAgICAgICBpZiAocHJvcHMub25PdXRlckNsaWNrKSB7XG4gICAgICAgICAgICBjbGlja0xpc3RlbmVycy5zZXQobm9kZSwgcHJvcHMub25PdXRlckNsaWNrKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNsaWNrTGlzdGVuZXJzLmRlbGV0ZShub2RlKTtcbiAgICAgICAgfVxuICAgICAgICByZW5kZXIobm9kZSwgY29udGVudCk7XG4gICAgfSk7XG5cbiAgICBjb250ZXh0Lm9uUmVtb3ZlKCgpID0+IHtcbiAgICAgICAgY29uc3QgY29udGFpbmVyID0gZ2V0T3ZlcmxheURPTU5vZGUocHJvcHMua2V5KTtcbiAgICAgICAgcmVuZGVyKGNvbnRhaW5lciwgbnVsbCk7XG4gICAgfSk7XG5cbiAgICByZXR1cm4gY29udGV4dC5sZWF2ZSgpO1xufVxuXG5leHBvcnQgZGVmYXVsdCBPYmplY3QuYXNzaWduKE92ZXJsYXksIHtQb3J0YWx9KTtcbiIsImV4cG9ydCBmdW5jdGlvbiBnZXRMb2NhbE1lc3NhZ2UobWVzc2FnZU5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiBjaHJvbWUuaTE4bi5nZXRNZXNzYWdlKG1lc3NhZ2VOYW1lKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFVJTGFuZ3VhZ2UoKSB7XG4gICAgY29uc3QgY29kZSA9IGNocm9tZS5pMThuLmdldFVJTGFuZ3VhZ2UoKTtcbiAgICBpZiAoY29kZS5lbmRzV2l0aCgnLW1hYycpKSB7XG4gICAgICAgIHJldHVybiBjb2RlLnN1YnN0cmluZygwLCBjb2RlLmxlbmd0aCAtIDQpO1xuICAgIH1cbiAgICByZXR1cm4gY29kZTtcbn1cbiIsImltcG9ydCB7bX0gZnJvbSAnbWFsZXZpYyc7XG5pbXBvcnQgVGV4dEJveCBmcm9tICcuLi90ZXh0Ym94JztcbmltcG9ydCB7Z2V0VUlMYW5ndWFnZX0gZnJvbSAnLi4vLi4vLi4vdXRpbHMvbG9jYWxlcyc7XG5pbXBvcnQge3BhcnNlVGltZX0gZnJvbSAnLi4vLi4vLi4vdXRpbHMvdGltZSc7XG5cbmludGVyZmFjZSBUaW1lUGlja2VyUHJvcHMge1xuICAgIHN0YXJ0VGltZTogc3RyaW5nO1xuICAgIGVuZFRpbWU6IHN0cmluZztcbiAgICBvbkNoYW5nZTogKFtzdGFydCwgZW5kXTogW3N0cmluZywgc3RyaW5nXSkgPT4gdm9pZDtcbn1cblxuY29uc3QgaXMxMkggPSAobmV3IERhdGUoKSkudG9Mb2NhbGVUaW1lU3RyaW5nKGdldFVJTGFuZ3VhZ2UoKSkuZW5kc1dpdGgoJ00nKTtcblxuZnVuY3Rpb24gdG9Mb2NhbGVUaW1lKCR0aW1lOiBzdHJpbmcpIHtcbiAgICBjb25zdCBbaG91cnMsIG1pbnV0ZXNdID0gcGFyc2VUaW1lKCR0aW1lKTtcblxuICAgIGNvbnN0IG1tID0gYCR7bWludXRlcyA8IDEwID8gJzAnIDogJyd9JHttaW51dGVzfWA7XG5cbiAgICBpZiAoaXMxMkgpIHtcbiAgICAgICAgY29uc3QgaCA9IChob3VycyA9PT0gMCA/XG4gICAgICAgICAgICAnMTInIDpcbiAgICAgICAgICAgIGhvdXJzID4gMTIgP1xuICAgICAgICAgICAgICAgIChob3VycyAtIDEyKSA6XG4gICAgICAgICAgICAgICAgaG91cnMpO1xuICAgICAgICByZXR1cm4gYCR7aH06JHttbX0ke2hvdXJzIDwgMTIgPyAnQU0nIDogJ1BNJ31gO1xuICAgIH1cblxuICAgIHJldHVybiBgJHtob3Vyc306JHttbX1gO1xufVxuXG5mdW5jdGlvbiB0bzI0SFRpbWUoJHRpbWU6IHN0cmluZykge1xuICAgIGNvbnN0IFtob3VycywgbWludXRlc10gPSBwYXJzZVRpbWUoJHRpbWUpO1xuICAgIGNvbnN0IG1tID0gYCR7bWludXRlcyA8IDEwID8gJzAnIDogJyd9JHttaW51dGVzfWA7XG4gICAgcmV0dXJuIGAke2hvdXJzfToke21tfWA7XG59XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIFRpbWVSYW5nZVBpY2tlcihwcm9wczogVGltZVBpY2tlclByb3BzKSB7XG4gICAgZnVuY3Rpb24gb25TdGFydFRpbWVDaGFuZ2UoJHN0YXJ0VGltZTogc3RyaW5nKSB7XG4gICAgICAgIHByb3BzLm9uQ2hhbmdlKFt0bzI0SFRpbWUoJHN0YXJ0VGltZSksIHByb3BzLmVuZFRpbWVdKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBvbkVuZFRpbWVDaGFuZ2UoJGVuZFRpbWU6IHN0cmluZykge1xuICAgICAgICBwcm9wcy5vbkNoYW5nZShbcHJvcHMuc3RhcnRUaW1lLCB0bzI0SFRpbWUoJGVuZFRpbWUpXSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc2V0U3RhcnRUaW1lKG5vZGU6IEhUTUxJbnB1dEVsZW1lbnQpIHtcbiAgICAgICAgbm9kZS52YWx1ZSA9IHRvTG9jYWxlVGltZShwcm9wcy5zdGFydFRpbWUpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHNldEVuZFRpbWUobm9kZTogSFRNTElucHV0RWxlbWVudCkge1xuICAgICAgICBub2RlLnZhbHVlID0gdG9Mb2NhbGVUaW1lKHByb3BzLmVuZFRpbWUpO1xuICAgIH1cblxuICAgIHJldHVybiAoXG4gICAgICAgIDxzcGFuIGNsYXNzPVwidGltZS1yYW5nZS1waWNrZXJcIj5cbiAgICAgICAgICAgIDxUZXh0Qm94XG4gICAgICAgICAgICAgICAgY2xhc3M9XCJ0aW1lLXJhbmdlLXBpY2tlcl9faW5wdXQgdGltZS1yYW5nZS1waWNrZXJfX2lucHV0LS1zdGFydFwiXG4gICAgICAgICAgICAgICAgcGxhY2Vob2xkZXI9e3RvTG9jYWxlVGltZSgnMTg6MDAnKX1cbiAgICAgICAgICAgICAgICBvbnJlbmRlcj17c2V0U3RhcnRUaW1lfVxuICAgICAgICAgICAgICAgIG9uY2hhbmdlPXsoZSkgPT4gb25TdGFydFRpbWVDaGFuZ2UoKGUudGFyZ2V0IGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlKX1cbiAgICAgICAgICAgICAgICBvbmtleXByZXNzPXsoZSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAoZS5rZXkgPT09ICdFbnRlcicpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGlucHV0ID0gZS50YXJnZXQgYXMgSFRNTElucHV0RWxlbWVudDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlucHV0LmJsdXIoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIG9uU3RhcnRUaW1lQ2hhbmdlKGlucHV0LnZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH19XG5cbiAgICAgICAgICAgIC8+XG4gICAgICAgICAgICA8VGV4dEJveFxuICAgICAgICAgICAgICAgIGNsYXNzPVwidGltZS1yYW5nZS1waWNrZXJfX2lucHV0IHRpbWUtcmFuZ2UtcGlja2VyX19pbnB1dC0tZW5kXCJcbiAgICAgICAgICAgICAgICBwbGFjZWhvbGRlcj17dG9Mb2NhbGVUaW1lKCc5OjAwJyl9XG4gICAgICAgICAgICAgICAgb25yZW5kZXI9e3NldEVuZFRpbWV9XG4gICAgICAgICAgICAgICAgb25jaGFuZ2U9eyhlKSA9PiBvbkVuZFRpbWVDaGFuZ2UoKGUudGFyZ2V0IGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlKX1cbiAgICAgICAgICAgICAgICBvbmtleXByZXNzPXsoZSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAoZS5rZXkgPT09ICdFbnRlcicpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGlucHV0ID0gZS50YXJnZXQgYXMgSFRNTElucHV0RWxlbWVudDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlucHV0LmJsdXIoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIG9uRW5kVGltZUNoYW5nZShpbnB1dC52YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9fVxuICAgICAgICAgICAgLz5cbiAgICAgICAgPC9zcGFuPlxuICAgICk7XG59XG4iLCJleHBvcnQgZGVmYXVsdCB7XG4gICAgY3NzRmlsdGVyOiAnY3NzRmlsdGVyJyxcbiAgICBzdmdGaWx0ZXI6ICdzdmdGaWx0ZXInLFxuICAgIHN0YXRpY1RoZW1lOiAnc3RhdGljVGhlbWUnLFxuICAgIGR5bmFtaWNUaGVtZTogJ2R5bmFtaWNUaGVtZScsXG59O1xuIiwiaW1wb3J0IHtnZXRVSUxhbmd1YWdlfSBmcm9tICcuL2xvY2FsZXMnO1xuXG5leHBvcnQgY29uc3QgQkxPR19VUkwgPSAnaHR0cHM6Ly9kYXJrcmVhZGVyLm9yZy9ibG9nLyc7XG5leHBvcnQgY29uc3QgREVWVE9PTFNfRE9DU19VUkwgPSAnaHR0cHM6Ly9naXRodWIuY29tL2FsZXhhbmRlcmJ5L2RhcmtyZWFkZXIjaG93LXRvLWNvbnRyaWJ1dGUnO1xuZXhwb3J0IGNvbnN0IERPTkFURV9VUkwgPSAnaHR0cHM6Ly9vcGVuY29sbGVjdGl2ZS5jb20vZGFya3JlYWRlcic7XG5leHBvcnQgY29uc3QgR0lUSFVCX1VSTCA9ICdodHRwczovL2dpdGh1Yi5jb20vZGFya3JlYWRlci9kYXJrcmVhZGVyJztcbmV4cG9ydCBjb25zdCBQUklWQUNZX1VSTCA9ICdodHRwczovL2RhcmtyZWFkZXIub3JnL3ByaXZhY3kvJztcbmV4cG9ydCBjb25zdCBUV0lUVEVSX1VSTCA9ICdodHRwczovL3R3aXR0ZXIuY29tL2RhcmtyZWFkZXJhcHAnO1xuZXhwb3J0IGNvbnN0IFVOSU5TVEFMTF9VUkwgPSAnaHR0cHM6Ly9kYXJrcmVhZGVyLm9yZy9nb29kbHVjay8nO1xuXG5jb25zdCBoZWxwTG9jYWxlcyA9IFtcbiAgICAnYmUnLFxuICAgICdjcycsXG4gICAgJ2RlJyxcbiAgICAnZW4nLFxuICAgICdlcycsXG4gICAgJ2ZyJyxcbiAgICAnbmwnLFxuICAgICdpdCcsXG4gICAgJ3B0JyxcbiAgICAncnUnLFxuICAgICd6aC1DTicsXG4gICAgJ3poLVRXJyxcbl07XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRIZWxwVVJMKCkge1xuICAgIGNvbnN0IGxvY2FsZSA9IGdldFVJTGFuZ3VhZ2UoKTtcbiAgICBjb25zdCBtYXRjaExvY2FsZSA9IGhlbHBMb2NhbGVzLmZpbmQoKGhsKSA9PiBobCA9PT0gbG9jYWxlKSB8fCBoZWxwTG9jYWxlcy5maW5kKChobCkgPT4gbG9jYWxlLnN0YXJ0c1dpdGgoaGwpKSB8fCAnZW4nO1xuICAgIHJldHVybiBgaHR0cHM6Ly9kYXJrcmVhZGVyLm9yZy9oZWxwLyR7bWF0Y2hMb2NhbGV9L2A7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRCbG9nUG9zdFVSTChwb3N0SWQ6IHN0cmluZykge1xuICAgIHJldHVybiBgJHtCTE9HX1VSTH0ke3Bvc3RJZH0vYDtcbn1cbiIsImV4cG9ydCBmdW5jdGlvbiBpc0lQVjYodXJsOiBzdHJpbmcpIHtcbiAgICBjb25zdCBvcGVuaW5nQnJhY2tldEluZGV4ID0gdXJsLmluZGV4T2YoJ1snKTtcbiAgICBpZiAob3BlbmluZ0JyYWNrZXRJbmRleCA8IDApIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBjb25zdCBxdWVyeUluZGV4ID0gdXJsLmluZGV4T2YoJz8nKTtcbiAgICBpZiAocXVlcnlJbmRleCA+PSAwICYmIG9wZW5pbmdCcmFja2V0SW5kZXggPiBxdWVyeUluZGV4KSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG59XG5cbmNvbnN0IGlwVjZIb3N0UmVnZXggPSAvXFxbLio/XFxdKFxcOlxcZCspPy87XG5cbmV4cG9ydCBmdW5jdGlvbiBjb21wYXJlSVBWNihmaXJzdFVSTDogc3RyaW5nLCBzZWNvbmRVUkw6IHN0cmluZykge1xuICAgIGNvbnN0IGZpcnN0SG9zdCA9IGZpcnN0VVJMLm1hdGNoKGlwVjZIb3N0UmVnZXgpWzBdO1xuICAgIGNvbnN0IHNlY29uZEhvc3QgPSBzZWNvbmRVUkwubWF0Y2goaXBWNkhvc3RSZWdleClbMF07XG4gICAgcmV0dXJuIGZpcnN0SG9zdCA9PT0gc2Vjb25kSG9zdDtcbn1cbiIsImltcG9ydCB7VXNlclNldHRpbmdzfSBmcm9tICcuLi9kZWZpbml0aW9ucyc7XG5pbXBvcnQge2lzSVBWNiwgY29tcGFyZUlQVjZ9IGZyb20gJy4vaXB2Nic7XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRVUkxIb3N0T3JQcm90b2NvbCgkdXJsOiBzdHJpbmcpIHtcbiAgICBjb25zdCB1cmwgPSBuZXcgVVJMKCR1cmwpO1xuICAgIGlmICh1cmwuaG9zdCkge1xuICAgICAgICByZXR1cm4gdXJsLmhvc3Q7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHVybC5wcm90b2NvbDtcbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjb21wYXJlVVJMUGF0dGVybnMoYTogc3RyaW5nLCBiOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gYS5sb2NhbGVDb21wYXJlKGIpO1xufVxuXG4vKipcbiAqIERldGVybWluZXMgd2hldGhlciBVUkwgaGFzIGEgbWF0Y2ggaW4gVVJMIHRlbXBsYXRlIGxpc3QuXG4gKiBAcGFyYW0gdXJsIFNpdGUgVVJMLlxuICogQHBhcmFtbGlzdCBMaXN0IHRvIHNlYXJjaCBpbnRvLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaXNVUkxJbkxpc3QodXJsOiBzdHJpbmcsIGxpc3Q6IHN0cmluZ1tdKSB7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBsaXN0Lmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmIChpc1VSTE1hdGNoZWQodXJsLCBsaXN0W2ldKSkge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xufVxuXG4vKipcbiAqIERldGVybWluZXMgd2hldGhlciBVUkwgbWF0Y2hlcyB0aGUgdGVtcGxhdGUuXG4gKiBAcGFyYW0gdXJsIFVSTC5cbiAqIEBwYXJhbSB1cmxUZW1wbGF0ZSBVUkwgdGVtcGxhdGUgKFwiZ29vZ2xlLipcIiwgXCJ5b3V0dWJlLmNvbVwiIGV0YykuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc1VSTE1hdGNoZWQodXJsOiBzdHJpbmcsIHVybFRlbXBsYXRlOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICBjb25zdCBpc0ZpcnN0SVBWNiA9IGlzSVBWNih1cmwpO1xuICAgIGNvbnN0IGlzU2Vjb25kSVBWNiA9IGlzSVBWNih1cmxUZW1wbGF0ZSk7XG4gICAgaWYgKGlzRmlyc3RJUFY2ICYmIGlzU2Vjb25kSVBWNikge1xuICAgICAgICByZXR1cm4gY29tcGFyZUlQVjYodXJsLCB1cmxUZW1wbGF0ZSk7XG4gICAgfSBlbHNlIGlmICghaXNTZWNvbmRJUFY2ICYmICFpc1NlY29uZElQVjYpIHtcbiAgICAgICAgY29uc3QgcmVnZXggPSBjcmVhdGVVcmxSZWdleCh1cmxUZW1wbGF0ZSk7XG4gICAgICAgIHJldHVybiBCb29sZWFuKHVybC5tYXRjaChyZWdleCkpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVVybFJlZ2V4KHVybFRlbXBsYXRlOiBzdHJpbmcpOiBSZWdFeHAge1xuICAgIHVybFRlbXBsYXRlID0gdXJsVGVtcGxhdGUudHJpbSgpO1xuICAgIGNvbnN0IGV4YWN0QmVnaW5uaW5nID0gKHVybFRlbXBsYXRlWzBdID09PSAnXicpO1xuICAgIGNvbnN0IGV4YWN0RW5kaW5nID0gKHVybFRlbXBsYXRlW3VybFRlbXBsYXRlLmxlbmd0aCAtIDFdID09PSAnJCcpO1xuXG4gICAgdXJsVGVtcGxhdGUgPSAodXJsVGVtcGxhdGVcbiAgICAgICAgLnJlcGxhY2UoL15cXF4vLCAnJykgLy8gUmVtb3ZlIF4gYXQgc3RhcnRcbiAgICAgICAgLnJlcGxhY2UoL1xcJCQvLCAnJykgLy8gUmVtb3ZlICQgYXQgZW5kXG4gICAgICAgIC5yZXBsYWNlKC9eLio/XFwvezIsM30vLCAnJykgLy8gUmVtb3ZlIHNjaGVtZVxuICAgICAgICAucmVwbGFjZSgvXFw/LiokLywgJycpIC8vIFJlbW92ZSBxdWVyeVxuICAgICAgICAucmVwbGFjZSgvXFwvJC8sICcnKSAvLyBSZW1vdmUgbGFzdCBzbGFzaFxuICAgICk7XG5cbiAgICBsZXQgc2xhc2hJbmRleDogbnVtYmVyO1xuICAgIGxldCBiZWZvcmVTbGFzaDogc3RyaW5nO1xuICAgIGxldCBhZnRlclNsYXNoOiBzdHJpbmc7XG4gICAgaWYgKChzbGFzaEluZGV4ID0gdXJsVGVtcGxhdGUuaW5kZXhPZignLycpKSA+PSAwKSB7XG4gICAgICAgIGJlZm9yZVNsYXNoID0gdXJsVGVtcGxhdGUuc3Vic3RyaW5nKDAsIHNsYXNoSW5kZXgpOyAvLyBnb29nbGUuKlxuICAgICAgICBhZnRlclNsYXNoID0gdXJsVGVtcGxhdGUucmVwbGFjZSgnJCcsICcnKS5zdWJzdHJpbmcoc2xhc2hJbmRleCk7IC8vIC9sb2dpbi9hYmNcbiAgICB9IGVsc2Uge1xuICAgICAgICBiZWZvcmVTbGFzaCA9IHVybFRlbXBsYXRlLnJlcGxhY2UoJyQnLCAnJyk7XG4gICAgfVxuXG4gICAgLy9cbiAgICAvLyBTQ0hFTUUgYW5kIFNVQkRPTUFJTlNcblxuICAgIGxldCByZXN1bHQgPSAoZXhhY3RCZWdpbm5pbmcgP1xuICAgICAgICAnXiguKj9cXFxcOlxcXFwvezIsM30pPycgLy8gU2NoZW1lXG4gICAgICAgIDogJ14oLio/XFxcXDpcXFxcL3syLDN9KT8oW15cXC9dKj9cXFxcLik/JyAvLyBTY2hlbWUgYW5kIHN1YmRvbWFpbnNcbiAgICApO1xuXG4gICAgLy9cbiAgICAvLyBIT1NUIGFuZCBQT1JUXG5cbiAgICBjb25zdCBob3N0UGFydHMgPSBiZWZvcmVTbGFzaC5zcGxpdCgnLicpO1xuICAgIHJlc3VsdCArPSAnKCc7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBob3N0UGFydHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKGhvc3RQYXJ0c1tpXSA9PT0gJyonKSB7XG4gICAgICAgICAgICBob3N0UGFydHNbaV0gPSAnW15cXFxcLlxcXFwvXSs/JztcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXN1bHQgKz0gaG9zdFBhcnRzLmpvaW4oJ1xcXFwuJyk7XG4gICAgcmVzdWx0ICs9ICcpJztcblxuICAgIC8vXG4gICAgLy8gUEFUSCBhbmQgUVVFUllcblxuICAgIGlmIChhZnRlclNsYXNoKSB7XG4gICAgICAgIHJlc3VsdCArPSAnKCc7XG4gICAgICAgIHJlc3VsdCArPSBhZnRlclNsYXNoLnJlcGxhY2UoJy8nLCAnXFxcXC8nKTtcbiAgICAgICAgcmVzdWx0ICs9ICcpJztcbiAgICB9XG5cbiAgICByZXN1bHQgKz0gKGV4YWN0RW5kaW5nID9cbiAgICAgICAgJyhcXFxcLz8oXFxcXD9bXlxcL10qPyk/KSQnIC8vIEFsbCBmb2xsb3dpbmcgcXVlcmllc1xuICAgICAgICA6ICcoXFxcXC8/Lio/KSQnIC8vIEFsbCBmb2xsb3dpbmcgcGF0aHMgYW5kIHF1ZXJpZXNcbiAgICApO1xuXG4gICAgLy9cbiAgICAvLyBSZXN1bHRcblxuICAgIHJldHVybiBuZXcgUmVnRXhwKHJlc3VsdCwgJ2knKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzUERGKHVybDogc3RyaW5nKSB7XG4gICAgaWYgKHVybC5pbmNsdWRlcygnLnBkZicpKSB7XG4gICAgICAgIGlmICh1cmwuaW5jbHVkZXMoJz8nKSkge1xuICAgICAgICAgICAgdXJsID0gdXJsLnN1YnN0cmluZygwLCB1cmwubGFzdEluZGV4T2YoJz8nKSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHVybC5pbmNsdWRlcygnIycpKSB7XG4gICAgICAgICAgICB1cmwgPSB1cmwuc3Vic3RyaW5nKDAsIHVybC5sYXN0SW5kZXhPZignIycpKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodXJsLm1hdGNoKC8od2lraXBlZGlhfHdpa2ltZWRpYSkub3JnL2kpICYmIHVybC5tYXRjaCgvKHdpa2lwZWRpYXx3aWtpbWVkaWEpXFwub3JnXFwvLipcXC9bYS16XStcXDpbXlxcOlxcL10rXFwucGRmL2kpKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHVybC5lbmRzV2l0aCgnLnBkZicpKSB7XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gdXJsLmxlbmd0aDsgMCA8IGk7IGktLSkge1xuICAgICAgICAgICAgICAgIGlmICh1cmxbaV0gPT09ICc9Jykge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICh1cmxbaV0gPT09ICcvJykge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNVUkxFbmFibGVkKHVybDogc3RyaW5nLCB1c2VyU2V0dGluZ3M6IFVzZXJTZXR0aW5ncywge2lzUHJvdGVjdGVkLCBpc0luRGFya0xpc3R9KSB7XG4gICAgaWYgKGlzUHJvdGVjdGVkICYmICF1c2VyU2V0dGluZ3MuZW5hYmxlRm9yUHJvdGVjdGVkUGFnZXMpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBpZiAoaXNQREYodXJsKSkge1xuICAgICAgICByZXR1cm4gdXNlclNldHRpbmdzLmVuYWJsZUZvclBERjtcbiAgICB9XG4gICAgY29uc3QgaXNVUkxJblVzZXJMaXN0ID0gaXNVUkxJbkxpc3QodXJsLCB1c2VyU2V0dGluZ3Muc2l0ZUxpc3QpO1xuICAgIGlmICh1c2VyU2V0dGluZ3MuYXBwbHlUb0xpc3RlZE9ubHkpIHtcbiAgICAgICAgcmV0dXJuIGlzVVJMSW5Vc2VyTGlzdDtcbiAgICB9XG4gICAgLy8gVE9ETzogVXNlIGBzaXRlTGlzdEVuYWJsZWRgLCBgc2l0ZUxpc3REaXNhYmxlZGAsIGBlbmFibGVkQnlEZWZhdWx0YCBvcHRpb25zLlxuICAgIC8vIERlbGV0ZSBgc2l0ZUxpc3RgIGFuZCBgYXBwbHlUb0xpc3RlZE9ubHlgIG9wdGlvbnMsIHRyYW5zZmVyIHVzZXIncyB2YWx1ZXMuXG4gICAgY29uc3QgaXNVUkxJbkVuYWJsZWRMaXN0ID0gaXNVUkxJbkxpc3QodXJsLCB1c2VyU2V0dGluZ3Muc2l0ZUxpc3RFbmFibGVkKTtcbiAgICBpZiAoaXNVUkxJbkVuYWJsZWRMaXN0ICYmIGlzSW5EYXJrTGlzdCkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuICghaXNJbkRhcmtMaXN0ICYmICFpc1VSTEluVXNlckxpc3QpO1xufVxuIiwiaW1wb3J0IHtUaGVtZX0gZnJvbSAnLi4vLi4vLi4vZGVmaW5pdGlvbnMnO1xuaW1wb3J0IHtpc1VSTEluTGlzdH0gZnJvbSAnLi4vLi4vLi4vdXRpbHMvdXJsJztcbmltcG9ydCB7Vmlld1Byb3BzfSBmcm9tICcuLi90eXBlcyc7XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRDdXJyZW50VGhlbWVQcmVzZXQocHJvcHM6IFZpZXdQcm9wcykge1xuICAgIGNvbnN0IGN1c3RvbSA9IHByb3BzLmRhdGEuc2V0dGluZ3MuY3VzdG9tVGhlbWVzLmZpbmQoXG4gICAgICAgICh7dXJsfSkgPT4gaXNVUkxJbkxpc3QocHJvcHMudGFiLnVybCwgdXJsKVxuICAgICk7XG4gICAgY29uc3QgcHJlc2V0ID0gY3VzdG9tID8gbnVsbCA6IHByb3BzLmRhdGEuc2V0dGluZ3MucHJlc2V0cy5maW5kKFxuICAgICAgICAoe3VybHN9KSA9PiBpc1VSTEluTGlzdChwcm9wcy50YWIudXJsLCB1cmxzKVxuICAgICk7XG4gICAgY29uc3QgdGhlbWUgPSBjdXN0b20gP1xuICAgICAgICBjdXN0b20udGhlbWUgOlxuICAgICAgICBwcmVzZXQgP1xuICAgICAgICAgICAgcHJlc2V0LnRoZW1lIDpcbiAgICAgICAgICAgIHByb3BzLmRhdGEuc2V0dGluZ3MudGhlbWU7XG5cbiAgICBmdW5jdGlvbiBzZXRUaGVtZShjb25maWc6IFBhcnRpYWw8VGhlbWU+KSB7XG4gICAgICAgIGlmIChjdXN0b20pIHtcbiAgICAgICAgICAgIGN1c3RvbS50aGVtZSA9IHsuLi5jdXN0b20udGhlbWUsIC4uLmNvbmZpZ307XG4gICAgICAgICAgICBwcm9wcy5hY3Rpb25zLmNoYW5nZVNldHRpbmdzKHtcbiAgICAgICAgICAgICAgICBjdXN0b21UaGVtZXM6IHByb3BzLmRhdGEuc2V0dGluZ3MuY3VzdG9tVGhlbWVzLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gZWxzZSBpZiAocHJlc2V0KSB7XG4gICAgICAgICAgICBwcmVzZXQudGhlbWUgPSB7Li4ucHJlc2V0LnRoZW1lLCAuLi5jb25maWd9O1xuICAgICAgICAgICAgcHJvcHMuYWN0aW9ucy5jaGFuZ2VTZXR0aW5ncyh7XG4gICAgICAgICAgICAgICAgcHJlc2V0czogcHJvcHMuZGF0YS5zZXR0aW5ncy5wcmVzZXRzLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwcm9wcy5hY3Rpb25zLnNldFRoZW1lKGNvbmZpZyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgICB0aGVtZSxcbiAgICAgICAgY2hhbmdlOiBzZXRUaGVtZSxcbiAgICB9O1xufVxuIiwiaW1wb3J0IHttfSBmcm9tICdtYWxldmljJztcbmltcG9ydCB7d2l0aFN0YXRlLCB1c2VTdGF0ZX0gZnJvbSAnbWFsZXZpYy9zdGF0ZSc7XG5pbXBvcnQge0J1dHRvbn0gZnJvbSAnLi4vLi4vY29udHJvbHMnO1xuaW1wb3J0IFRoZW1lRW5naW5lcyBmcm9tICcuLi8uLi8uLi9nZW5lcmF0b3JzL3RoZW1lLWVuZ2luZXMnO1xuaW1wb3J0IHtERVZUT09MU19ET0NTX1VSTH0gZnJvbSAnLi4vLi4vLi4vdXRpbHMvbGlua3MnO1xuaW1wb3J0IHtpc0ZpcmVmb3h9IGZyb20gJy4uLy4uLy4uL3V0aWxzL3BsYXRmb3JtJztcbmltcG9ydCB7RXh0V3JhcHBlciwgVGFiSW5mb30gZnJvbSAnLi4vLi4vLi4vZGVmaW5pdGlvbnMnO1xuaW1wb3J0IHtnZXRDdXJyZW50VGhlbWVQcmVzZXR9IGZyb20gJy4uLy4uL3BvcHVwL3RoZW1lL3V0aWxzJztcblxudHlwZSBCb2R5UHJvcHMgPSBFeHRXcmFwcGVyICYge3RhYjogVGFiSW5mb307XG5cbmZ1bmN0aW9uIEJvZHkoe2RhdGEsIHRhYiwgYWN0aW9uc306IEJvZHlQcm9wcykge1xuICAgIGNvbnN0IHtzdGF0ZSwgc2V0U3RhdGV9ID0gdXNlU3RhdGUoe2Vycm9yVGV4dDogbnVsbCBhcyBzdHJpbmd9KTtcbiAgICBsZXQgdGV4dE5vZGU6IEhUTUxUZXh0QXJlYUVsZW1lbnQ7XG4gICAgY29uc3QgcHJldmlld0J1dHRvblRleHQgPSBkYXRhLnNldHRpbmdzLnByZXZpZXdOZXdEZXNpZ24gPyAnU3dpdGNoIHRvIG9sZCBkZXNpZ24nIDogJ1ByZXZpZXcgbmV3IGRlc2lnbic7XG4gICAgY29uc3Qge3RoZW1lfSA9IGdldEN1cnJlbnRUaGVtZVByZXNldCh7ZGF0YSwgdGFiLCBhY3Rpb25zfSk7XG5cbiAgICBjb25zdCB3cmFwcGVyID0gKHRoZW1lLmVuZ2luZSA9PT0gVGhlbWVFbmdpbmVzLnN0YXRpY1RoZW1lXG4gICAgICAgID8ge1xuICAgICAgICAgICAgaGVhZGVyOiAnU3RhdGljIFRoZW1lIEVkaXRvcicsXG4gICAgICAgICAgICBmaXhlc1RleHQ6IGRhdGEuZGV2dG9vbHMuc3RhdGljVGhlbWVzVGV4dCxcbiAgICAgICAgICAgIGFwcGx5OiAodGV4dCkgPT4gYWN0aW9ucy5hcHBseURldlN0YXRpY1RoZW1lcyh0ZXh0KSxcbiAgICAgICAgICAgIHJlc2V0OiAoKSA9PiBhY3Rpb25zLnJlc2V0RGV2U3RhdGljVGhlbWVzKCksXG4gICAgICAgIH0gOiB0aGVtZS5lbmdpbmUgPT09IFRoZW1lRW5naW5lcy5jc3NGaWx0ZXIgfHwgdGhlbWUuZW5naW5lID09PSBUaGVtZUVuZ2luZXMuc3ZnRmlsdGVyID8ge1xuICAgICAgICAgICAgaGVhZGVyOiAnSW52ZXJzaW9uIEZpeCBFZGl0b3InLFxuICAgICAgICAgICAgZml4ZXNUZXh0OiBkYXRhLmRldnRvb2xzLmZpbHRlckZpeGVzVGV4dCxcbiAgICAgICAgICAgIGFwcGx5OiAodGV4dCkgPT4gYWN0aW9ucy5hcHBseURldkludmVyc2lvbkZpeGVzKHRleHQpLFxuICAgICAgICAgICAgcmVzZXQ6ICgpID0+IGFjdGlvbnMucmVzZXREZXZJbnZlcnNpb25GaXhlcygpLFxuICAgICAgICB9IDoge1xuICAgICAgICAgICAgaGVhZGVyOiAnRHluYW1pYyBUaGVtZSBFZGl0b3InLFxuICAgICAgICAgICAgZml4ZXNUZXh0OiBkYXRhLmRldnRvb2xzLmR5bmFtaWNGaXhlc1RleHQsXG4gICAgICAgICAgICBhcHBseTogKHRleHQpID0+IGFjdGlvbnMuYXBwbHlEZXZEeW5hbWljVGhlbWVGaXhlcyh0ZXh0KSxcbiAgICAgICAgICAgIHJlc2V0OiAoKSA9PiBhY3Rpb25zLnJlc2V0RGV2RHluYW1pY1RoZW1lRml4ZXMoKSxcbiAgICAgICAgfSk7XG5cbiAgICBmdW5jdGlvbiBvblRleHRSZW5kZXIobm9kZTogSFRNTFRleHRBcmVhRWxlbWVudCkge1xuICAgICAgICB0ZXh0Tm9kZSA9IG5vZGU7XG4gICAgICAgIGlmICghc3RhdGUuZXJyb3JUZXh0KSB7XG4gICAgICAgICAgICB0ZXh0Tm9kZS52YWx1ZSA9IHdyYXBwZXIuZml4ZXNUZXh0O1xuICAgICAgICB9XG4gICAgICAgIG5vZGUuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIChlKSA9PiB7XG4gICAgICAgICAgICBpZiAoZS5rZXkgPT09ICdUYWInKSB7XG4gICAgICAgICAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGluZGVudCA9ICcgJy5yZXBlYXQoNCk7XG4gICAgICAgICAgICAgICAgaWYgKGlzRmlyZWZveCgpKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIGh0dHBzOi8vYnVnemlsbGEubW96aWxsYS5vcmcvc2hvd19idWcuY2dpP2lkPTEyMjA2OTZcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgc3RhcnQgPSBub2RlLnNlbGVjdGlvblN0YXJ0O1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBlbmQgPSBub2RlLnNlbGVjdGlvbkVuZDtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYmVmb3JlID0gbm9kZS52YWx1ZS5zdWJzdHJpbmcoMCwgc3RhcnQpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBhZnRlciA9IG5vZGUudmFsdWUuc3Vic3RyaW5nKGVuZCk7XG4gICAgICAgICAgICAgICAgICAgIG5vZGUuZm9jdXMoKTtcbiAgICAgICAgICAgICAgICAgICAgbm9kZS52YWx1ZSA9IGAke2JlZm9yZX0ke2luZGVudH0ke2FmdGVyfWA7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGN1cnNvclBvcyA9IHN0YXJ0ICsgaW5kZW50Lmxlbmd0aDtcbiAgICAgICAgICAgICAgICAgICAgbm9kZS5zZXRTZWxlY3Rpb25SYW5nZShjdXJzb3JQb3MsIGN1cnNvclBvcyk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgZG9jdW1lbnQuZXhlY0NvbW1hbmQoJ2luc2VydFRleHQnLCBmYWxzZSwgaW5kZW50KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGFzeW5jIGZ1bmN0aW9uIGFwcGx5KCkge1xuICAgICAgICBjb25zdCB0ZXh0ID0gdGV4dE5vZGUudmFsdWU7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBhd2FpdCB3cmFwcGVyLmFwcGx5KHRleHQpO1xuICAgICAgICAgICAgc2V0U3RhdGUoe2Vycm9yVGV4dDogbnVsbH0pO1xuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIHNldFN0YXRlKHtcbiAgICAgICAgICAgICAgICBlcnJvclRleHQ6IFN0cmluZyhlcnIpLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiByZXNldCgpIHtcbiAgICAgICAgd3JhcHBlci5yZXNldCgpO1xuICAgICAgICBzZXRTdGF0ZSh7ZXJyb3JUZXh0OiBudWxsfSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gdG9nZ2xlRGVzaWduKCkge1xuICAgICAgICBhY3Rpb25zLmNoYW5nZVNldHRpbmdzKHtwcmV2aWV3TmV3RGVzaWduOiAhZGF0YS5zZXR0aW5ncy5wcmV2aWV3TmV3RGVzaWdufSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIChcbiAgICAgICAgPGJvZHk+XG4gICAgICAgICAgICA8aGVhZGVyPlxuICAgICAgICAgICAgICAgIDxpbWcgaWQ9XCJsb2dvXCIgc3JjPVwiLi4vYXNzZXRzL2ltYWdlcy9kYXJrcmVhZGVyLXR5cGUuc3ZnXCIgYWx0PVwiRGFyayBSZWFkZXJcIiAvPlxuICAgICAgICAgICAgICAgIDxoMSBpZD1cInRpdGxlXCI+RGV2ZWxvcGVyIFRvb2xzPC9oMT5cbiAgICAgICAgICAgIDwvaGVhZGVyPlxuICAgICAgICAgICAgPGgzIGlkPVwic3ViLXRpdGxlXCI+e3dyYXBwZXIuaGVhZGVyfTwvaDM+XG4gICAgICAgICAgICA8dGV4dGFyZWFcbiAgICAgICAgICAgICAgICBpZD1cImVkaXRvclwiXG4gICAgICAgICAgICAgICAgb25yZW5kZXI9e29uVGV4dFJlbmRlcn1cbiAgICAgICAgICAgIC8+XG4gICAgICAgICAgICA8bGFiZWwgaWQ9XCJlcnJvci10ZXh0XCI+e3N0YXRlLmVycm9yVGV4dH08L2xhYmVsPlxuICAgICAgICAgICAgPGRpdiBpZD1cImJ1dHRvbnNcIj5cbiAgICAgICAgICAgICAgICA8QnV0dG9uIG9uY2xpY2s9e3Jlc2V0fT5SZXNldDwvQnV0dG9uPlxuICAgICAgICAgICAgICAgIDxCdXR0b24gb25jbGljaz17YXBwbHl9PkFwcGx5PC9CdXR0b24+XG4gICAgICAgICAgICAgICAgPEJ1dHRvbiBjbGFzcz1cInByZXZpZXctZGVzaWduLWJ1dHRvblwiIG9uY2xpY2s9e3RvZ2dsZURlc2lnbn0+e3ByZXZpZXdCdXR0b25UZXh0fTwvQnV0dG9uPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8cCBpZD1cImRlc2NyaXB0aW9uXCI+XG4gICAgICAgICAgICAgICAgUmVhZCBhYm91dCB0aGlzIHRvb2wgPHN0cm9uZz48YSBocmVmPXtERVZUT09MU19ET0NTX1VSTH0gdGFyZ2V0PVwiX2JsYW5rXCIgcmVsPVwibm9vcGVuZXIgbm9yZWZlcnJlclwiPmhlcmU8L2E+PC9zdHJvbmc+LlxuICAgICAgICAgICAgICAgIElmIGEgPHN0cm9uZz5wb3B1bGFyPC9zdHJvbmc+IHdlYnNpdGUgbG9va3MgaW5jb3JyZWN0XG4gICAgICAgICAgICAgICAgZS1tYWlsIHRvIDxzdHJvbmc+RGFya1JlYWRlckFwcEBnbWFpbC5jb208L3N0cm9uZz5cbiAgICAgICAgICAgIDwvcD5cbiAgICAgICAgPC9ib2R5PlxuICAgICk7XG59XG5cbmV4cG9ydCBkZWZhdWx0IHdpdGhTdGF0ZShCb2R5KTtcbiIsImltcG9ydCB7RXh0ZW5zaW9uRGF0YSwgRXh0ZW5zaW9uQWN0aW9ucywgRmlsdGVyQ29uZmlnLCBUYWJJbmZvLCBNZXNzYWdlLCBVc2VyU2V0dGluZ3N9IGZyb20gJy4uLy4uL2RlZmluaXRpb25zJztcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgQ29ubmVjdG9yIGltcGxlbWVudHMgRXh0ZW5zaW9uQWN0aW9ucyB7XG4gICAgcHJpdmF0ZSBwb3J0OiBjaHJvbWUucnVudGltZS5Qb3J0O1xuICAgIHByaXZhdGUgY291bnRlcjogbnVtYmVyO1xuXG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIHRoaXMuY291bnRlciA9IDA7XG4gICAgICAgIHRoaXMucG9ydCA9IGNocm9tZS5ydW50aW1lLmNvbm5lY3Qoe25hbWU6ICd1aSd9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGdldFJlcXVlc3RJZCgpIHtcbiAgICAgICAgcmV0dXJuICsrdGhpcy5jb3VudGVyO1xuICAgIH1cblxuICAgIHByaXZhdGUgc2VuZFJlcXVlc3Q8VD4ocmVxdWVzdDogTWVzc2FnZSwgZXhlY3V0b3I6IChyZXNwb25zZTogTWVzc2FnZSwgcmVzb2x2ZTogKGRhdGE/OiBUKSA9PiB2b2lkLCByZWplY3Q6IChlcnJvcjogRXJyb3IpID0+IHZvaWQpID0+IHZvaWQpIHtcbiAgICAgICAgY29uc3QgaWQgPSB0aGlzLmdldFJlcXVlc3RJZCgpO1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2U8VD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgbGlzdGVuZXIgPSAoe2lkOiByZXNwb25zZUlkLCAuLi5yZXNwb25zZX06IE1lc3NhZ2UpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAocmVzcG9uc2VJZCA9PT0gaWQpIHtcbiAgICAgICAgICAgICAgICAgICAgZXhlY3V0b3IocmVzcG9uc2UsIHJlc29sdmUsIHJlamVjdCk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMucG9ydC5vbk1lc3NhZ2UucmVtb3ZlTGlzdGVuZXIobGlzdGVuZXIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICB0aGlzLnBvcnQub25NZXNzYWdlLmFkZExpc3RlbmVyKGxpc3RlbmVyKTtcbiAgICAgICAgICAgIHRoaXMucG9ydC5wb3N0TWVzc2FnZSh7Li4ucmVxdWVzdCwgaWR9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgZ2V0RGF0YSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2VuZFJlcXVlc3Q8RXh0ZW5zaW9uRGF0YT4oe3R5cGU6ICdnZXQtZGF0YSd9LCAoe2RhdGF9LCByZXNvbHZlKSA9PiByZXNvbHZlKGRhdGEpKTtcbiAgICB9XG5cbiAgICBnZXRBY3RpdmVUYWJJbmZvKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5zZW5kUmVxdWVzdDxUYWJJbmZvPih7dHlwZTogJ2dldC1hY3RpdmUtdGFiLWluZm8nfSwgKHtkYXRhfSwgcmVzb2x2ZSkgPT4gcmVzb2x2ZShkYXRhKSk7XG4gICAgfVxuXG4gICAgc3Vic2NyaWJlVG9DaGFuZ2VzKGNhbGxiYWNrOiAoZGF0YTogRXh0ZW5zaW9uRGF0YSkgPT4gdm9pZCkge1xuICAgICAgICBjb25zdCBpZCA9IHRoaXMuZ2V0UmVxdWVzdElkKCk7XG4gICAgICAgIHRoaXMucG9ydC5vbk1lc3NhZ2UuYWRkTGlzdGVuZXIoKHtpZDogcmVzcG9uc2VJZCwgZGF0YX06IE1lc3NhZ2UpID0+IHtcbiAgICAgICAgICAgIGlmIChyZXNwb25zZUlkID09PSBpZCkge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKGRhdGEpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5wb3J0LnBvc3RNZXNzYWdlKHt0eXBlOiAnc3Vic2NyaWJlLXRvLWNoYW5nZXMnLCBpZH0pO1xuICAgIH1cblxuICAgIGVuYWJsZSgpIHtcbiAgICAgICAgdGhpcy5wb3J0LnBvc3RNZXNzYWdlKHt0eXBlOiAnZW5hYmxlJ30pO1xuICAgIH1cblxuICAgIGRpc2FibGUoKSB7XG4gICAgICAgIHRoaXMucG9ydC5wb3N0TWVzc2FnZSh7dHlwZTogJ2Rpc2FibGUnfSk7XG4gICAgfVxuXG4gICAgc2V0U2hvcnRjdXQoY29tbWFuZDogc3RyaW5nLCBzaG9ydGN1dDogc3RyaW5nKSB7XG4gICAgICAgIHRoaXMucG9ydC5wb3N0TWVzc2FnZSh7dHlwZTogJ3NldC1zaG9ydGN1dCcsIGRhdGE6IHtjb21tYW5kLCBzaG9ydGN1dH19KTtcbiAgICB9XG5cbiAgICBjaGFuZ2VTZXR0aW5ncyhzZXR0aW5nczogUGFydGlhbDxVc2VyU2V0dGluZ3M+KSB7XG4gICAgICAgIHRoaXMucG9ydC5wb3N0TWVzc2FnZSh7dHlwZTogJ2NoYW5nZS1zZXR0aW5ncycsIGRhdGE6IHNldHRpbmdzfSk7XG4gICAgfVxuXG4gICAgc2V0VGhlbWUodGhlbWU6IFBhcnRpYWw8RmlsdGVyQ29uZmlnPikge1xuICAgICAgICB0aGlzLnBvcnQucG9zdE1lc3NhZ2Uoe3R5cGU6ICdzZXQtdGhlbWUnLCBkYXRhOiB0aGVtZX0pO1xuICAgIH1cblxuICAgIHRvZ2dsZVVSTCh1cmw6IHN0cmluZykge1xuICAgICAgICB0aGlzLnBvcnQucG9zdE1lc3NhZ2Uoe3R5cGU6ICd0b2dnbGUtdXJsJywgZGF0YTogdXJsfSk7XG4gICAgfVxuXG4gICAgbWFya05ld3NBc1JlYWQoaWRzOiBzdHJpbmdbXSkge1xuICAgICAgICB0aGlzLnBvcnQucG9zdE1lc3NhZ2Uoe3R5cGU6ICdtYXJrLW5ld3MtYXMtcmVhZCcsIGRhdGE6IGlkc30pO1xuICAgIH1cblxuICAgIGxvYWRDb25maWcob3B0aW9uczoge2xvY2FsOiBib29sZWFufSkge1xuICAgICAgICB0aGlzLnBvcnQucG9zdE1lc3NhZ2Uoe3R5cGU6ICdsb2FkLWNvbmZpZycsIGRhdGE6IG9wdGlvbnN9KTtcbiAgICB9XG5cbiAgICBhcHBseURldkR5bmFtaWNUaGVtZUZpeGVzKHRleHQ6IHN0cmluZykge1xuICAgICAgICByZXR1cm4gdGhpcy5zZW5kUmVxdWVzdDx2b2lkPih7dHlwZTogJ2FwcGx5LWRldi1keW5hbWljLXRoZW1lLWZpeGVzJywgZGF0YTogdGV4dH0sICh7ZXJyb3J9LCByZXNvbHZlLCByZWplY3QpID0+IGVycm9yID8gcmVqZWN0KGVycm9yKSA6IHJlc29sdmUoKSk7XG4gICAgfVxuXG4gICAgcmVzZXREZXZEeW5hbWljVGhlbWVGaXhlcygpIHtcbiAgICAgICAgdGhpcy5wb3J0LnBvc3RNZXNzYWdlKHt0eXBlOiAncmVzZXQtZGV2LWR5bmFtaWMtdGhlbWUtZml4ZXMnfSk7XG4gICAgfVxuXG4gICAgYXBwbHlEZXZJbnZlcnNpb25GaXhlcyh0ZXh0OiBzdHJpbmcpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2VuZFJlcXVlc3Q8dm9pZD4oe3R5cGU6ICdhcHBseS1kZXYtaW52ZXJzaW9uLWZpeGVzJywgZGF0YTogdGV4dH0sICh7ZXJyb3J9LCByZXNvbHZlLCByZWplY3QpID0+IGVycm9yID8gcmVqZWN0KGVycm9yKSA6IHJlc29sdmUoKSk7XG4gICAgfVxuXG4gICAgcmVzZXREZXZJbnZlcnNpb25GaXhlcygpIHtcbiAgICAgICAgdGhpcy5wb3J0LnBvc3RNZXNzYWdlKHt0eXBlOiAncmVzZXQtZGV2LWludmVyc2lvbi1maXhlcyd9KTtcbiAgICB9XG5cbiAgICBhcHBseURldlN0YXRpY1RoZW1lcyh0ZXh0OiBzdHJpbmcpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2VuZFJlcXVlc3Q8dm9pZD4oe3R5cGU6ICdhcHBseS1kZXYtc3RhdGljLXRoZW1lcycsIGRhdGE6IHRleHR9LCAoe2Vycm9yfSwgcmVzb2x2ZSwgcmVqZWN0KSA9PiBlcnJvciA/IHJlamVjdChlcnJvcikgOiByZXNvbHZlKCkpO1xuICAgIH1cblxuICAgIHJlc2V0RGV2U3RhdGljVGhlbWVzKCkge1xuICAgICAgICB0aGlzLnBvcnQucG9zdE1lc3NhZ2Uoe3R5cGU6ICdyZXNldC1kZXYtc3RhdGljLXRoZW1lcyd9KTtcbiAgICB9XG5cbiAgICBkaXNjb25uZWN0KCkge1xuICAgICAgICB0aGlzLnBvcnQuZGlzY29ubmVjdCgpO1xuICAgIH1cbn1cbiIsImltcG9ydCB7Z2V0VVJMSG9zdE9yUHJvdG9jb2x9IGZyb20gJy4uLy4uL3V0aWxzL3VybCc7XG5pbXBvcnQge0V4dGVuc2lvbkRhdGEsIFRhYkluZm8sIFRoZW1lLCBVc2VyU2V0dGluZ3N9IGZyb20gJy4uLy4uL2RlZmluaXRpb25zJztcblxuZXhwb3J0IGZ1bmN0aW9uIGdldE1vY2tEYXRhKG92ZXJyaWRlID0ge30gYXMgUGFydGlhbDxFeHRlbnNpb25EYXRhPik6IEV4dGVuc2lvbkRhdGEge1xuICAgIHJldHVybiBPYmplY3QuYXNzaWduKHtcbiAgICAgICAgaXNFbmFibGVkOiB0cnVlLFxuICAgICAgICBpc1JlYWR5OiB0cnVlLFxuICAgICAgICBzZXR0aW5nczoge1xuICAgICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICAgIHByZXNldHM6IFtdLFxuICAgICAgICAgICAgdGhlbWU6IHtcbiAgICAgICAgICAgICAgICBtb2RlOiAxLFxuICAgICAgICAgICAgICAgIGJyaWdodG5lc3M6IDExMCxcbiAgICAgICAgICAgICAgICBjb250cmFzdDogOTAsXG4gICAgICAgICAgICAgICAgZ3JheXNjYWxlOiAyMCxcbiAgICAgICAgICAgICAgICBzZXBpYTogMTAsXG4gICAgICAgICAgICAgICAgdXNlRm9udDogZmFsc2UsXG4gICAgICAgICAgICAgICAgZm9udEZhbWlseTogJ1NlZ29lIFVJJyxcbiAgICAgICAgICAgICAgICB0ZXh0U3Ryb2tlOiAwLFxuICAgICAgICAgICAgICAgIGVuZ2luZTogJ2Nzc0ZpbHRlcicsXG4gICAgICAgICAgICAgICAgc3R5bGVzaGVldDogJycsXG4gICAgICAgICAgICAgICAgc2Nyb2xsYmFyQ29sb3I6ICdhdXRvJyxcbiAgICAgICAgICAgICAgICBzdHlsZVN5c3RlbUNvbnRyb2xzOiB0cnVlLFxuICAgICAgICAgICAgfSBhcyBUaGVtZSxcbiAgICAgICAgICAgIGN1c3RvbVRoZW1lczogW10sXG4gICAgICAgICAgICBzaXRlTGlzdDogW10sXG4gICAgICAgICAgICBzaXRlTGlzdEVuYWJsZWQ6IFtdLFxuICAgICAgICAgICAgYXBwbHlUb0xpc3RlZE9ubHk6IGZhbHNlLFxuICAgICAgICAgICAgY2hhbmdlQnJvd3NlclRoZW1lOiBmYWxzZSxcbiAgICAgICAgICAgIGVuYWJsZUZvclBERjogdHJ1ZSxcbiAgICAgICAgICAgIGVuYWJsZUZvclByb3RlY3RlZFBhZ2VzOiBmYWxzZSxcbiAgICAgICAgICAgIG5vdGlmeU9mTmV3czogZmFsc2UsXG4gICAgICAgICAgICBzeW5jU2V0dGluZ3M6IHRydWUsXG4gICAgICAgICAgICBhdXRvbWF0aW9uOiAnJyxcbiAgICAgICAgICAgIHRpbWU6IHtcbiAgICAgICAgICAgICAgICBhY3RpdmF0aW9uOiAnMTg6MDAnLFxuICAgICAgICAgICAgICAgIGRlYWN0aXZhdGlvbjogJzk6MDAnLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGxvY2F0aW9uOiB7XG4gICAgICAgICAgICAgICAgbGF0aXR1ZGU6IDUyLjQyMzcxNzgsXG4gICAgICAgICAgICAgICAgbG9uZ2l0dWRlOiAzMS4wMjE3ODYsXG4gICAgICAgICAgICB9LFxuICAgICAgICB9IGFzIFVzZXJTZXR0aW5ncyxcbiAgICAgICAgZm9udHM6IFtcbiAgICAgICAgICAgICdzZXJpZicsXG4gICAgICAgICAgICAnc2Fucy1zZXJpZicsXG4gICAgICAgICAgICAnbW9ub3NwYWNlJyxcbiAgICAgICAgICAgICdjdXJzaXZlJyxcbiAgICAgICAgICAgICdmYW50YXN5JyxcbiAgICAgICAgICAgICdzeXN0ZW0tdWknXG4gICAgICAgIF0sXG4gICAgICAgIG5ld3M6IFtdLFxuICAgICAgICBzaG9ydGN1dHM6IHtcbiAgICAgICAgICAgICdhZGRTaXRlJzogJ0FsdCtTaGlmdCtBJyxcbiAgICAgICAgICAgICd0b2dnbGUnOiAnQWx0K1NoaWZ0K0QnXG4gICAgICAgIH0sXG4gICAgICAgIGRldnRvb2xzOiB7XG4gICAgICAgICAgICBkeW5hbWljRml4ZXNUZXh0OiAnJyxcbiAgICAgICAgICAgIGZpbHRlckZpeGVzVGV4dDogJycsXG4gICAgICAgICAgICBzdGF0aWNUaGVtZXNUZXh0OiAnJyxcbiAgICAgICAgICAgIGhhc0N1c3RvbUR5bmFtaWNGaXhlczogZmFsc2UsXG4gICAgICAgICAgICBoYXNDdXN0b21GaWx0ZXJGaXhlczogZmFsc2UsXG4gICAgICAgICAgICBoYXNDdXN0b21TdGF0aWNGaXhlczogZmFsc2UsXG4gICAgICAgIH0sXG4gICAgfSBhcyBFeHRlbnNpb25EYXRhLCBvdmVycmlkZSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRNb2NrQWN0aXZlVGFiSW5mbygpOiBUYWJJbmZvIHtcbiAgICByZXR1cm4ge1xuICAgICAgICB1cmw6ICdodHRwczovL2RhcmtyZWFkZXIub3JnLycsXG4gICAgICAgIGlzUHJvdGVjdGVkOiBmYWxzZSxcbiAgICAgICAgaXNJbkRhcmtMaXN0OiBmYWxzZSxcbiAgICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlQ29ubmVjdG9yTW9jaygpIHtcbiAgICBsZXQgbGlzdGVuZXI6IChkYXRhKSA9PiB2b2lkID0gbnVsbDtcbiAgICBjb25zdCBkYXRhID0gZ2V0TW9ja0RhdGEoKTtcbiAgICBjb25zdCB0YWIgPSBnZXRNb2NrQWN0aXZlVGFiSW5mbygpO1xuICAgIGNvbnN0IGNvbm5lY3RvciA9IHtcbiAgICAgICAgZ2V0RGF0YSgpIHtcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoZGF0YSk7XG4gICAgICAgIH0sXG4gICAgICAgIGdldEFjdGl2ZVRhYkluZm8oKSB7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRhYik7XG4gICAgICAgIH0sXG4gICAgICAgIHN1YnNjcmliZVRvQ2hhbmdlcyhjYWxsYmFjaykge1xuICAgICAgICAgICAgbGlzdGVuZXIgPSBjYWxsYmFjaztcbiAgICAgICAgfSxcbiAgICAgICAgY2hhbmdlU2V0dGluZ3Moc2V0dGluZ3MpIHtcbiAgICAgICAgICAgIE9iamVjdC5hc3NpZ24oZGF0YS5zZXR0aW5ncywgc2V0dGluZ3MpO1xuICAgICAgICAgICAgbGlzdGVuZXIoZGF0YSk7XG4gICAgICAgIH0sXG4gICAgICAgIHNldFRoZW1lKHRoZW1lKSB7XG4gICAgICAgICAgICBPYmplY3QuYXNzaWduKGRhdGEuc2V0dGluZ3MudGhlbWUsIHRoZW1lKTtcbiAgICAgICAgICAgIGxpc3RlbmVyKGRhdGEpO1xuICAgICAgICB9LFxuICAgICAgICBzZXRTaG9ydGN1dChjb21tYW5kLCBzaG9ydGN1dCkge1xuICAgICAgICAgICAgT2JqZWN0LmFzc2lnbihkYXRhLnNob3J0Y3V0cywge1tjb21tYW5kXTogc2hvcnRjdXR9KTtcbiAgICAgICAgICAgIGxpc3RlbmVyKGRhdGEpO1xuICAgICAgICB9LFxuICAgICAgICB0b2dnbGVVUkwodXJsKSB7XG4gICAgICAgICAgICBjb25zdCBwYXR0ZXJuID0gZ2V0VVJMSG9zdE9yUHJvdG9jb2wodXJsKTtcbiAgICAgICAgICAgIGNvbnN0IGluZGV4ID0gZGF0YS5zZXR0aW5ncy5zaXRlTGlzdC5pbmRleE9mKHBhdHRlcm4pO1xuICAgICAgICAgICAgaWYgKGluZGV4ID49IDApIHtcbiAgICAgICAgICAgICAgICBkYXRhLnNldHRpbmdzLnNpdGVMaXN0LnNwbGljZShpbmRleCwgMSwgcGF0dGVybik7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGRhdGEuc2V0dGluZ3Muc2l0ZUxpc3QucHVzaChwYXR0ZXJuKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGxpc3RlbmVyKGRhdGEpO1xuICAgICAgICB9LFxuICAgICAgICBtYXJrTmV3c0FzUmVhZChpZHM6IHN0cmluZ1tdKSB7XG4gICAgICAgICAgICBkYXRhLm5ld3NcbiAgICAgICAgICAgICAgICAuZmlsdGVyKCh7aWR9KSA9PiBpZHMuaW5jbHVkZXMoaWQpKVxuICAgICAgICAgICAgICAgIC5mb3JFYWNoKChuZXdzKSA9PiBuZXdzLnJlYWQgPSB0cnVlKTtcbiAgICAgICAgICAgIGxpc3RlbmVyKGRhdGEpO1xuICAgICAgICB9LFxuICAgICAgICBkaXNjb25uZWN0KCkge1xuICAgICAgICAgICAgLy9cbiAgICAgICAgfSxcbiAgICB9O1xuICAgIHJldHVybiBjb25uZWN0b3I7XG59XG4iLCJpbXBvcnQgQ29ubmVjdG9yIGZyb20gJy4vY29ubmVjdG9yJztcbmltcG9ydCB7Y3JlYXRlQ29ubmVjdG9yTW9ja30gZnJvbSAnLi9tb2NrJztcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gY29ubmVjdCgpIHtcbiAgICBpZiAodHlwZW9mIGNocm9tZSA9PT0gJ3VuZGVmaW5lZCcgfHwgIWNocm9tZS5leHRlbnNpb24pIHtcbiAgICAgICAgcmV0dXJuIGNyZWF0ZUNvbm5lY3Rvck1vY2soKSBhcyBDb25uZWN0b3I7XG4gICAgfVxuICAgIHJldHVybiBuZXcgQ29ubmVjdG9yKCk7XG59XG4iLCJpbXBvcnQge219IGZyb20gJ21hbGV2aWMnO1xuaW1wb3J0IHtzeW5jfSBmcm9tICdtYWxldmljL2RvbSc7XG5pbXBvcnQgQm9keSBmcm9tICcuL2NvbXBvbmVudHMvYm9keSc7XG5pbXBvcnQgY29ubmVjdCBmcm9tICcuLi9jb25uZWN0JztcblxuZnVuY3Rpb24gcmVuZGVyQm9keShkYXRhLCB0YWIsIGFjdGlvbnMpIHtcbiAgICBzeW5jKGRvY3VtZW50LmJvZHksIDxCb2R5IGRhdGE9e2RhdGF9IHRhYj17dGFifSBhY3Rpb25zPXthY3Rpb25zfSAvPik7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHN0YXJ0KCkge1xuICAgIGNvbnN0IGNvbm5lY3RvciA9IGNvbm5lY3QoKTtcbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigndW5sb2FkJywgKCkgPT4gY29ubmVjdG9yLmRpc2Nvbm5lY3QoKSk7XG5cbiAgICBjb25zdCBkYXRhID0gYXdhaXQgY29ubmVjdG9yLmdldERhdGEoKTtcbiAgICBjb25zdCB0YWJJbmZvID0gYXdhaXQgY29ubmVjdG9yLmdldEFjdGl2ZVRhYkluZm8oKTtcbiAgICByZW5kZXJCb2R5KGRhdGEsIHRhYkluZm8sIGNvbm5lY3Rvcik7XG4gICAgY29ubmVjdG9yLnN1YnNjcmliZVRvQ2hhbmdlcygoZGF0YSkgPT4gcmVuZGVyQm9keShkYXRhLCB0YWJJbmZvLCBjb25uZWN0b3IpKTtcbn1cblxuc3RhcnQoKTtcbiJdLCJuYW1lcyI6WyJnZXRDb250ZXh0IiwiY2xhc3NlcyIsInJlbmRlciIsIkJvZHkiXSwibWFwcGluZ3MiOiI7OztJQUFBO0lBQ0EsU0FBUyxDQUFDLENBQUMsY0FBYyxFQUFFLEtBQUssRUFBRSxHQUFHLFFBQVEsRUFBRTtJQUMvQyxJQUFJLEtBQUssR0FBRyxLQUFLLElBQUksRUFBRSxDQUFDO0lBQ3hCLElBQUksSUFBSSxPQUFPLGNBQWMsS0FBSyxRQUFRLEVB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QixDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsR0FBRyxHQUFHLEdBQUcsSUFBSSxFQUFFLENBQUMsQ0FBQztTQUNoQzthQUFNLElBQUksR0FBRyxHQUFHLEdBQUcsRUFBRTtZQUNsQixDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEdBQUcsR0FBRyxJQUFJLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztTQUNoQzthQUFNLElBQUksR0FBRyxHQUFHLEdBQUcsRUFBRTtZQUNsQixDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsR0FBRyxHQUFHLElBQUksRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztTQUNoQzthQUFNO1lBQ0gsQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEdBQUcsR0FBRyxHQUFHLElBQUksRUFBRSxDQUFDLENBQUM7U0FDaEM7UUFFRCxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDM0IsTUFBTSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQzthQUNkLEdBQUcsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQzthQUNyQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsQ0FBQzthQUNsQixHQUFHLENBQUMsQ0FBQyxDQUFDLEtBQUssSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUVyQyxPQUFPLEVBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBQyxDQUFDO0lBQzNCLENBQUM7SUFFRCxTQUFTLFdBQVcsQ0FBQyxHQUFRO1FBQ3pCLE1BQU0sR0FBRyxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQztR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
