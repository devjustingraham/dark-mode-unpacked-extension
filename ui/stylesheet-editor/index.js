(function () {
    'use strict';
    function m(tagOrComponent, props, ...children) {
        props = props || {};
        if (typeof tagOrComponent === 'string') {
            const tag = tagOrComponent;
            return { type: tag, props, children };
        }
        if (typeof tagOrComponent === 'function') {
            const component = tagOrComponent;
            return { type: component, props, children };
        }
        throw new Error('Unsupported spec type');
    }
    function createPluginsStore() {
        const plugins = [];
        return {
            add(plugin) {
                plugins.push(plugin);
                return this;
            },
            apply(props) {
                let result;
                let plugin;
                const usedPlugins = new Set();
                for (let i = plugins.length - 1; i >= 0; i--) {
                    plugin = plugins[i];
                    if (usedPlugins.has(plugin)) {
                        continue;
                    }
                    result = plugin(props);
                    if (result != null) {
                        return result;
                    }
                    usedPlugins.add(plugin);
                }
                return null;
            },
            delete(plugin) {
                for (let i = plugins.length - 1; i >= 0; i--) {
                    if (plugins[i] === plugin) {
                        plugins.splice(i, 1);
                        break;
                    }
                }
                return this;
            },
            empty() {
                return plugins.length === 0;
            },
        };
    }
    function iterateComponentPlugins(type, pairs, iterator) {
        pairs
            .filter(([key]) => type[key])
            .forEach(([key, plugins]) => {
            return type[key].forEach((plugin) => iterator(plugins, plugin));
        });
    }
    function addComponentPlugins(type, pairs) {
        iterateComponentPlugins(type, pairs, (plugins, plugin) => plugins.add(plugin));
    }
    function deleteComponentPlugins(type, pairs) {
        iterateComponentPlugins(type, pairs, (plugins, plugin) => plugins.delete(plugin));
    }

    const XHTML_NS = 'http://www.w3.org/1999/xhtml';
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const PLUGINS_CREATE_ELEMENT = Symbol();
    const pluginsCreateElement = createPluginsStore();
    function createElement(spec, parent) {
        const result = pluginsCreateElement.apply({ spec, parent });
        if (result) {
            return result;
        }
        const tag = spec.type;
        if (tag === 'svg') {
            return document.createElementNS(SVG_NS, 'svg');
        }
        const namespace = parent.namespaceURI;
        if (namespace === XHTML_NS || namespace == null) {
            return document.createElement(tag);
        }
        return document.createElementNS(namespace, tag);
    }

    function classes(...args) {
        const classes = [];
        args.filter((c) => Boolean(c)).forEach((c) => {
            if (typeof c === 'string') {
                classes.push(c);
            }
            else if (typeof c === 'object') {
                classes.push(...Object.keys(c).filter((key) => Boolean(c[key])));
            }
        });
        return classes.join(' ');
    }
    function setInlineCSSPropertyValue(element, prop, $value) {
        if ($value != null && $value !== '') {
            let value = String($value);
            let important = '';
            if (value.endsWith('!important')) {
                value = value.substring(0, value.length - 10);
                important = 'important';
            }
            element.style.setProperty(prop, value, important);
        }
        else {
            element.style.removeProperty(prop);
        }
    }

    function isObject(value) {
        return value != null && typeof value === 'object';
    }

    const eventListeners = new WeakMap();
    function addEventListener(element, event, listener) {
        let listeners;
        if (eventListeners.has(element)) {
            listeners = eventListeners.get(element);
        }
        else {
            listeners = new Map();
            eventListeners.set(element, listeners);
        }
        if (listeners.get(event) !== listener) {
            if (listeners.has(event)) {
                element.removeEventListener(event, listeners.get(event));
            }
            element.addEventListener(event, listener);
            listeners.set(event, listener);
        }
    }
    function removeEventListener(element, event) {
        if (!eventListeners.has(element)) {
            return;
        }
        const listeners = eventListeners.get(element);
        element.removeEventListener(event, listeners.get(event));
        listeners.delete(event);
    }

    function setClassObject(element, classObj) {
        const cls = Array.isArray(classObj)
            ? classes(...classObj)
            : classes(classObj);
        if (cls) {
            element.setAttribute('class', cls);
        }
        else {
            element.removeAttribute('class');
        }
    }
    function mergeValues(obj, old) {
        const values = new Map();
        const newProps = new Set(Object.keys(obj));
        const oldProps = Object.keys(old);
        oldProps
            .filter((prop) => !newProps.has(prop))
            .forEach((prop) => values.set(prop, null));
        newProps.forEach((prop) => values.set(prop, obj[prop]));
        return values;
    }
    function setStyleObject(element, styleObj, prev) {
        let prevObj;
        if (isObject(prev)) {
            prevObj = prev;
        }
        else {
            prevObj = {};
            element.removeAttribute('style');
        }
        const declarations = mergeValues(styleObj, prevObj);
        declarations.forEach(($value, prop) => setInlineCSSPropertyValue(element, prop, $value));
    }
    function setEventListener(element, event, listener) {
        if (typeof listener === 'function') {
            addEventListener(element, event, listener);
        }
        else {
            removeEventListener(element, event);
        }
    }
    const specialAttrs = new Set([
        'key',
        'oncreate',
        'onupdate',
        'onrender',
        'onremove',
    ]);
    const PLUGINS_SET_ATTRIBUTE = Symbol();
    const pluginsSetAttribute = createPluginsStore();
    function getPropertyValue(obj, prop) {
        return obj && obj.hasOwnProperty(prop) ? obj[prop] : null;
    }
    function syncAttrs(element, attrs, prev) {
        const values = mergeValues(attrs, prev || {});
        values.forEach((value, attr) => {
            if (!pluginsSetAttribute.empty()) {
                const result = pluginsSetAttribute.apply({
                    element,
                    attr,
                    value,
                    get prev() {
                        return getPropertyValue(prev, attr);
                    },
                });
                if (result != null) {
                    return;
                }
            }
            if (attr === 'class' && isObject(value)) {
                setClassObject(element, value);
            }
            else if (attr === 'style' && isObject(value)) {
                const prevValue = getPropertyValue(prev, attr);
                setStyleObject(element, value, prevValue);
            }
            else if (attr.startsWith('on')) {
                const event = attr.substring(2);
                setEventListener(element, event, value);
            }
            else if (specialAttrs.has(attr)) ;
            else if (value == null || value === false) {
                element.removeAttribute(attr);
            }
            else {
                element.setAttribute(attr, value === true ? '' : String(value));
            }
        });
    }

    class LinkedList {
        constructor(...items) {
            this.nexts = new WeakMap();
            this.prevs = new WeakMap();
            this.first = null;
            this.last = null;
            items.forEach((item) => this.push(item));
        }
        empty() {
            return this.first == null;
        }
        push(item) {
            if (this.empty()) {
                this.first = item;
                this.last = item;
            }
            else {
                this.nexts.set(this.last, item);
                this.prevs.set(item, this.last);
                this.last = item;
            }
        }
        insertBefore(newItem, refItem) {
            const prev = this.before(refItem);
            this.prevs.set(newItem, prev);
            this.nexts.set(newItem, refItem);
            this.prevs.set(refItem, newItem);
            prev && this.nexts.set(prev, newItem);
            refItem === this.first && (this.first = newItem);
        }
        delete(item) {
            const prev = this.before(item);
            const next = this.after(item);
            prev && this.nexts.set(prev, next);
            next && this.prevs.set(next, prev);
            item === this.first && (this.first = next);
            item === this.last && (this.last = prev);
        }
        before(item) {
            return this.prevs.get(item) || null;
        }
        after(item) {
            return this.nexts.get(item) || null;
        }
        loop(iterator) {
            if (this.empty()) {
                return;
            }
            let current = this.first;
            do {
                if (iterator(current)) {
                    break;
                }
            } while ((current = this.after(current)));
        }
        copy() {
            const list = new LinkedList();
            this.loop((item) => {
                list.push(item);
                return false;
            });
            return list;
        }
        forEach(iterator) {
            this.loop((item) => {
                iterator(item);
                return false;
            });
        }
        find(iterator) {
            let result = null;
            this.loop((item) => {
                if (iterator(item)) {
                    result = item;
                    return true;
                }
                return false;
            });
            return result;
        }
        map(iterator) {
            const results = [];
            this.loop((item) => {
                results.push(iterator(item));
                return false;
            });
            return results;
        }
    }

    function matchChildren(vnode, old) {
        const oldChildren = old.children();
        const oldChildrenByKey = new Map();
        const oldChildrenWithoutKey = [];
        oldChildren.forEach((v) => {
            const key = v.key();
            if (key == null) {
                oldChildrenWithoutKey.push(v);
            }
            else {
                oldChildrenByKey.set(key, v);
            }
        });
        const children = vnode.children();
        const matches = [];
        const unmatched = new Set(oldChildren);
        const keys = new Set();
        children.forEach((v) => {
            let match = null;
            let guess = null;
            const key = v.key();
            if (key != null) {
                if (keys.has(key)) {
                    throw new Error('Duplicate key');
                }
                keys.add(key);
                if (oldChildrenByKey.has(key)) {
                    guess = oldChildrenByKey.get(key);
                }
            }
            else if (oldChildrenWithoutKey.length > 0) {
                guess = oldChildrenWithoutKey.shift();
            }
            if (v.matches(guess)) {
                match = guess;
            }
            matches.push([v, match]);
            if (match) {
                unmatched.delete(match);
            }
        });
        return { matches, unmatched };
    }

    function execute(vnode, old, vdom) {
        const didMatch = vnode && old && vnode.matches(old);
        if (didMatch && vnode.parent() === old.parent()) {
            vdom.replaceVNode(old, vnode);
        }
        else if (vnode) {
            vdom.addVNode(vnode);
        }
        const context = vdom.getVNodeContext(vnode);
        const oldContext = vdom.getVNodeContext(old);
        if (old && !didMatch) {
            old.detach(oldContext);
            old.children().forEach((v) => execute(null, v, vdom));
            old.detached(oldContext);
        }
        if (vnode && !didMatch) {
            vnode.attach(context);
            vnode.children().forEach((v) => execute(v, null, vdom));
            vnode.attached(context);
        }
        if (didMatch) {
            const result = vnode.update(old, context);
            if (result !== vdom.LEAVE) {
                const { matches, unmatched } = matchChildren(vnode, old);
                unmatched.forEach((v) => execute(null, v, vdom));
                matches.forEach(([v, o]) => execute(v, o, vdom));
                vnode.updated(context);
            }
        }
    }

    function isSpec(x) {
        return isObject(x) && x.type != null && x.nodeType == null;
    }
    function isNodeSpec(x) {
        return isSpec(x) && typeof x.type === 'string';
    }
    function isComponentSpec(x) {
        return isSpec(x) && typeof x.type === 'function';
    }

    class VNodeBase {
        constructor(parent) {
            this.parentVNode = parent;
        }
        key() {
            return null;
        }
        parent(vnode) {
            if (vnode) {
                this.parentVNode = vnode;
                return;
            }
            return this.parentVNode;
        }
        children() {
            return [];
        }
        attach(context) { }
        detach(context) { }
        update(old, context) {
            return null;
        }
        attached(context) { }
        detached(context) { }
        updated(context) { }
    }
    function nodeMatchesSpec(node, spec) {
        return node instanceof Element && spec.type === node.tagName.toLowerCase();
    }
    const refinedElements = new WeakMap();
    function markElementAsRefined(element, vdom) {
        let refined;
        if (refinedElements.has(vdom)) {
            refined = refinedElements.get(vdom);
        }
        else {
            refined = new WeakSet();
            refinedElements.set(vdom, refined);
        }
        refined.add(element);
    }
    function isElementRefined(element, vdom) {
        return refinedElements.has(vdom) && refinedElements.get(vdom).has(element);
    }
    class ElementVNode extends VNodeBase {
        constructor(spec, parent) {
            super(parent);
            this.spec = spec;
        }
        matches(other) {
            return (other instanceof ElementVNode && this.spec.type === other.spec.type);
        }
        key() {
            return this.spec.props.key;
        }
        children() {
            return [this.child];
        }
        getExistingElement(context) {
            const parent = context.parent;
            const existing = context.node;
            let element;
            if (nodeMatchesSpec(existing, this.spec)) {
                element = existing;
            }
            else if (!isElementRefined(parent, context.vdom) &&
                context.vdom.isDOMNodeCaptured(parent)) {
                const sibling = context.sibling;
                const guess = sibling
                    ? sibling.nextElementSibling
                    : parent.firstElementChild;
                if (guess && !context.vdom.isDOMNodeCaptured(guess)) {
                    if (nodeMatchesSpec(guess, this.spec)) {
                        element = guess;
                    }
                    else {
                        parent.removeChild(guess);
                    }
                }
            }
            return element;
        }
        attach(context) {
            let element;
            const existing = this.getExistingElement(context);
            if (existing) {
                element = existing;
            }
            else {
                element = createElement(this.spec, context.parent);
                markElementAsRefined(element, context.vdom);
            }
            syncAttrs(element, this.spec.props, null);
            this.child = createDOMVNode(element, this.spec.children, this, false);
        }
        update(prev, context) {
            const prevContext = context.vdom.getVNodeContext(prev);
            const element = prevContext.node;
            syncAttrs(element, this.spec.props, prev.spec.props);
            this.child = createDOMVNode(element, this.spec.children, this, false);
        }
        attached(context) {
            const { oncreate, onrender } = this.spec.props;
            if (oncreate) {
                oncreate(context.node);
            }
            if (onrender) {
                onrender(context.node);
            }
        }
        detached(context) {
            const { onremove } = this.spec.props;
            if (onremove) {
                onremove(context.node);
            }
        }
        updated(context) {
            const { onupdate, onrender } = this.spec.props;
            if (onupdate) {
                onupdate(context.node);
            }
            if (onrender) {
                onrender(context.node);
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
    };
    const domPlugins = [
        [PLUGINS_CREATE_ELEMENT, pluginsCreateElement],
        [PLUGINS_SET_ATTRIBUTE, pluginsSetAttribute],
    ];
    class ComponentVNode extends VNodeBase {
        constructor(spec, parent) {
            super(parent);
            this.lock = false;
            this.spec = spec;
            this.prev = null;
            this.store = {};
            this.store[symbols.ACTIVE] = this;
        }
        matches(other) {
            return (other instanceof ComponentVNode &&
                this.spec.type === other.spec.type);
        }
        key() {
            return this.spec.props.key;
        }
        children() {
            return [this.child];
        }
        createContext(context) {
            const { parent } = context;
            const { spec, prev, store } = this;
            return {
                spec,
                prev,
                store,
                get node() {
                    return context.node;
                },
                get nodes() {
                    return context.nodes;
                },
                parent,
                onCreate: (fn) => (store[symbols.CREATED] = fn),
                onUpdate: (fn) => (store[symbols.UPDATED] = fn),
                onRemove: (fn) => (store[symbols.REMOVED] = fn),
                onRender: (fn) => (store[symbols.RENDERED] = fn),
                refresh: () => {
                    const activeVNode = store[symbols.ACTIVE];
                    activeVNode.refresh(context);
                },
                leave: () => context.vdom.LEAVE,
                getStore: (defaults) => {
                    if (defaults && !store[symbols.DEFAULTS_ASSIGNED]) {
                        Object.entries(defaults).forEach(([prop, value]) => {
                            store[prop] = value;
                        });
                        store[symbols.DEFAULTS_ASSIGNED] = true;
                    }
                    return store;
                },
            };
        }
        unbox(context) {
            const Component = this.spec.type;
            const props = this.spec.props;
            const children = this.spec.children;
            this.lock = true;
            const prevContext = ComponentVNode.context;
            ComponentVNode.context = this.createContext(context);
            let unboxed = null;
            try {
                unboxed = Component(props, ...children);
            }
            finally {
                ComponentVNode.context = prevContext;
                this.lock = false;
            }
            return unboxed;
        }
        refresh(context) {
            if (this.lock) {
                throw new Error('Calling refresh during unboxing causes infinite loop');
            }
            this.prev = this.spec;
            const latestContext = context.vdom.getVNodeContext(this);
            const unboxed = this.unbox(latestContext);
            if (unboxed === context.vdom.LEAVE) {
                return;
            }
            const prevChild = this.child;
            this.child = createVNode(unboxed, this);
            context.vdom.execute(this.child, prevChild);
            this.updated(context);
        }
        addPlugins() {
            addComponentPlugins(this.spec.type, domPlugins);
        }
        deletePlugins() {
            deleteComponentPlugins(this.spec.type, domPlugins);
        }
        attach(context) {
            this.addPlugins();
            const unboxed = this.unbox(context);
            const childSpec = unboxed === context.vdom.LEAVE ? null : unboxed;
            this.child = createVNode(childSpec, this);
        }
        update(prev, context) {
            this.store = prev.store;
            this.prev = prev.spec;
            this.store[symbols.ACTIVE] = this;
            const prevContext = context.vdom.getVNodeContext(prev);
            this.addPlugins();
            const unboxed = this.unbox(prevContext);
            let result = null;
            if (unboxed === context.vdom.LEAVE) {
                result = unboxed;
                this.child = prev.child;
                context.vdom.adoptVNode(this.child, this);
            }
            else {
                this.child = createVNode(unboxed, this);
            }
            return result;
        }
        handle(event, context) {
            const fn = this.store[event];
            if (fn) {
                const nodes = context.nodes.length === 0 ? [null] : context.nodes;
                fn(...nodes);
            }
        }
        attached(context) {
            this.deletePlugins();
            this.handle(symbols.CREATED, context);
            this.handle(symbols.RENDERED, context);
        }
        detached(context) {
            this.handle(symbols.REMOVED, context);
        }
        updated(context) {
            this.deletePlugins();
            this.handle(symbols.UPDATED, context);
            this.handle(symbols.RENDERED, context);
        }
    }
    ComponentVNode.context = null;
    function getComponentContext() {
        return ComponentVNode.context;
    }
    class TextVNode extends VNodeBase {
        constructor(text, parent) {
            super(parent);
            this.text = text;
        }
        matches(other) {
            return other instanceof TextVNode;
        }
        children() {
            return [this.child];
        }
        getExistingNode(context) {
            const { parent } = context;
            let node;
            if (context.node instanceof Text) {
                node = context.node;
            }
            else if (!isElementRefined(parent, context.vdom) &&
                context.vdom.isDOMNodeCaptured(parent)) {
                const sibling = context.sibling;
                const guess = sibling ? sibling.nextSibling : parent.firstChild;
                if (guess &&
                    !context.vdom.isDOMNodeCaptured(guess) &&
                    guess instanceof Text) {
                    node = guess;
                }
            }
            return node;
        }
        attach(context) {
            const existing = this.getExistingNode(context);
            let node;
            if (existing) {
                node = existing;
                node.textContent = this.text;
            }
            else {
                node = document.createTextNode(this.text);
            }
            this.child = createVNode(node, this);
        }
        update(prev, context) {
            const prevContext = context.vdom.getVNodeContext(prev);
            const { node } = prevContext;
            if (this.text !== prev.text) {
                node.textContent = this.text;
            }
            this.child = createVNode(node, this);
        }
    }
    class InlineFunctionVNode extends VNodeBase {
        constructor(fn, parent) {
            super(parent);
            this.fn = fn;
        }
        matches(other) {
            return other instanceof InlineFunctionVNode;
        }
        children() {
            return [this.child];
        }
        call(context) {
            const fn = this.fn;
            const inlineFnContext = {
                parent: context.parent,
                get node() {
                    return context.node;
                },
                get nodes() {
                    return context.nodes;
                },
            };
            const result = fn(inlineFnContext);
            this.child = createVNode(result, this);
        }
        attach(context) {
            this.call(context);
        }
        update(prev, context) {
            const prevContext = context.vdom.getVNodeContext(prev);
            this.call(prevContext);
        }
    }
    class NullVNode extends VNodeBase {
        matches(other) {
            return other instanceof NullVNode;
        }
    }
    class DOMVNode extends VNodeBase {
        constructor(node, childSpecs, parent, isNative) {
            super(parent);
            this.node = node;
            this.childSpecs = childSpecs;
            this.isNative = isNative;
        }
        matches(other) {
            return other instanceof DOMVNode && this.node === other.node;
        }
        wrap() {
            this.childVNodes = this.childSpecs.map((spec) => createVNode(spec, this));
        }
        insertNode(context) {
            const { parent, sibling } = context;
            const shouldInsert = !(parent === this.node.parentElement &&
                sibling === this.node.previousSibling);
            if (shouldInsert) {
                const target = sibling ? sibling.nextSibling : parent.firstChild;
                parent.insertBefore(this.node, target);
            }
        }
        attach(context) {
            this.wrap();
            this.insertNode(context);
        }
        detach(context) {
            context.parent.removeChild(this.node);
        }
        update(prev, context) {
            this.wrap();
            this.insertNode(context);
        }
        cleanupDOMChildren(context) {
            const element = this.node;
            for (let current = element.lastChild; current != null;) {
                if (context.vdom.isDOMNodeCaptured(current)) {
                    current = current.previousSibling;
                }
                else {
                    const prev = current.previousSibling;
                    element.removeChild(current);
                    current = prev;
                }
            }
        }
        refine(context) {
            if (!this.isNative) {
                this.cleanupDOMChildren(context);
            }
            const element = this.node;
            markElementAsRefined(element, context.vdom);
        }
        attached(context) {
            const { node } = this;
            if (node instanceof Element &&
                !isElementRefined(node, context.vdom) &&
                context.vdom.isDOMNodeCaptured(node)) {
                this.refine(context);
            }
        }
        children() {
            return this.childVNodes;
        }
    }
    function isDOMVNode(v) {
        return v instanceof DOMVNode;
    }
    function createDOMVNode(node, childSpecs, parent, isNative) {
        return new DOMVNode(node, childSpecs, parent, isNative);
    }
    class ArrayVNode extends VNodeBase {
        constructor(items, key, parent) {
            super(parent);
            this.items = items;
            this.id = key;
        }
        matches(other) {
            return other instanceof ArrayVNode;
        }
        key() {
            return this.id;
        }
        children() {
            return this.childVNodes;
        }
        wrap() {
            this.childVNodes = this.items.map((spec) => createVNode(spec, this));
        }
        attach() {
            this.wrap();
        }
        update() {
            this.wrap();
        }
    }
    function createVNode(spec, parent) {
        if (isNodeSpec(spec)) {
            return new ElementVNode(spec, parent);
        }
        if (isComponentSpec(spec)) {
            if (spec.type === Array) {
                return new ArrayVNode(spec.children, spec.props.key, parent);
            }
            return new ComponentVNode(spec, parent);
        }
        if (typeof spec === 'string') {
            return new TextVNode(spec, parent);
        }
        if (spec == null) {
            return new NullVNode(parent);
        }
        if (typeof spec === 'function') {
            return new InlineFunctionVNode(spec, parent);
        }
        if (spec instanceof Node) {
            return createDOMVNode(spec, [], parent, true);
        }
        if (Array.isArray(spec)) {
            return new ArrayVNode(spec, null, parent);
        }
        throw new Error('Unable to create virtual node for spec');
    }

    function createVDOM(rootNode) {
        const contexts = new WeakMap();
        const hubs = new WeakMap();
        const parentNodes = new WeakMap();
        const passingLinks = new WeakMap();
        const linkedParents = new WeakSet();
        const LEAVE = Symbol();
        function execute$1(vnode, old) {
            execute(vnode, old, vdom);
        }
        function creatVNodeContext(vnode) {
            const parentNode = parentNodes.get(vnode);
            contexts.set(vnode, {
                parent: parentNode,
                get node() {
                    const linked = passingLinks
                        .get(vnode)
                        .find((link) => link.node != null);
                    return linked ? linked.node : null;
                },
                get nodes() {
                    return passingLinks
                        .get(vnode)
                        .map((link) => link.node)
                        .filter((node) => node);
                },
                get sibling() {
                    if (parentNode === rootNode.parentElement) {
                        return passingLinks.get(vnode).first.node.previousSibling;
                    }
                    const hub = hubs.get(parentNode);
                    let current = passingLinks.get(vnode).first;
                    while ((current = hub.links.before(current))) {
                        if (current.node) {
                            return current.node;
                        }
                    }
                    return null;
                },
                vdom,
            });
        }
        function createRootVNodeLinks(vnode) {
            const parentNode = rootNode.parentElement || document.createDocumentFragment();
            const node = rootNode;
            const links = new LinkedList({
                parentNode,
                node,
            });
            passingLinks.set(vnode, links.copy());
            parentNodes.set(vnode, parentNode);
            hubs.set(parentNode, {
                node: parentNode,
                links,
            });
        }
        function createVNodeLinks(vnode) {
            const parent = vnode.parent();
            const isBranch = linkedParents.has(parent);
            const parentNode = isDOMVNode(parent)
                ? parent.node
                : parentNodes.get(parent);
            parentNodes.set(vnode, parentNode);
            const vnodeLinks = new LinkedList();
            passingLinks.set(vnode, vnodeLinks);
            if (isBranch) {
                const newLink = {
                    parentNode,
                    node: null,
                };
                let current = vnode;
                do {
                    passingLinks.get(current).push(newLink);
                    current = current.parent();
                } while (current && !isDOMVNode(current));
                hubs.get(parentNode).links.push(newLink);
            }
            else {
                linkedParents.add(parent);
                const links = isDOMVNode(parent)
                    ? hubs.get(parentNode).links
                    : passingLinks.get(parent);
                links.forEach((link) => vnodeLinks.push(link));
            }
        }
        function connectDOMVNode(vnode) {
            if (isDOMVNode(vnode)) {
                const { node } = vnode;
                hubs.set(node, {
                    node,
                    links: new LinkedList({
                        parentNode: node,
                        node: null,
                    }),
                });
                passingLinks.get(vnode).forEach((link) => (link.node = node));
            }
        }
        function addVNode(vnode) {
            const parent = vnode.parent();
            if (parent == null) {
                createRootVNodeLinks(vnode);
            }
            else {
                createVNodeLinks(vnode);
            }
            connectDOMVNode(vnode);
            creatVNodeContext(vnode);
        }
        function getVNodeContext(vnode) {
            return contexts.get(vnode);
        }
        function getAncestorsLinks(vnode) {
            const parentNode = parentNodes.get(vnode);
            const hub = hubs.get(parentNode);
            const allLinks = [];
            let current = vnode;
            while ((current = current.parent()) && !isDOMVNode(current)) {
                allLinks.push(passingLinks.get(current));
            }
            allLinks.push(hub.links);
            return allLinks;
        }
        function replaceVNode(old, vnode) {
            if (vnode.parent() == null) {
                addVNode(vnode);
                return;
            }
            const oldContext = contexts.get(old);
            const { parent: parentNode } = oldContext;
            parentNodes.set(vnode, parentNode);
            const oldLinks = passingLinks.get(old);
            const newLink = {
                parentNode,
                node: null,
            };
            getAncestorsLinks(vnode).forEach((links) => {
                const nextLink = links.after(oldLinks.last);
                oldLinks.forEach((link) => links.delete(link));
                if (nextLink) {
                    links.insertBefore(newLink, nextLink);
                }
                else {
                    links.push(newLink);
                }
            });
            const vnodeLinks = new LinkedList(newLink);
            passingLinks.set(vnode, vnodeLinks);
            creatVNodeContext(vnode);
        }
        function adoptVNode(vnode, parent) {
            const vnodeLinks = passingLinks.get(vnode);
            const parentLinks = passingLinks.get(parent).copy();
            vnode.parent(parent);
            getAncestorsLinks(vnode).forEach((links) => {
                vnodeLinks.forEach((link) => links.insertBefore(link, parentLinks.first));
                parentLinks.forEach((link) => links.delete(link));
            });
        }
        function isDOMNodeCaptured(node) {
            return hubs.has(node) && node !== rootNode.parentElement;
        }
        const vdom = {
            execute: execute$1,
            addVNode,
            getVNodeContext,
            replaceVNode,
            adoptVNode,
            isDOMNodeCaptured,
            LEAVE,
        };
        return vdom;
    }

    const roots = new WeakMap();
    const vdoms = new WeakMap();
    function realize(node, vnode) {
        const old = roots.get(node) || null;
        roots.set(node, vnode);
        let vdom;
        if (vdoms.has(node)) {
            vdom = vdoms.get(node);
        }
        else {
            vdom = createVDOM(node);
            vdoms.set(node, vdom);
        }
        vdom.execute(vnode, old);
        return vdom.getVNodeContext(vnode);
    }
    function render(element, spec) {
        const vnode = createDOMVNode(element, Array.isArray(spec) ? spec : [spec], null, false);
        realize(element, vnode);
        return element;
    }
    function sync(node, spec) {
        const vnode = createVNode(spec, null);
        const context = realize(node, vnode);
        const { nodes } = context;
        if (nodes.length !== 1 || nodes[0] !== node) {
            throw new Error('Spec does not match the node');
        }
        return nodes[0];
    }

    function classes$1(...args) {
        const classes = [];
        args.filter((c) => Boolean(c)).forEach((c) => {
            if (typeof c === 'string') {
                classes.push(c);
            }
            else if (typeof c === 'object') {
                classes.push(...Object.keys(c).filter((key) => Boolean(c[key])));
            }
        });
        return classes.join(' ');
    }
    function throttle(callback) {
        let frameId = null;
        return ((...args) => {
            if (!frameId) {
                callback(...args);
                frameId = requestAnimationFrame(() => (frameId = null));
            }
        });
    }
    function onSwipeStart(startEventObj, startHandler) {
        const isTouchEvent = typeof TouchEvent !== 'undefined' &&
            startEventObj instanceof TouchEvent;
        const touchId = isTouchEvent
            ? startEventObj.changedTouches[0].identifier
            : null;
        const pointerMoveEvent = isTouchEvent ? 'touchmove' : 'mousemove';
        const pointerUpEvent = isTouchEvent ? 'touchend' : 'mouseup';
        if (!isTouchEvent) {
            startEventObj.preventDefault();
        }
        function getSwipeEventObject(e) {
            const { clientX, clientY } = isTouchEvent
                ? getTouch(e)
                : e;
            return { clientX, clientY };
        }
        const startSE = getSwipeEventObject(startEventObj);
        const { move: moveHandler, up: upHandler } = startHandler(startSE, startEventObj);
        function getTouch(e) {
            return Array.from(e.changedTouches).find(({ identifier: id }) => id === touchId);
        }
        const onPointerMove = throttle((e) => {
            const se = getSwipeEventObject(e);
            moveHandler(se, e);
        });
        function onPointerUp(e) {
            unsubscribe();
            const se = getSwipeEventObject(e);
            upHandler(se, e);
        }
        function unsubscribe() {
            window.removeEventListener(pointerMoveEvent, onPointerMove);
            window.removeEventListener(pointerUpEvent, onPointerUp);
        }
        window.addEventListener(pointerMoveEvent, onPointerMove, { passive: true });
        window.addEventListener(pointerUpEvent, onPointerUp, { passive: true });
    }
    function createSwipeHandler(startHandler) {
        return (e) => onSwipeStart(e, startHandler);
    }

    function toArray(x) {
        return Array.isArray(x) ? x : [x];
    }
    function mergeClass(cls, propsCls) {
        const normalized = toArray(cls).concat(toArray(propsCls));
        return classes$1(...normalized);
    }
    function omitAttrs(omit, attrs) {
        const result = {};
        Object.keys(attrs).forEach((key) => {
            if (omit.indexOf(key) < 0) {
                result[key] = attrs[key];
            }
        });
        return result;
    }

    function Button(props, ...children) {
        const cls = mergeClass('button', props.class);
        const attrs = omitAttrs(['class'], props);
        return (m("button", Object.assign({ class: cls }, attrs),
            m("span", { class: "button__wrapper" }, children)));
    }
    function hslToRGB({ h, s, l, a = 1 }) {
        if (s === 0) {
            const [r, b, g] = [l, l, l].map((x) => Math.round(x * 255));
            return { r, g, b, a };
        }
        const c = (1 - Math.abs(2 * l - 1)) * s;
        const x = c * (1 - Math.abs((h / 60) % 2 - 1));
        const m = l - c / 2;
        const [r, g, b] = (h < 60 ? [c, x, 0] :
            h < 120 ? [x, c, 0] :
                h < 180 ? [0, c, x] :
                    h < 240 ? [0, x, c] :
                        h < 300 ? [x, 0, c] :
                            [c, 0, x]).map((n) => Math.round((n + m) * 255));
        return { r, g, b, a };
    }
    function rgbToHSL({ r: r255, g: g255, b: b255, a = 1 }) {
        const r = r255 / 255;
        const g = g255 / 255;
        const b = b255 / 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const c = max - min;
        const l = (max + min) / 2;
        if (c === 0) {
            return { h: 0, s: 0, l, a };
        }
        let h = (max === r ? (((g - b) / c) % 6) :
            max === g ? ((b - r) / c + 2) :
                ((r - g) / c + 4)) * 60;
        if (h < 0) {
            h += 360;
        }
        const s = c / (1 - Math.abs(2 * l - 1));
        return { h, s, l, a };
    }
    function toFixed(n, digits = 0) {
        const fixed = n.toFixed(digits);
        if (digits === 0) {
            return fixed;
        }
        const dot = fixed.indexOf('.');
        if (dot >= 0) {
            const zerosMatch = fixed.match(/0+$/);
            if (zerosMatch) {
                if (zerosMatch.index === dot + 1) {
                    return fixed.substring(0, dot);
                }
                return fixed.substring(0, zerosMatch.index);
            }
        }
        return fixed;
    }
    function rgbToHexString({ r, g, b, a }) {
        return `#${(a != null && a < 1 ? [r, g, b, Math.round(a * 255)] : [r, g, b]).map((x) => {
        return `${x < 16 ? '0' : ''}${x.toString(16)}`;
    }).join('')}`;
    }
    function hslToString(hsl) {
        const { h, s, l, a } = hsl;
        if (a != null && a < 1) {
            return `hsla(${toFixed(h)}, ${toFixed(s * 100)}%, ${toFixed(l * 100)}%, ${toFixed(a, 2)})`;
        }
        return `hsl(${toFixed(h)}, ${toFixed(s * 100)}%, ${toFixed(l * 100)}%)`;
    }
    const rgbMatch = /^rgba?\([^\(\)]+\)$/;
    const hslMatch = /^hsla?\([^\(\)]+\)$/;
    const hexMatch = /^#[0-9a-f]+$/i;
    function parse($color) {
        const c = $color.trim().toLowerCase();
        if (c.match(rgbMatch)) {
            return parseRGB(c);
        }
        if (c.match(hslMatch)) {
            return parseHSL(c);
        }
        if (c.match(hexMatch)) {
            return parseHex(c);
        }
        if (knownColors.has(c)) {
            return getColorByName(c);
        }
        if (systemColors.has(c)) {
            return getSystemColor(c);
        }
        if ($color === 'transparent') {
            return { r: 0, g: 0, b: 0, a: 0 };
        }
        throw new Error(`Unable to parse ${$color}`);
    }
    function getNumbersFromString(str, splitter, range, units) {
        const raw = str.split(splitter).filter((x) => x);
        const unitsList = Object.entries(units);
        const numbers = raw.map((r) => r.trim()).map((r, i) => {
            let n;
            const unit = unitsList.find(([u]) => r.endsWith(u));
            if (unit) {
                n = parseFloat(r.substring(0, r.length - unit[0].length)) / unit[1] * range[i];
            }
            else {
                n = parseFloat(r);
            }
            if (range[i] > 1) {
                return Math.round(n);
            }
            return n;
        });
        return numbers;
    }
    const rgbSplitter = /rgba?|\(|\)|\/|,|\s/ig;
    const rgbRange = [255, 255, 255, 1];
    const rgbUnits = { '%': 100 };
    function parseRGB($rgb) {
        const [r, g, b, a = 1] = getNumbersFromString($rgb, rgbSplitter, rgbRange, rgbUnits);
        return { r, g, b, a };
    }
    const hslSplitter = /hsla?|\(|\)|\/|,|\s/ig;
    const hslRange = [360, 1, 1, 1];
    const hslUnits = { '%': 100, 'deg': 360, 'rad': 2 * Math.PI, 'turn': 1 };
    function parseHSL($hsl) {
        const [h, s, l, a = 1] = getNumbersFromString($hsl, hslSplitter, hslRange, hslUnits);
        return hslToRGB({ h, s, l, a });
    }
    function parseHex($hex) {
        const h = $hex.substring(1);
        switch (h.length) {
            case 3:
            case 4: {
                const [r, g, b] = [0, 1, 2].map((i) => parseInt(`${h[i]}${h[i]}`, 16));
                const a = h.length === 3 ? 1 : (parseInt(`${h[3]}${h[3]}`, 16) / 255);
                return { r, g, b, a };
            }
            case 6:
            case 8: {
                const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.substring(i, i + 2), 16));
                const a = h.length === 6 ? 1 : (parseInt(h.substring(6, 8), 16) / 255);
                return { r, g, b, a };
            }
        }
        throw new Error(`Unable to parse ${$hex}`);
    }
    function getColorByName($color) {
        const n = knownColors.get($color);
        return {
            r: (n >> 16) & 255,
            g: (n >> 8) & 255,
            b: (n >> 0) & 255,
            a: 1
        };
    }
    function getSystemColor($color) {
        const n = systemColors.get($color);
        return {
            r: (n >> 16) & 255,
            g: (n >> 8) & 255,
            b: (n >> 0) & 255,
            a: 1
        };
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
    }));
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
    }).map(([key, value]) => [key.toLowerCase(), value]));

    function TextBox(props) {
        const cls = mergeClass('textbox', props.class);
        const attrs = omitAttrs(['class', 'type'], props);
        return (m("input", Object.assign({ class: cls, type: "text" }, attrs)));
    }

    function scale(x, inLow, inHigh, outLow, outHigh) {
        return (x - inLow) * (outHigh - outLow) / (inHigh - inLow) + outLow;
    }
    function clamp(x, min, max) {
        return Math.min(max, Math.max(min, x));
    }

    function rgbToHSB({ r, g, b }) {
        const min = Math.min(r, g, b);
        const max = Math.max(r, g, b);
        return {
            h: rgbToHSL({ r, g, b }).h,
            s: max === 0 ? 0 : (1 - (min / max)),
            b: max / 255,
        };
    }
    function hsbToRGB({ h: hue, s: sat, b: br }) {
        let c;
        if (hue < 60) {
            c = [1, hue / 60, 0];
        }
        else if (hue < 120) {
            c = [(120 - hue) / 60, 1, 0];
        }
        else if (hue < 180) {
            c = [0, 1, (hue - 120) / 60];
        }
        else if (hue < 240) {
            c = [0, (240 - hue) / 60, 1];
        }
        else if (hue < 300) {
            c = [(hue - 240) / 60, 0, 1];
        }
        else {
            c = [1, 0, (360 - hue) / 60];
        }
        const max = Math.max(...c);
        const [r, g, b] = c
            .map((v) => v + (max - v) * (1 - sat))
            .map((v) => v * br)
            .map((v) => Math.round(v * 255));
        return { r, g, b, a: 1 };
    }
    function hsbToString(hsb) {
        const rgb = hsbToRGB(hsb);
        return rgbToHexString(rgb);
    }
    function render$1(canvas, getPixel) {
        const { width, height } = canvas;
        const context = canvas.getContext('2d');
        const imageData = context.getImageData(0, 0, width, height);
        const d = imageData.data;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const i = 4 * (y * width + x);
                const c = getPixel(x, y);
                for (let j = 0; j < 4; j++) {
                    d[i + j] = c[j];
                }
            }
        }
        context.putImageData(imageData, 0, 0);
    }
    function renderHue(canvas) {
        const { height } = canvas;
        render$1(canvas, (_, y) => {
            const hue = scale(y, 0, height, 0, 360);
            const { r, g, b } = hsbToRGB({ h: hue, s: 1, b: 1 });
            return new Uint8ClampedArray([r, g, b, 255]);
        });
    }
    function renderSB(hue, canvas) {
        const { width, height } = canvas;
        render$1(canvas, (x, y) => {
            const sat = scale(x, 0, width - 1, 0, 1);
            const br = scale(y, 0, height - 1, 1, 0);
            const { r, g, b } = hsbToRGB({ h: hue, s: sat, b: br });
            return new Uint8ClampedArray([r, g, b, 255]);
        });
    }
    function HSBPicker(props) {
        const context = getComponentContext();
        const store = context.store;
        store.activeChangeHandler = props.onChange;
        const prevColor = context.prev && context.prev.props.color;
        const prevActiveColor = store.activeHSB ? hsbToString(store.activeHSB) : null;
        const didColorChange = props.color !== prevColor && props.color !== prevActiveColor;
        let activeHSB;
        if (didColorChange) {
            const rgb = parse(props.color);
            activeHSB = rgbToHSB(rgb);
            store.activeHSB = activeHSB;
        }
        else {
            activeHSB = store.activeHSB;
        }
        function onSBCanvasRender(canvas) {
            const hue = activeHSB.h;
            const prevHue = prevColor && rgbToHSB(parse(prevColor)).h;
            if (hue === prevHue) {
                return;
            }
            renderSB(hue, canvas);
        }
        function onHueCanvasCreate(canvas) {
            renderHue(canvas);
        }
        function createHSBSwipeHandler(getEventHSB) {
            return createSwipeHandler((startEvt, startNativeEvt) => {
                const rect = startNativeEvt.currentTarget.getBoundingClientRect();
                function onPointerMove(e) {
                    store.activeHSB = getEventHSB({ ...e, rect });
                    props.onColorPreview(hsbToString(store.activeHSB));
                    context.refresh();
                }
                function onPointerUp(e) {
                    const hsb = getEventHSB({ ...e, rect });
                    store.activeHSB = hsb;
                    props.onChange(hsbToString(hsb));
                }
                store.activeHSB = getEventHSB({ ...startEvt, rect });
                context.refresh();
                return {
                    move: onPointerMove,
                    up: onPointerUp,
                };
            });
        }
        const onSBPointerDown = createHSBSwipeHandler(({ clientX, clientY, rect }) => {
            const sat = clamp((clientX - rect.left) / rect.width, 0, 1);
            const br = clamp(1 - (clientY - rect.top) / rect.height, 0, 1);
            return { ...activeHSB, s: sat, b: br };
        });
        const onHuePointerDown = createHSBSwipeHandler(({ clientY, rect }) => {
            const hue = clamp((clientY - rect.top) / rect.height, 0, 1) * 360;
            return { ...activeHSB, h: hue };
        });
        const hueCursorStyle = {
            'background-color': hslToString({ h: activeHSB.h, s: 1, l: 0.5, a: 1 }),
            'left': '0%',
            'top': `${activeHSB.h / 360 * 100}%`,
        };
        const sbCursorStyle = {
            'background-color': rgbToHexString(hsbToRGB(activeHSB)),
            'left': `${activeHSB.s * 100}%`,
            'top': `${(1 - activeHSB.b) * 100}%`,
        };
        return (m("span", { class: "hsb-picker" },
            m("span", { class: "hsb-picker__sb-container", onmousedown: onSBPointerDown, onupdate: (el) => {
                    if (store.sbTouchStartHandler) {
                        el.removeEventListener('touchstart', store.sbTouchStartHandler);
                    }
                    el.addEventListener('touchstart', onSBPointerDown, { passive: true });
                    store.sbTouchStartHandler = onSBPointerDown;
                } },
                m("canvas", { class: "hsb-picker__sb-canvas", onrender: onSBCanvasRender }),
                m("span", { class: "hsb-picker__sb-cursor", style: sbCursorStyle })),
            m("span", { class: "hsb-picker__hue-container", onmousedown: onHuePointerDown, onupdate: (el) => {
                    if (store.hueTouchStartHandler) {
                        el.removeEventListener('touchstart', store.hueTouchStartHandler);
                    }
                    el.addEventListener('touchstart', onHuePointerDown, { passive: true });
                    store.hueTouchStartHandler = onHuePointerDown;
                } },
                m("canvas", { class: "hsb-picker__hue-canvas", oncreate: onHueCanvasCreate }),
                m("span", { class: "hsb-picker__hue-cursor", style: hueCursorStyle }))));
    }

    function isValidColor(color) {
        try {
            parse(color);
            return true;
        }
        catch (err) {
            return false;
        }
    }
    const colorPickerFocuses = new WeakMap();
    function focusColorPicker(node) {
        const focus = colorPickerFocuses.get(node);
        focus();
    }
    function ColorPicker(props) {
        const context = getComponentContext();
        context.onRender((node) => colorPickerFocuses.set(node, focus));
        const store = context.store;
        const isColorValid = isValidColor(props.color);
        function onColorPreview(previewColor) {
            store.previewNode.style.backgroundColor = previewColor;
            store.textBoxNode.value = previewColor;
            store.textBoxNode.blur();
        }
        function onColorChange(rawValue) {
            const value = rawValue.trim();
            if (isValidColor(value)) {
                props.onChange(value);
            }
            else {
                props.onChange(props.color);
            }
        }
        function focus() {
            if (store.isFocused) {
                return;
            }
            store.isFocused = true;
            context.refresh();
            window.addEventListener('mousedown', onOuterClick);
        }
        function blur() {
            if (!store.isFocused) {
                return;
            }
            window.removeEventListener('mousedown', onOuterClick);
            store.isFocused = false;
            context.refresh();
        }
        function toggleFocus() {
            if (store.isFocused) {
                blur();
            }
            else {
                focus();
            }
        }
        function onOuterClick(e) {
            if (!e.composedPath().some((el) => el === context.node)) {
                blur();
            }
        }
        const textBox = (m(TextBox, { class: "color-picker__input", onrender: (el) => {
                store.textBoxNode = el;
                store.textBoxNode.value = isColorValid ? props.color : '';
            }, onkeypress: (e) => {
                const input = e.target;
                if (e.key === 'Enter') {
                    const { value } = input;
                    onColorChange(value);
                    blur();
                    onColorPreview(value);
                }
            }, onfocus: focus }));
        const previewElement = (m("span", { class: "color-picker__preview", onclick: toggleFocus, onrender: (el) => {
                store.previewNode = el;
                el.style.backgroundColor = isColorValid ? props.color : 'transparent';
            } }));
        const resetButton = props.canReset ? (m("span", { role: "button", class: "color-picker__reset", onclick: () => {
                props.onReset();
                blur();
            } })) : null;
        const textBoxLine = (m("span", { class: "color-picker__textbox-line" },
            textBox,
            previewElement,
            resetButton));
        const hsbLine = isColorValid ? (m("span", { class: "color-picker__hsb-line" },
            m(HSBPicker, { color: props.color, onChange: onColorChange, onColorPreview: onColorPreview }))) : null;
        return (m("span", { class: ['color-picker', store.isFocused && 'color-picker--focused', props.class] },
            m("span", { class: "color-picker__wrapper" },
                textBoxLine,
                hsbLine)));
    }
    Object.assign(ColorPicker, { focus: focusColorPicker });

    const DEFAULT_OVERLAY_KEY = Symbol();
    const overlayNodes = new Map();
    const clickListeners = new WeakMap();
    function getOverlayDOMNode(key) {
        if (key == null) {
            key = DEFAULT_OVERLAY_KEY;
        }
        if (!overlayNodes.has(key)) {
            const node = document.createElement('div');
            node.classList.add('overlay');
            node.addEventListener('click', (e) => {
                if (clickListeners.has(node) && e.currentTarget === node) {
                    const listener = clickListeners.get(node);
                    listener();
                }
            });
            overlayNodes.set(key, node);
        }
        return overlayNodes.get(key);
    }
    function Overlay(props) {
        return getOverlayDOMNode(props.key);
    }
    function Portal(props, ...content) {
        const context = getComponentContext();
        context.onRender(() => {
            const node = getOverlayDOMNode(props.key);
            if (props.onOuterClick) {
                clickListeners.set(node, props.onOuterClick);
            }
            else {
                clickListeners.delete(node);
            }
            render(node, content);
        });
        context.onRemove(() => {
            const container = getOverlayDOMNode(props.key);
            render(container, null);
        });
        return context.leave();
    }
    Object.assign(Overlay, { Portal });

    function getUILanguage() {
        const code = chrome.i18n.getUILanguage();
        if (code.endsWith('-mac')) {
            return code.substring(0, code.length - 4);
        }
        return code;
    }

    const is12H = (new Date()).toLocaleTimeString(getUILanguage()).endsWith('M');

    function isIPV6(url) {
        const openingBracketIndex = url.indexOf('[');
        if (openingBracketIndex < 0) {
            return false;
        }
        const queryIndex = url.indexOf('?');
        if (queryIndex >= 0 && openingBracketIndex > queryIndex) {
            return false;
        }
        return true;
    }
    const ipV6HostRegex = /\[.*?\](\:\d+)?/;
    function compareIPV6(firstURL, secondURL) {
        const firstHost = firstURL.match(ipV6HostRegex)[0];
        const secondHost = secondURL.match(ipV6HostRegex)[0];
        return firstHost === secondHost;
    }

    function getURLHostOrProtocol($url) {
        const url = new URL($url);
        if (url.host) {
            return url.host;
        }
        else {
            return url.protocol;
        }
    }
    /**
     * Determines whether URL has a match in URL template list.
     * @param url Site URL.
     * @paramlist List to search into.
     */
    function isURLInList(url, list) {
        for (let i = 0; i < list.length; i++) {
            if (isURLMatched(url, list[i])) {
                return true;
            }
        }
        return false;
    }
    /**
     * Determines whether URL matches the template.
     * @param url URL.
     * @param urlTemplate URL template ("google.*", "youtube.com" etc).
     */
    function isURLMatched(url, urlTemplate) {
        const isFirstIPV6 = isIPV6(url);
        const isSecondIPV6 = isIPV6(urlTemplate);
        if (isFirstIPV6 && isSecondIPV6) {
            return compareIPV6(url, urlTemplate);
        }
        else if (!isSecondIPV6 && !isSecondIPV6) {
            const regex = createUrlRegex(urlTemplate);
            return Boolean(url.match(regex));
        }
        else {
            return false;
        }
    }
    function createUrlRegex(urlTemplate) {
        urlTemplate = urlTemplate.trim();
        const exactBeginning = (urlTemplate[0] === '^');
        const exactEnding = (urlTemplate[urlTemplate.length - 1] === '$');
        urlTemplate = (urlTemplate
            .replace(/^\^/, '') 
            .replace(/\$$/, '') 
            .replace(/^.*?\/{2,3}/, '') 
            .replace(/\?.*$/, '') 
            .replace(/\/$/, '') 
        );
        let slashIndex;
        let beforeSlash;
        let afterSlash;
        if ((slashIndex = urlTemplate.indexOf('/')) >= 0) {
            beforeSlash = urlTemplate.substring(0, slashIndex); 
            afterSlash = urlTemplate.replace('$', '').substring(slashIndex); 
        }
        else {
            beforeSlash = urlTemplate.replace('$', '');
        }

        let result = (exactBeginning ?
            '^(.*?\\:\\/{2,3})?'
            : '^(.*?\\:\\/{2,3})?([^\/]*?\\.)?'
        );

        const hostParts = beforeSlash.split('.');
        result += '(';
        for (let i = 0; i < hostParts.length; i++) {
            if (hostParts[i] === '*') {
                hostParts[i] = '[^\\.\\/]+?';
            }
        }
        result += hostParts.join('\\.');
        result += ')';

        if (afterSlash) {
            result += '(';
            result += afterSlash.replace('/', '\\/');
            result += ')';
        }
        result += (exactEnding ?
            '(\\/?(\\?[^\/]*?)?)$' 
            : '(\\/?.*?)$' 
        );

        return new RegExp(result, 'i');
    }

    function Body({ data, tab, actions }) {
        const host = getURLHostOrProtocol(tab.url);
        const custom = data.settings.customThemes.find(({ url }) => isURLInList(tab.url, url));
        let textNode;
        const placeholderText = [
            '* {',
            '    background-color: #234 !important;',
            '    color: #cba !important;',
            '}',
        ].join('\n');
        function onTextRender(node) {
            textNode = node;
            textNode.value = (custom ? custom.theme.stylesheet : data.settings.theme.stylesheet) || '';
            if (document.activeElement !== textNode) {
                textNode.focus();
            }
        }
        function applyStyleSheet(css) {
            if (custom) {
                custom.theme = { ...custom.theme, ...{ stylesheet: css } };
                actions.changeSettings({ customThemes: data.settings.customThemes });
            }
            else {
                actions.setTheme({ stylesheet: css });
            }
        }
        function reset() {
            applyStyleSheet('');
        }
        function apply() {
            const css = textNode.value;
            applyStyleSheet(css);
        }
        return (m("body", null,
            m("header", null,
                m("h1", { id: "title" }, "CSS Editor")),
            m("h3", { id: "sub-title" }, custom ? host : 'All websites'),
            m("textarea", { id: "editor", native: true, placeholder: placeholderText, onrender: onTextRender }),
            m("div", { id: "buttons" },
                m(Button, { onclick: reset }, "Reset"),
                m(Button, { onclick: apply }, "Apply"))));
    }

    class Connector {
        constructor() {
            this.counter = 0;
            this.port = chrome.runtime.connect({ name: 'ui' });
        }
        getRequestId() {
            return ++this.counter;
        }
        sendRequest(request, executor) {
            const id = this.getRequestId();
            return new Promise((resolve, reject) => {
                const listener = ({ id: responseId, ...response }) => {
                    if (responseId === id) {
                        executor(response, resolve, reject);
                        this.port.onMessage.removeListener(listener);
                    }
                };
                this.port.onMessage.addListener(listener);
                this.port.postMessage({ ...request, id });
            });
        }
        getData() {
            return this.sendRequest({ type: 'get-data' }, ({ data }, resolve) => resolve(data));
        }
        getActiveTabInfo() {
            return this.sendRequest({ type: 'get-active-tab-info' }, ({ data }, resolve) => resolve(data));
        }
        subscribeToChanges(callback) {
            const id = this.getRequestId();
            this.port.onMessage.addListener(({ id: responseId, data }) => {
                if (responseId === id) {
                    callback(data);
                }
            });
            this.port.postMessage({ type: 'subscribe-to-changes', id });
        }
        enable() {
            this.port.postMessage({ type: 'enable' });
        }
        disable() {
            this.port.postMessage({ type: 'disable' });
        }
        setShortcut(command, shortcut) {
            this.port.postMessage({ type: 'set-shortcut', data: { command, shortcut } });
        }
        changeSettings(settings) {
            this.port.postMessage({ type: 'change-settings', data: settings });
        }
        setTheme(theme) {
            this.port.postMessage({ type: 'set-theme', data: theme });
        }
        toggleURL(url) {
            this.port.postMessage({ type: 'toggle-url', data: url });
        }
        markNewsAsRead(ids) {
            this.port.postMessage({ type: 'mark-news-as-read', data: ids });
        }
        loadConfig(options) {
            this.port.postMessage({ type: 'load-config', data: options });
        }
        applyDevDynamicThemeFixes(text) {
            return this.sendRequest({ type: 'apply-dev-dynamic-theme-fixes', data: text }, ({ error }, resolve, reject) => error ? reject(error) : resolve());
        }
        resetDevDynamicThemeFixes() {
            this.port.postMessage({ type: 'reset-dev-dynamic-theme-fixes' });
        }
        applyDevInversionFixes(text) {
            return this.sendRequest({ type: 'apply-dev-inversion-fixes', data: text }, ({ error }, resolve, reject) => error ? reject(error) : resolve());
        }
        resetDevInversionFixes() {
            this.port.postMessage({ type: 'reset-dev-inversion-fixes' });
        }
        applyDevStaticThemes(text) {
            return this.sendRequest({ type: 'apply-dev-static-themes', data: text }, ({ error }, resolve, reject) => error ? reject(error) : resolve());
        }
        resetDevStaticThemes() {
            this.port.postMessage({ type: 'reset-dev-static-themes' });
        }
        disconnect() {
            this.port.disconnect();
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
        }, override);
    }
    function getMockActiveTabInfo() {
        return {
            url: '',
            isProtected: false,
            isInDarkList: false,
        };
    }
    function createConnectorMock() {
        let listener = null;
        const data = getMockData();
        const tab = getMockActiveTabInfo();
        const connector = {
            getData() {
                return Promise.resolve(data);
            },
            getActiveTabInfo() {
                return Promise.resolve(tab);
            },
            subscribeToChanges(callback) {
                listener = callback;
            },
            changeSettings(settings) {
                Object.assign(data.settings, settings);
                listener(data);
            },
            setTheme(theme) {
                Object.assign(data.settings.theme, theme);
                listener(data);
            },
            setShortcut(command, shortcut) {
                Object.assign(data.shortcuts, { [command]: shortcut });
                listener(data);
            },
            toggleURL(url) {
                const pattern = getURLHostOrProtocol(url);
                const index = data.settings.siteList.indexOf(pattern);
                if (index >= 0) {
                    data.settings.siteList.splice(index, 1, pattern);
                }
                else {
                    data.settings.siteList.push(pattern);
                }
                listener(data);
            },
            markNewsAsRead(ids) {
                data.news
                    .filter(({ id }) => ids.includes(id))
                    .forEach((news) => news.read = true);
                listener(data);
            },
            disconnect() {
            },
        };
        return connector;
    }

    function connect() {
        if (typeof chrome === 'undefined' || !chrome.extension) {
            return createConnectorMock();
        }
        return new Connector();
    }

    function renderBody(data, tab, actions) {
        sync(document.body, m(Body, { data: data, tab: tab, actions: actions }));
    }
    async function start() {
        const connector = connect();
        window.addEventListener('unload', () => connector.disconnect());
        const data = await connector.getData();
        const tab = await connector.getActiveTabInfo();
        renderBody(data, tab, connector);
        connector.subscribeToChanges((data) => renderBody(data, tab, connector));
    }
    start();

}());
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL25vZGVfbW9kdWxlcy9tYWxldmljL2luZGV4Lm1qcyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy9tYWxldmljL2RvbS5tanMiLCIuLi8uLi8uLi9zcmMvdWkvdXRpbHMudHMiLCIuLi8uLi8uLi9zcmMvdWkvY29udHJvbHMvdXRpbHMudHMiLCIuLi8uLi8uLi9zcmMvdWkvY29udHJvbHMvYnV0dG9uL2luZGV4LnRzeCIsIi4uLy4uLy4uL3NyYy91dGlscy9jb2xvci50cyIsIi4uLy4uLy4uL3NyYy91aS9jb250cm9scy90ZXh0Ym94L2luZGV4LnRzeCIsIi4uLy4uLy4uL3NyYy91dGlscy9tYXRoLnRzIiwiLi4vLi4vLi4vc3JjL3VpL2NvbnRyb2xzL2NvbG9yLXBpY2tlci9oc2ItcGlja2VyLnRzeCIsIi4uLy4uLy4uL3NyYy91aS9jb250cm9scy9jb2xvci1waWNrZXIvaW5kZXgudHN4IiwiLi4vLi4vLi4vc3JjL3VpL2NvbnRyb2xzL292ZXJsYXkvaW5kZXgudHMiLCIuLi8uLi8uLi9zcmMvdXRpbHMvbG9jYWxlcy50cyIsIi4uLy4uLy4uL3NyYy91aS9jb250cm9scy90aW1lLXJhbmdlLXBpY2tlci9pbmRleC50c3giLCIuLi8uLi8uLi9zcmMvdXRpbHMvaXB2Ni50cyIsIi4uLy4uLy4uL3NyYy91dGlscy91cmwudHMiLCIuLi8uLi8uLi9zcmMvdWkvc3R5bGVzaGVldC1lZGl0b3IvY29tcG9uZW50cy9ib2R5LnRzeCIsIi4uLy4uLy4uL3NyYy91aS9jb25uZWN0L2Nvbm5lY3Rvci50cyIsIi4uLy4uLy4uL3NyYy91aS9jb25uZWN0L21vY2sudHMiLCIuLi8uLi8uLi9zcmMvdWkvY29ubmVjdC9pbmRleC50cyIsIi4uLy4uLy4uL3NyYy91aS9zdHlsZXNoZWV0LWVkaXRvci9pbmRleC50c3giXSwic291cmNlc0NvbnRlbnQiOlsiLyogbWFsZXZpY0AwLjE4LjYgLSBKdWwgMTUsIDIwMjAgKi9cbmZ1bmN0aW9uIG0odGFnT3JDb21wb25lbnQsIHByb3BzLCAuLi5jaGlsZHJlbikge1xuICAgIHByb3BzID0gcHJvcHMgfHwge307XG4gICAgaWYgKHR5cGVvZiB0YWdPckNvbXBvbmVudCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgY29uc3QgdGFnID0gdGFnT3JDb21wb25lbnQ7XG4gICAgICAgIHJldHVybiB7IHR5cGU6IHRhZywgcHJvcHMsIGNoaWxkcmVuIH07XG4gICAgfVxuICAgIGlmICh0eXBlb2YgdGFnT3JDb21wb25lbnQgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgY29uc3QgY29tcG9uZW50ID0gdGFnT3JDb21wb25lbnQ7XG4gICAgICAgIHJldHVybiB7IHR5cGU6IGNvbXBvbmVudCwgcHJvcHMsIGNoaWxkcmVuIH07XG4gICAgfVxuICAgIHRocm93IG5ldyBFcnJvcignVW5zdXBwb3J0ZWQgc3BlYyB0eXBlJyk7XG59XG5cbmV4cG9ydCB7IG0gfTtcbiIsIi8qIG1hbGV2aWNAMC4xOC42IC0gSnVsIDE1LCAyMDIwICovXG5mdW5jdGlvbiBjcmVhdGVQbHVnaW5zU3RvcmUoKSB7XG4gICAgY29uc3QgcGx1Z2lucyA9IFtdO1xuICAgIHJldHVybiB7XG4gICAgICAgIGFkZChwbHVnaW4pIHtcbiAgICAgICAgICAgIHBsdWdpbnMucHVzaChwbHVnaW4pO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgIH0sXG4gICAgICAgIGFwcGx5KHByb3BzKSB7XG4gICAgICAgICAgICBsZXQgcmVzdWx0O1xuICAgICAgICAgICAgbGV0IHBsdWdpbjtcbiAgICAgICAgICAgIGNvbnN0IHVzZWRQbHVnaW5zID0gbmV3IFNldCgpO1xuICAgICAgICAgICAgZm9yIChsZXQgaSA9IHBsdWdpbnMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgICAgICAgICBwbHVnaW4gPSBwbHVnaW5zW2ldO1xuICAgICAgICAgICAgICAgIGlmICh1c2VkUGx1Z2lucy5oYXMocGx1Z2luKSkge1xuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmVzdWx0ID0gcGx1Z2luKHByb3BzKTtcbiAgICAgICAgICAgICAgICBpZiAocmVzdWx0ICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdXNlZFBsdWdpbnMuYWRkKHBsdWdpbik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfSxcbiAgICAgICAgZGVsZXRlKHBsdWdpbikge1xuICAgICAgICAgICAgZm9yIChsZXQgaSA9IHBsdWdpbnMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgICAgICAgICBpZiAocGx1Z2luc1tpXSA9PT0gcGx1Z2luKSB7XG4gICAgICAgICAgICAgICAgICAgIHBsdWdpbnMuc3BsaWNlKGksIDEpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgfSxcbiAgICAgICAgZW1wdHkoKSB7XG4gICAgICAgICAgICByZXR1cm4gcGx1Z2lucy5sZW5ndGggPT09IDA7XG4gICAgICAgIH0sXG4gICAgfTtcbn1cbmZ1bmN0aW9uIGl0ZXJhdGVDb21wb25lbnRQbHVnaW5zKHR5cGUsIHBhaXJzLCBpdGVyYXRvcikge1xuICAgIHBhaXJzXG4gICAgICAgIC5maWx0ZXIoKFtrZXldKSA9PiB0eXBlW2tleV0pXG4gICAgICAgIC5mb3JFYWNoKChba2V5LCBwbHVnaW5zXSkgPT4ge1xuICAgICAgICByZXR1cm4gdHlwZVtrZXldLmZvckVhY2goKHBsdWdpbikgPT4gaXRlcmF0b3IocGx1Z2lucywgcGx1Z2luKSk7XG4gICAgfSk7XG59XG5mdW5jdGlvbiBhZGRDb21wb25lbnRQbHVnaW5zKHR5cGUsIHBhaXJzKSB7XG4gICAgaXRlcmF0ZUNvbXBvbmVudFBsdWdpbnModHlwZSwgcGFpcnMsIChwbHVnaW5zLCBwbHVnaW4pID0+IHBsdWdpbnMuYWRkKHBsdWdpbikpO1xufVxuZnVuY3Rpb24gZGVsZXRlQ29tcG9uZW50UGx1Z2lucyh0eXBlLCBwYWlycykge1xuICAgIGl0ZXJhdGVDb21wb25lbnRQbHVnaW5zKHR5cGUsIHBhaXJzLCAocGx1Z2lucywgcGx1Z2luKSA9PiBwbHVnaW5zLmRlbGV0ZShwbHVnaW4pKTtcbn1cbmZ1bmN0aW9uIGNyZWF0ZVBsdWdpbnNBUEkoa2V5KSB7XG4gICAgY29uc3QgYXBpID0ge1xuICAgICAgICBhZGQodHlwZSwgcGx1Z2luKSB7XG4gICAgICAgICAgICBpZiAoIXR5cGVba2V5XSkge1xuICAgICAgICAgICAgICAgIHR5cGVba2V5XSA9IFtdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdHlwZVtrZXldLnB1c2gocGx1Z2luKTtcbiAgICAgICAgICAgIHJldHVybiBhcGk7XG4gICAgICAgIH0sXG4gICAgfTtcbiAgICByZXR1cm4gYXBpO1xufVxuXG5jb25zdCBYSFRNTF9OUyA9ICdodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hodG1sJztcbmNvbnN0IFNWR19OUyA9ICdodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Zyc7XG5jb25zdCBQTFVHSU5TX0NSRUFURV9FTEVNRU5UID0gU3ltYm9sKCk7XG5jb25zdCBwbHVnaW5zQ3JlYXRlRWxlbWVudCA9IGNyZWF0ZVBsdWdpbnNTdG9yZSgpO1xuZnVuY3Rpb24gY3JlYXRlRWxlbWVudChzcGVjLCBwYXJlbnQpIHtcbiAgICBjb25zdCByZXN1bHQgPSBwbHVnaW5zQ3JlYXRlRWxlbWVudC5hcHBseSh7IHNwZWMsIHBhcmVudCB9KTtcbiAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIGNvbnN0IHRhZyA9IHNwZWMudHlwZTtcbiAgICBpZiAodGFnID09PSAnc3ZnJykge1xuICAgICAgICByZXR1cm4gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKFNWR19OUywgJ3N2ZycpO1xuICAgIH1cbiAgICBjb25zdCBuYW1lc3BhY2UgPSBwYXJlbnQubmFtZXNwYWNlVVJJO1xuICAgIGlmIChuYW1lc3BhY2UgPT09IFhIVE1MX05TIHx8IG5hbWVzcGFjZSA9PSBudWxsKSB7XG4gICAgICAgIHJldHVybiBkb2N1bWVudC5jcmVhdGVFbGVtZW50KHRhZyk7XG4gICAgfVxuICAgIHJldHVybiBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMobmFtZXNwYWNlLCB0YWcpO1xufVxuXG5mdW5jdGlvbiBjbGFzc2VzKC4uLmFyZ3MpIHtcbiAgICBjb25zdCBjbGFzc2VzID0gW107XG4gICAgYXJncy5maWx0ZXIoKGMpID0+IEJvb2xlYW4oYykpLmZvckVhY2goKGMpID0+IHtcbiAgICAgICAgaWYgKHR5cGVvZiBjID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgY2xhc3Nlcy5wdXNoKGMpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHR5cGVvZiBjID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgY2xhc3Nlcy5wdXNoKC4uLk9iamVjdC5rZXlzKGMpLmZpbHRlcigoa2V5KSA9PiBCb29sZWFuKGNba2V5XSkpKTtcbiAgICAgICAgfVxuICAgIH0pO1xuICAgIHJldHVybiBjbGFzc2VzLmpvaW4oJyAnKTtcbn1cbmZ1bmN0aW9uIHNldElubGluZUNTU1Byb3BlcnR5VmFsdWUoZWxlbWVudCwgcHJvcCwgJHZhbHVlKSB7XG4gICAgaWYgKCR2YWx1ZSAhPSBudWxsICYmICR2YWx1ZSAhPT0gJycpIHtcbiAgICAgICAgbGV0IHZhbHVlID0gU3RyaW5nKCR2YWx1ZSk7XG4gICAgICAgIGxldCBpbXBvcnRhbnQgPSAnJztcbiAgICAgICAgaWYgKHZhbHVlLmVuZHNXaXRoKCchaW1wb3J0YW50JykpIHtcbiAgICAgICAgICAgIHZhbHVlID0gdmFsdWUuc3Vic3RyaW5nKDAsIHZhbHVlLmxlbmd0aCAtIDEwKTtcbiAgICAgICAgICAgIGltcG9ydGFudCA9ICdpbXBvcnRhbnQnO1xuICAgICAgICB9XG4gICAgICAgIGVsZW1lbnQuc3R5bGUuc2V0UHJvcGVydHkocHJvcCwgdmFsdWUsIGltcG9ydGFudCk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICBlbGVtZW50LnN0eWxlLnJlbW92ZVByb3BlcnR5KHByb3ApO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gaXNPYmplY3QodmFsdWUpIHtcbiAgICByZXR1cm4gdmFsdWUgIT0gbnVsbCAmJiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnO1xufVxuXG5jb25zdCBldmVudExpc3RlbmVycyA9IG5ldyBXZWFrTWFwKCk7XG5mdW5jdGlvbiBhZGRFdmVudExpc3RlbmVyKGVsZW1lbnQsIGV2ZW50LCBsaXN0ZW5lcikge1xuICAgIGxldCBsaXN0ZW5lcnM7XG4gICAgaWYgKGV2ZW50TGlzdGVuZXJzLmhhcyhlbGVtZW50KSkge1xuICAgICAgICBsaXN0ZW5lcnMgPSBldmVudExpc3RlbmVycy5nZXQoZWxlbWVudCk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICBsaXN0ZW5lcnMgPSBuZXcgTWFwKCk7XG4gICAgICAgIGV2ZW50TGlzdGVuZXJzLnNldChlbGVtZW50LCBsaXN0ZW5lcnMpO1xuICAgIH1cbiAgICBpZiAobGlzdGVuZXJzLmdldChldmVudCkgIT09IGxpc3RlbmVyKSB7XG4gICAgICAgIGlmIChsaXN0ZW5lcnMuaGFzKGV2ZW50KSkge1xuICAgICAgICAgICAgZWxlbWVudC5yZW1vdmVFdmVudExpc3RlbmVyKGV2ZW50LCBsaXN0ZW5lcnMuZ2V0KGV2ZW50KSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKGV2ZW50LCBsaXN0ZW5lcik7XG4gICAgICAgIGxpc3RlbmVycy5zZXQoZXZlbnQsIGxpc3RlbmVyKTtcbiAgICB9XG59XG5mdW5jdGlvbiByZW1vdmVFdmVudExpc3RlbmVyKGVsZW1lbnQsIGV2ZW50KSB7XG4gICAgaWYgKCFldmVudExpc3RlbmVycy5oYXMoZWxlbWVudCkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBsaXN0ZW5lcnMgPSBldmVudExpc3RlbmVycy5nZXQoZWxlbWVudCk7XG4gICAgZWxlbWVudC5yZW1vdmVFdmVudExpc3RlbmVyKGV2ZW50LCBsaXN0ZW5lcnMuZ2V0KGV2ZW50KSk7XG4gICAgbGlzdGVuZXJzLmRlbGV0ZShldmVudCk7XG59XG5cbmZ1bmN0aW9uIHNldENsYXNzT2JqZWN0KGVsZW1lbnQsIGNsYXNzT2JqKSB7XG4gICAgY29uc3QgY2xzID0gQXJyYXkuaXNBcnJheShjbGFzc09iailcbiAgICAgICAgPyBjbGFzc2VzKC4uLmNsYXNzT2JqKVxuICAgICAgICA6IGNsYXNzZXMoY2xhc3NPYmopO1xuICAgIGlmIChjbHMpIHtcbiAgICAgICAgZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2NsYXNzJywgY2xzKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIGVsZW1lbnQucmVtb3ZlQXR0cmlidXRlKCdjbGFzcycpO1xuICAgIH1cbn1cbmZ1bmN0aW9uIG1lcmdlVmFsdWVzKG9iaiwgb2xkKSB7XG4gICAgY29uc3QgdmFsdWVzID0gbmV3IE1hcCgpO1xuICAgIGNvbnN0IG5ld1Byb3BzID0gbmV3IFNldChPYmplY3Qua2V5cyhvYmopKTtcbiAgICBjb25zdCBvbGRQcm9wcyA9IE9iamVjdC5rZXlzKG9sZCk7XG4gICAgb2xkUHJvcHNcbiAgICAgICAgLmZpbHRlcigocHJvcCkgPT4gIW5ld1Byb3BzLmhhcyhwcm9wKSlcbiAgICAgICAgLmZvckVhY2goKHByb3ApID0+IHZhbHVlcy5zZXQocHJvcCwgbnVsbCkpO1xuICAgIG5ld1Byb3BzLmZvckVhY2goKHByb3ApID0+IHZhbHVlcy5zZXQocHJvcCwgb2JqW3Byb3BdKSk7XG4gICAgcmV0dXJuIHZhbHVlcztcbn1cbmZ1bmN0aW9uIHNldFN0eWxlT2JqZWN0KGVsZW1lbnQsIHN0eWxlT2JqLCBwcmV2KSB7XG4gICAgbGV0IHByZXZPYmo7XG4gICAgaWYgKGlzT2JqZWN0KHByZXYpKSB7XG4gICAgICAgIHByZXZPYmogPSBwcmV2O1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgcHJldk9iaiA9IHt9O1xuICAgICAgICBlbGVtZW50LnJlbW92ZUF0dHJpYnV0ZSgnc3R5bGUnKTtcbiAgICB9XG4gICAgY29uc3QgZGVjbGFyYXRpb25zID0gbWVyZ2VWYWx1ZXMoc3R5bGVPYmosIHByZXZPYmopO1xuICAgIGRlY2xhcmF0aW9ucy5mb3JFYWNoKCgkdmFsdWUsIHByb3ApID0+IHNldElubGluZUNTU1Byb3BlcnR5VmFsdWUoZWxlbWVudCwgcHJvcCwgJHZhbHVlKSk7XG59XG5mdW5jdGlvbiBzZXRFdmVudExpc3RlbmVyKGVsZW1lbnQsIGV2ZW50LCBsaXN0ZW5lcikge1xuICAgIGlmICh0eXBlb2YgbGlzdGVuZXIgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgYWRkRXZlbnRMaXN0ZW5lcihlbGVtZW50LCBldmVudCwgbGlzdGVuZXIpO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgcmVtb3ZlRXZlbnRMaXN0ZW5lcihlbGVtZW50LCBldmVudCk7XG4gICAgfVxufVxuY29uc3Qgc3BlY2lhbEF0dHJzID0gbmV3IFNldChbXG4gICAgJ2tleScsXG4gICAgJ29uY3JlYXRlJyxcbiAgICAnb251cGRhdGUnLFxuICAgICdvbnJlbmRlcicsXG4gICAgJ29ucmVtb3ZlJyxcbl0pO1xuY29uc3QgUExVR0lOU19TRVRfQVRUUklCVVRFID0gU3ltYm9sKCk7XG5jb25zdCBwbHVnaW5zU2V0QXR0cmlidXRlID0gY3JlYXRlUGx1Z2luc1N0b3JlKCk7XG5mdW5jdGlvbiBnZXRQcm9wZXJ0eVZhbHVlKG9iaiwgcHJvcCkge1xuICAgIHJldHVybiBvYmogJiYgb2JqLmhhc093blByb3BlcnR5KHByb3ApID8gb2JqW3Byb3BdIDogbnVsbDtcbn1cbmZ1bmN0aW9uIHN5bmNBdHRycyhlbGVtZW50LCBhdHRycywgcHJldikge1xuICAgIGNvbnN0IHZhbHVlcyA9IG1lcmdlVmFsdWVzKGF0dHJzLCBwcmV2IHx8IHt9KTtcbiAgICB2YWx1ZXMuZm9yRWFjaCgodmFsdWUsIGF0dHIpID0+IHtcbiAgICAgICAgaWYgKCFwbHVnaW5zU2V0QXR0cmlidXRlLmVtcHR5KCkpIHtcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IHBsdWdpbnNTZXRBdHRyaWJ1dGUuYXBwbHkoe1xuICAgICAgICAgICAgICAgIGVsZW1lbnQsXG4gICAgICAgICAgICAgICAgYXR0cixcbiAgICAgICAgICAgICAgICB2YWx1ZSxcbiAgICAgICAgICAgICAgICBnZXQgcHJldigpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGdldFByb3BlcnR5VmFsdWUocHJldiwgYXR0cik7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgaWYgKHJlc3VsdCAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChhdHRyID09PSAnY2xhc3MnICYmIGlzT2JqZWN0KHZhbHVlKSkge1xuICAgICAgICAgICAgc2V0Q2xhc3NPYmplY3QoZWxlbWVudCwgdmFsdWUpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGF0dHIgPT09ICdzdHlsZScgJiYgaXNPYmplY3QodmFsdWUpKSB7XG4gICAgICAgICAgICBjb25zdCBwcmV2VmFsdWUgPSBnZXRQcm9wZXJ0eVZhbHVlKHByZXYsIGF0dHIpO1xuICAgICAgICAgICAgc2V0U3R5bGVPYmplY3QoZWxlbWVudCwgdmFsdWUsIHByZXZWYWx1ZSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoYXR0ci5zdGFydHNXaXRoKCdvbicpKSB7XG4gICAgICAgICAgICBjb25zdCBldmVudCA9IGF0dHIuc3Vic3RyaW5nKDIpO1xuICAgICAgICAgICAgc2V0RXZlbnRMaXN0ZW5lcihlbGVtZW50LCBldmVudCwgdmFsdWUpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHNwZWNpYWxBdHRycy5oYXMoYXR0cikpIDtcbiAgICAgICAgZWxzZSBpZiAodmFsdWUgPT0gbnVsbCB8fCB2YWx1ZSA9PT0gZmFsc2UpIHtcbiAgICAgICAgICAgIGVsZW1lbnQucmVtb3ZlQXR0cmlidXRlKGF0dHIpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgZWxlbWVudC5zZXRBdHRyaWJ1dGUoYXR0ciwgdmFsdWUgPT09IHRydWUgPyAnJyA6IFN0cmluZyh2YWx1ZSkpO1xuICAgICAgICB9XG4gICAgfSk7XG59XG5cbmNsYXNzIExpbmtlZExpc3Qge1xuICAgIGNvbnN0cnVjdG9yKC4uLml0ZW1zKSB7XG4gICAgICAgIHRoaXMubmV4dHMgPSBuZXcgV2Vha01hcCgpO1xuICAgICAgICB0aGlzLnByZXZzID0gbmV3IFdlYWtNYXAoKTtcbiAgICAgICAgdGhpcy5maXJzdCA9IG51bGw7XG4gICAgICAgIHRoaXMubGFzdCA9IG51bGw7XG4gICAgICAgIGl0ZW1zLmZvckVhY2goKGl0ZW0pID0+IHRoaXMucHVzaChpdGVtKSk7XG4gICAgfVxuICAgIGVtcHR5KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5maXJzdCA9PSBudWxsO1xuICAgIH1cbiAgICBwdXNoKGl0ZW0pIHtcbiAgICAgICAgaWYgKHRoaXMuZW1wdHkoKSkge1xuICAgICAgICAgICAgdGhpcy5maXJzdCA9IGl0ZW07XG4gICAgICAgICAgICB0aGlzLmxhc3QgPSBpdGVtO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5uZXh0cy5zZXQodGhpcy5sYXN0LCBpdGVtKTtcbiAgICAgICAgICAgIHRoaXMucHJldnMuc2V0KGl0ZW0sIHRoaXMubGFzdCk7XG4gICAgICAgICAgICB0aGlzLmxhc3QgPSBpdGVtO1xuICAgICAgICB9XG4gICAgfVxuICAgIGluc2VydEJlZm9yZShuZXdJdGVtLCByZWZJdGVtKSB7XG4gICAgICAgIGNvbnN0IHByZXYgPSB0aGlzLmJlZm9yZShyZWZJdGVtKTtcbiAgICAgICAgdGhpcy5wcmV2cy5zZXQobmV3SXRlbSwgcHJldik7XG4gICAgICAgIHRoaXMubmV4dHMuc2V0KG5ld0l0ZW0sIHJlZkl0ZW0pO1xuICAgICAgICB0aGlzLnByZXZzLnNldChyZWZJdGVtLCBuZXdJdGVtKTtcbiAgICAgICAgcHJldiAmJiB0aGlzLm5leHRzLnNldChwcmV2LCBuZXdJdGVtKTtcbiAgICAgICAgcmVmSXRlbSA9PT0gdGhpcy5maXJzdCAmJiAodGhpcy5maXJzdCA9IG5ld0l0ZW0pO1xuICAgIH1cbiAgICBkZWxldGUoaXRlbSkge1xuICAgICAgICBjb25zdCBwcmV2ID0gdGhpcy5iZWZvcmUoaXRlbSk7XG4gICAgICAgIGNvbnN0IG5leHQgPSB0aGlzLmFmdGVyKGl0ZW0pO1xuICAgICAgICBwcmV2ICYmIHRoaXMubmV4dHMuc2V0KHByZXYsIG5leHQpO1xuICAgICAgICBuZXh0ICYmIHRoaXMucHJldnMuc2V0KG5leHQsIHByZXYpO1xuICAgICAgICBpdGVtID09PSB0aGlzLmZpcnN0ICYmICh0aGlzLmZpcnN0ID0gbmV4dCk7XG4gICAgICAgIGl0ZW0gPT09IHRoaXMubGFzdCAmJiAodGhpcy5sYXN0ID0gcHJldik7XG4gICAgfVxuICAgIGJlZm9yZShpdGVtKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnByZXZzLmdldChpdGVtKSB8fCBudWxsO1xuICAgIH1cbiAgICBhZnRlcihpdGVtKSB7XG4gICAgICAgIHJldHVybiB0aGlzLm5leHRzLmdldChpdGVtKSB8fCBudWxsO1xuICAgIH1cbiAgICBsb29wKGl0ZXJhdG9yKSB7XG4gICAgICAgIGlmICh0aGlzLmVtcHR5KCkpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBsZXQgY3VycmVudCA9IHRoaXMuZmlyc3Q7XG4gICAgICAgIGRvIHtcbiAgICAgICAgICAgIGlmIChpdGVyYXRvcihjdXJyZW50KSkge1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IHdoaWxlICgoY3VycmVudCA9IHRoaXMuYWZ0ZXIoY3VycmVudCkpKTtcbiAgICB9XG4gICAgY29weSgpIHtcbiAgICAgICAgY29uc3QgbGlzdCA9IG5ldyBMaW5rZWRMaXN0KCk7XG4gICAgICAgIHRoaXMubG9vcCgoaXRlbSkgPT4ge1xuICAgICAgICAgICAgbGlzdC5wdXNoKGl0ZW0pO1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIGxpc3Q7XG4gICAgfVxuICAgIGZvckVhY2goaXRlcmF0b3IpIHtcbiAgICAgICAgdGhpcy5sb29wKChpdGVtKSA9PiB7XG4gICAgICAgICAgICBpdGVyYXRvcihpdGVtKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIGZpbmQoaXRlcmF0b3IpIHtcbiAgICAgICAgbGV0IHJlc3VsdCA9IG51bGw7XG4gICAgICAgIHRoaXMubG9vcCgoaXRlbSkgPT4ge1xuICAgICAgICAgICAgaWYgKGl0ZXJhdG9yKGl0ZW0pKSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0ID0gaXRlbTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIG1hcChpdGVyYXRvcikge1xuICAgICAgICBjb25zdCByZXN1bHRzID0gW107XG4gICAgICAgIHRoaXMubG9vcCgoaXRlbSkgPT4ge1xuICAgICAgICAgICAgcmVzdWx0cy5wdXNoKGl0ZXJhdG9yKGl0ZW0pKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiByZXN1bHRzO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gbWF0Y2hDaGlsZHJlbih2bm9kZSwgb2xkKSB7XG4gICAgY29uc3Qgb2xkQ2hpbGRyZW4gPSBvbGQuY2hpbGRyZW4oKTtcbiAgICBjb25zdCBvbGRDaGlsZHJlbkJ5S2V5ID0gbmV3IE1hcCgpO1xuICAgIGNvbnN0IG9sZENoaWxkcmVuV2l0aG91dEtleSA9IFtdO1xuICAgIG9sZENoaWxkcmVuLmZvckVhY2goKHYpID0+IHtcbiAgICAgICAgY29uc3Qga2V5ID0gdi5rZXkoKTtcbiAgICAgICAgaWYgKGtleSA9PSBudWxsKSB7XG4gICAgICAgICAgICBvbGRDaGlsZHJlbldpdGhvdXRLZXkucHVzaCh2KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIG9sZENoaWxkcmVuQnlLZXkuc2V0KGtleSwgdik7XG4gICAgICAgIH1cbiAgICB9KTtcbiAgICBjb25zdCBjaGlsZHJlbiA9IHZub2RlLmNoaWxkcmVuKCk7XG4gICAgY29uc3QgbWF0Y2hlcyA9IFtdO1xuICAgIGNvbnN0IHVubWF0Y2hlZCA9IG5ldyBTZXQob2xkQ2hpbGRyZW4pO1xuICAgIGNvbnN0IGtleXMgPSBuZXcgU2V0KCk7XG4gICAgY2hpbGRyZW4uZm9yRWFjaCgodikgPT4ge1xuICAgICAgICBsZXQgbWF0Y2ggPSBudWxsO1xuICAgICAgICBsZXQgZ3Vlc3MgPSBudWxsO1xuICAgICAgICBjb25zdCBrZXkgPSB2LmtleSgpO1xuICAgICAgICBpZiAoa2V5ICE9IG51bGwpIHtcbiAgICAgICAgICAgIGlmIChrZXlzLmhhcyhrZXkpKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdEdXBsaWNhdGUga2V5Jyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBrZXlzLmFkZChrZXkpO1xuICAgICAgICAgICAgaWYgKG9sZENoaWxkcmVuQnlLZXkuaGFzKGtleSkpIHtcbiAgICAgICAgICAgICAgICBndWVzcyA9IG9sZENoaWxkcmVuQnlLZXkuZ2V0KGtleSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAob2xkQ2hpbGRyZW5XaXRob3V0S2V5Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGd1ZXNzID0gb2xkQ2hpbGRyZW5XaXRob3V0S2V5LnNoaWZ0KCk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHYubWF0Y2hlcyhndWVzcykpIHtcbiAgICAgICAgICAgIG1hdGNoID0gZ3Vlc3M7XG4gICAgICAgIH1cbiAgICAgICAgbWF0Y2hlcy5wdXNoKFt2LCBtYXRjaF0pO1xuICAgICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgICAgIHVubWF0Y2hlZC5kZWxldGUobWF0Y2gpO1xuICAgICAgICB9XG4gICAgfSk7XG4gICAgcmV0dXJuIHsgbWF0Y2hlcywgdW5tYXRjaGVkIH07XG59XG5cbmZ1bmN0aW9uIGV4ZWN1dGUodm5vZGUsIG9sZCwgdmRvbSkge1xuICAgIGNvbnN0IGRpZE1hdGNoID0gdm5vZGUgJiYgb2xkICYmIHZub2RlLm1hdGNoZXMob2xkKTtcbiAgICBpZiAoZGlkTWF0Y2ggJiYgdm5vZGUucGFyZW50KCkgPT09IG9sZC5wYXJlbnQoKSkge1xuICAgICAgICB2ZG9tLnJlcGxhY2VWTm9kZShvbGQsIHZub2RlKTtcbiAgICB9XG4gICAgZWxzZSBpZiAodm5vZGUpIHtcbiAgICAgICAgdmRvbS5hZGRWTm9kZSh2bm9kZSk7XG4gICAgfVxuICAgIGNvbnN0IGNvbnRleHQgPSB2ZG9tLmdldFZOb2RlQ29udGV4dCh2bm9kZSk7XG4gICAgY29uc3Qgb2xkQ29udGV4dCA9IHZkb20uZ2V0Vk5vZGVDb250ZXh0KG9sZCk7XG4gICAgaWYgKG9sZCAmJiAhZGlkTWF0Y2gpIHtcbiAgICAgICAgb2xkLmRldGFjaChvbGRDb250ZXh0KTtcbiAgICAgICAgb2xkLmNoaWxkcmVuKCkuZm9yRWFjaCgodikgPT4gZXhlY3V0ZShudWxsLCB2LCB2ZG9tKSk7XG4gICAgICAgIG9sZC5kZXRhY2hlZChvbGRDb250ZXh0KTtcbiAgICB9XG4gICAgaWYgKHZub2RlICYmICFkaWRNYXRjaCkge1xuICAgICAgICB2bm9kZS5hdHRhY2goY29udGV4dCk7XG4gICAgICAgIHZub2RlLmNoaWxkcmVuKCkuZm9yRWFjaCgodikgPT4gZXhlY3V0ZSh2LCBudWxsLCB2ZG9tKSk7XG4gICAgICAgIHZub2RlLmF0dGFjaGVkKGNvbnRleHQpO1xuICAgIH1cbiAgICBpZiAoZGlkTWF0Y2gpIHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gdm5vZGUudXBkYXRlKG9sZCwgY29udGV4dCk7XG4gICAgICAgIGlmIChyZXN1bHQgIT09IHZkb20uTEVBVkUpIHtcbiAgICAgICAgICAgIGNvbnN0IHsgbWF0Y2hlcywgdW5tYXRjaGVkIH0gPSBtYXRjaENoaWxkcmVuKHZub2RlLCBvbGQpO1xuICAgICAgICAgICAgdW5tYXRjaGVkLmZvckVhY2goKHYpID0+IGV4ZWN1dGUobnVsbCwgdiwgdmRvbSkpO1xuICAgICAgICAgICAgbWF0Y2hlcy5mb3JFYWNoKChbdiwgb10pID0+IGV4ZWN1dGUodiwgbywgdmRvbSkpO1xuICAgICAgICAgICAgdm5vZGUudXBkYXRlZChjb250ZXh0KTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuZnVuY3Rpb24gaXNTcGVjKHgpIHtcbiAgICByZXR1cm4gaXNPYmplY3QoeCkgJiYgeC50eXBlICE9IG51bGwgJiYgeC5ub2RlVHlwZSA9PSBudWxsO1xufVxuZnVuY3Rpb24gaXNOb2RlU3BlYyh4KSB7XG4gICAgcmV0dXJuIGlzU3BlYyh4KSAmJiB0eXBlb2YgeC50eXBlID09PSAnc3RyaW5nJztcbn1cbmZ1bmN0aW9uIGlzQ29tcG9uZW50U3BlYyh4KSB7XG4gICAgcmV0dXJuIGlzU3BlYyh4KSAmJiB0eXBlb2YgeC50eXBlID09PSAnZnVuY3Rpb24nO1xufVxuXG5jbGFzcyBWTm9kZUJhc2Uge1xuICAgIGNvbnN0cnVjdG9yKHBhcmVudCkge1xuICAgICAgICB0aGlzLnBhcmVudFZOb2RlID0gcGFyZW50O1xuICAgIH1cbiAgICBrZXkoKSB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICBwYXJlbnQodm5vZGUpIHtcbiAgICAgICAgaWYgKHZub2RlKSB7XG4gICAgICAgICAgICB0aGlzLnBhcmVudFZOb2RlID0gdm5vZGU7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMucGFyZW50Vk5vZGU7XG4gICAgfVxuICAgIGNoaWxkcmVuKCkge1xuICAgICAgICByZXR1cm4gW107XG4gICAgfVxuICAgIGF0dGFjaChjb250ZXh0KSB7IH1cbiAgICBkZXRhY2goY29udGV4dCkgeyB9XG4gICAgdXBkYXRlKG9sZCwgY29udGV4dCkge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgYXR0YWNoZWQoY29udGV4dCkgeyB9XG4gICAgZGV0YWNoZWQoY29udGV4dCkgeyB9XG4gICAgdXBkYXRlZChjb250ZXh0KSB7IH1cbn1cbmZ1bmN0aW9uIG5vZGVNYXRjaGVzU3BlYyhub2RlLCBzcGVjKSB7XG4gICAgcmV0dXJuIG5vZGUgaW5zdGFuY2VvZiBFbGVtZW50ICYmIHNwZWMudHlwZSA9PT0gbm9kZS50YWdOYW1lLnRvTG93ZXJDYXNlKCk7XG59XG5jb25zdCByZWZpbmVkRWxlbWVudHMgPSBuZXcgV2Vha01hcCgpO1xuZnVuY3Rpb24gbWFya0VsZW1lbnRBc1JlZmluZWQoZWxlbWVudCwgdmRvbSkge1xuICAgIGxldCByZWZpbmVkO1xuICAgIGlmIChyZWZpbmVkRWxlbWVudHMuaGFzKHZkb20pKSB7XG4gICAgICAgIHJlZmluZWQgPSByZWZpbmVkRWxlbWVudHMuZ2V0KHZkb20pO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgcmVmaW5lZCA9IG5ldyBXZWFrU2V0KCk7XG4gICAgICAgIHJlZmluZWRFbGVtZW50cy5zZXQodmRvbSwgcmVmaW5lZCk7XG4gICAgfVxuICAgIHJlZmluZWQuYWRkKGVsZW1lbnQpO1xufVxuZnVuY3Rpb24gaXNFbGVtZW50UmVmaW5lZChlbGVtZW50LCB2ZG9tKSB7XG4gICAgcmV0dXJuIHJlZmluZWRFbGVtZW50cy5oYXModmRvbSkgJiYgcmVmaW5lZEVsZW1lbnRzLmdldCh2ZG9tKS5oYXMoZWxlbWVudCk7XG59XG5jbGFzcyBFbGVtZW50Vk5vZGUgZXh0ZW5kcyBWTm9kZUJhc2Uge1xuICAgIGNvbnN0cnVjdG9yKHNwZWMsIHBhcmVudCkge1xuICAgICAgICBzdXBlcihwYXJlbnQpO1xuICAgICAgICB0aGlzLnNwZWMgPSBzcGVjO1xuICAgIH1cbiAgICBtYXRjaGVzKG90aGVyKSB7XG4gICAgICAgIHJldHVybiAob3RoZXIgaW5zdGFuY2VvZiBFbGVtZW50Vk5vZGUgJiYgdGhpcy5zcGVjLnR5cGUgPT09IG90aGVyLnNwZWMudHlwZSk7XG4gICAgfVxuICAgIGtleSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc3BlYy5wcm9wcy5rZXk7XG4gICAgfVxuICAgIGNoaWxkcmVuKCkge1xuICAgICAgICByZXR1cm4gW3RoaXMuY2hpbGRdO1xuICAgIH1cbiAgICBnZXRFeGlzdGluZ0VsZW1lbnQoY29udGV4dCkge1xuICAgICAgICBjb25zdCBwYXJlbnQgPSBjb250ZXh0LnBhcmVudDtcbiAgICAgICAgY29uc3QgZXhpc3RpbmcgPSBjb250ZXh0Lm5vZGU7XG4gICAgICAgIGxldCBlbGVtZW50O1xuICAgICAgICBpZiAobm9kZU1hdGNoZXNTcGVjKGV4aXN0aW5nLCB0aGlzLnNwZWMpKSB7XG4gICAgICAgICAgICBlbGVtZW50ID0gZXhpc3Rpbmc7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoIWlzRWxlbWVudFJlZmluZWQocGFyZW50LCBjb250ZXh0LnZkb20pICYmXG4gICAgICAgICAgICBjb250ZXh0LnZkb20uaXNET01Ob2RlQ2FwdHVyZWQocGFyZW50KSkge1xuICAgICAgICAgICAgY29uc3Qgc2libGluZyA9IGNvbnRleHQuc2libGluZztcbiAgICAgICAgICAgIGNvbnN0IGd1ZXNzID0gc2libGluZ1xuICAgICAgICAgICAgICAgID8gc2libGluZy5uZXh0RWxlbWVudFNpYmxpbmdcbiAgICAgICAgICAgICAgICA6IHBhcmVudC5maXJzdEVsZW1lbnRDaGlsZDtcbiAgICAgICAgICAgIGlmIChndWVzcyAmJiAhY29udGV4dC52ZG9tLmlzRE9NTm9kZUNhcHR1cmVkKGd1ZXNzKSkge1xuICAgICAgICAgICAgICAgIGlmIChub2RlTWF0Y2hlc1NwZWMoZ3Vlc3MsIHRoaXMuc3BlYykpIHtcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudCA9IGd1ZXNzO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcGFyZW50LnJlbW92ZUNoaWxkKGd1ZXNzKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGVsZW1lbnQ7XG4gICAgfVxuICAgIGF0dGFjaChjb250ZXh0KSB7XG4gICAgICAgIGxldCBlbGVtZW50O1xuICAgICAgICBjb25zdCBleGlzdGluZyA9IHRoaXMuZ2V0RXhpc3RpbmdFbGVtZW50KGNvbnRleHQpO1xuICAgICAgICBpZiAoZXhpc3RpbmcpIHtcbiAgICAgICAgICAgIGVsZW1lbnQgPSBleGlzdGluZztcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGVsZW1lbnQgPSBjcmVhdGVFbGVtZW50KHRoaXMuc3BlYywgY29udGV4dC5wYXJlbnQpO1xuICAgICAgICAgICAgbWFya0VsZW1lbnRBc1JlZmluZWQoZWxlbWVudCwgY29udGV4dC52ZG9tKTtcbiAgICAgICAgfVxuICAgICAgICBzeW5jQXR0cnMoZWxlbWVudCwgdGhpcy5zcGVjLnByb3BzLCBudWxsKTtcbiAgICAgICAgdGhpcy5jaGlsZCA9IGNyZWF0ZURPTVZOb2RlKGVsZW1lbnQsIHRoaXMuc3BlYy5jaGlsZHJlbiwgdGhpcywgZmFsc2UpO1xuICAgIH1cbiAgICB1cGRhdGUocHJldiwgY29udGV4dCkge1xuICAgICAgICBjb25zdCBwcmV2Q29udGV4dCA9IGNvbnRleHQudmRvbS5nZXRWTm9kZUNvbnRleHQocHJldik7XG4gICAgICAgIGNvbnN0IGVsZW1lbnQgPSBwcmV2Q29udGV4dC5ub2RlO1xuICAgICAgICBzeW5jQXR0cnMoZWxlbWVudCwgdGhpcy5zcGVjLnByb3BzLCBwcmV2LnNwZWMucHJvcHMpO1xuICAgICAgICB0aGlzLmNoaWxkID0gY3JlYXRlRE9NVk5vZGUoZWxlbWVudCwgdGhpcy5zcGVjLmNoaWxkcmVuLCB0aGlzLCBmYWxzZSk7XG4gICAgfVxuICAgIGF0dGFjaGVkKGNvbnRleHQpIHtcbiAgICAgICAgY29uc3QgeyBvbmNyZWF0ZSwgb25yZW5kZXIgfSA9IHRoaXMuc3BlYy5wcm9wcztcbiAgICAgICAgaWYgKG9uY3JlYXRlKSB7XG4gICAgICAgICAgICBvbmNyZWF0ZShjb250ZXh0Lm5vZGUpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChvbnJlbmRlcikge1xuICAgICAgICAgICAgb25yZW5kZXIoY29udGV4dC5ub2RlKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBkZXRhY2hlZChjb250ZXh0KSB7XG4gICAgICAgIGNvbnN0IHsgb25yZW1vdmUgfSA9IHRoaXMuc3BlYy5wcm9wcztcbiAgICAgICAgaWYgKG9ucmVtb3ZlKSB7XG4gICAgICAgICAgICBvbnJlbW92ZShjb250ZXh0Lm5vZGUpO1xuICAgICAgICB9XG4gICAgfVxuICAgIHVwZGF0ZWQoY29udGV4dCkge1xuICAgICAgICBjb25zdCB7IG9udXBkYXRlLCBvbnJlbmRlciB9ID0gdGhpcy5zcGVjLnByb3BzO1xuICAgICAgICBpZiAob251cGRhdGUpIHtcbiAgICAgICAgICAgIG9udXBkYXRlKGNvbnRleHQubm9kZSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG9ucmVuZGVyKSB7XG4gICAgICAgICAgICBvbnJlbmRlcihjb250ZXh0Lm5vZGUpO1xuICAgICAgICB9XG4gICAgfVxufVxuY29uc3Qgc3ltYm9scyA9IHtcbiAgICBDUkVBVEVEOiBTeW1ib2woKSxcbiAgICBSRU1PVkVEOiBTeW1ib2woKSxcbiAgICBVUERBVEVEOiBTeW1ib2woKSxcbiAgICBSRU5ERVJFRDogU3ltYm9sKCksXG4gICAgQUNUSVZFOiBTeW1ib2woKSxcbiAgICBERUZBVUxUU19BU1NJR05FRDogU3ltYm9sKCksXG59O1xuY29uc3QgZG9tUGx1Z2lucyA9IFtcbiAgICBbUExVR0lOU19DUkVBVEVfRUxFTUVOVCwgcGx1Z2luc0NyZWF0ZUVsZW1lbnRdLFxuICAgIFtQTFVHSU5TX1NFVF9BVFRSSUJVVEUsIHBsdWdpbnNTZXRBdHRyaWJ1dGVdLFxuXTtcbmNsYXNzIENvbXBvbmVudFZOb2RlIGV4dGVuZHMgVk5vZGVCYXNlIHtcbiAgICBjb25zdHJ1Y3RvcihzcGVjLCBwYXJlbnQpIHtcbiAgICAgICAgc3VwZXIocGFyZW50KTtcbiAgICAgICAgdGhpcy5sb2NrID0gZmFsc2U7XG4gICAgICAgIHRoaXMuc3BlYyA9IHNwZWM7XG4gICAgICAgIHRoaXMucHJldiA9IG51bGw7XG4gICAgICAgIHRoaXMuc3RvcmUgPSB7fTtcbiAgICAgICAgdGhpcy5zdG9yZVtzeW1ib2xzLkFDVElWRV0gPSB0aGlzO1xuICAgIH1cbiAgICBtYXRjaGVzKG90aGVyKSB7XG4gICAgICAgIHJldHVybiAob3RoZXIgaW5zdGFuY2VvZiBDb21wb25lbnRWTm9kZSAmJlxuICAgICAgICAgICAgdGhpcy5zcGVjLnR5cGUgPT09IG90aGVyLnNwZWMudHlwZSk7XG4gICAgfVxuICAgIGtleSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc3BlYy5wcm9wcy5rZXk7XG4gICAgfVxuICAgIGNoaWxkcmVuKCkge1xuICAgICAgICByZXR1cm4gW3RoaXMuY2hpbGRdO1xuICAgIH1cbiAgICBjcmVhdGVDb250ZXh0KGNvbnRleHQpIHtcbiAgICAgICAgY29uc3QgeyBwYXJlbnQgfSA9IGNvbnRleHQ7XG4gICAgICAgIGNvbnN0IHsgc3BlYywgcHJldiwgc3RvcmUgfSA9IHRoaXM7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBzcGVjLFxuICAgICAgICAgICAgcHJldixcbiAgICAgICAgICAgIHN0b3JlLFxuICAgICAgICAgICAgZ2V0IG5vZGUoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNvbnRleHQubm9kZTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBnZXQgbm9kZXMoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNvbnRleHQubm9kZXM7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgcGFyZW50LFxuICAgICAgICAgICAgb25DcmVhdGU6IChmbikgPT4gKHN0b3JlW3N5bWJvbHMuQ1JFQVRFRF0gPSBmbiksXG4gICAgICAgICAgICBvblVwZGF0ZTogKGZuKSA9PiAoc3RvcmVbc3ltYm9scy5VUERBVEVEXSA9IGZuKSxcbiAgICAgICAgICAgIG9uUmVtb3ZlOiAoZm4pID0+IChzdG9yZVtzeW1ib2xzLlJFTU9WRURdID0gZm4pLFxuICAgICAgICAgICAgb25SZW5kZXI6IChmbikgPT4gKHN0b3JlW3N5bWJvbHMuUkVOREVSRURdID0gZm4pLFxuICAgICAgICAgICAgcmVmcmVzaDogKCkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGFjdGl2ZVZOb2RlID0gc3RvcmVbc3ltYm9scy5BQ1RJVkVdO1xuICAgICAgICAgICAgICAgIGFjdGl2ZVZOb2RlLnJlZnJlc2goY29udGV4dCk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgbGVhdmU6ICgpID0+IGNvbnRleHQudmRvbS5MRUFWRSxcbiAgICAgICAgICAgIGdldFN0b3JlOiAoZGVmYXVsdHMpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZGVmYXVsdHMgJiYgIXN0b3JlW3N5bWJvbHMuREVGQVVMVFNfQVNTSUdORURdKSB7XG4gICAgICAgICAgICAgICAgICAgIE9iamVjdC5lbnRyaWVzKGRlZmF1bHRzKS5mb3JFYWNoKChbcHJvcCwgdmFsdWVdKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdG9yZVtwcm9wXSA9IHZhbHVlO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgc3RvcmVbc3ltYm9scy5ERUZBVUxUU19BU1NJR05FRF0gPSB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gc3RvcmU7XG4gICAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgIH1cbiAgICB1bmJveChjb250ZXh0KSB7XG4gICAgICAgIGNvbnN0IENvbXBvbmVudCA9IHRoaXMuc3BlYy50eXBlO1xuICAgICAgICBjb25zdCBwcm9wcyA9IHRoaXMuc3BlYy5wcm9wcztcbiAgICAgICAgY29uc3QgY2hpbGRyZW4gPSB0aGlzLnNwZWMuY2hpbGRyZW47XG4gICAgICAgIHRoaXMubG9jayA9IHRydWU7XG4gICAgICAgIGNvbnN0IHByZXZDb250ZXh0ID0gQ29tcG9uZW50Vk5vZGUuY29udGV4dDtcbiAgICAgICAgQ29tcG9uZW50Vk5vZGUuY29udGV4dCA9IHRoaXMuY3JlYXRlQ29udGV4dChjb250ZXh0KTtcbiAgICAgICAgbGV0IHVuYm94ZWQgPSBudWxsO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgdW5ib3hlZCA9IENvbXBvbmVudChwcm9wcywgLi4uY2hpbGRyZW4pO1xuICAgICAgICB9XG4gICAgICAgIGZpbmFsbHkge1xuICAgICAgICAgICAgQ29tcG9uZW50Vk5vZGUuY29udGV4dCA9IHByZXZDb250ZXh0O1xuICAgICAgICAgICAgdGhpcy5sb2NrID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHVuYm94ZWQ7XG4gICAgfVxuICAgIHJlZnJlc2goY29udGV4dCkge1xuICAgICAgICBpZiAodGhpcy5sb2NrKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0NhbGxpbmcgcmVmcmVzaCBkdXJpbmcgdW5ib3hpbmcgY2F1c2VzIGluZmluaXRlIGxvb3AnKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnByZXYgPSB0aGlzLnNwZWM7XG4gICAgICAgIGNvbnN0IGxhdGVzdENvbnRleHQgPSBjb250ZXh0LnZkb20uZ2V0Vk5vZGVDb250ZXh0KHRoaXMpO1xuICAgICAgICBjb25zdCB1bmJveGVkID0gdGhpcy51bmJveChsYXRlc3RDb250ZXh0KTtcbiAgICAgICAgaWYgKHVuYm94ZWQgPT09IGNvbnRleHQudmRvbS5MRUFWRSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHByZXZDaGlsZCA9IHRoaXMuY2hpbGQ7XG4gICAgICAgIHRoaXMuY2hpbGQgPSBjcmVhdGVWTm9kZSh1bmJveGVkLCB0aGlzKTtcbiAgICAgICAgY29udGV4dC52ZG9tLmV4ZWN1dGUodGhpcy5jaGlsZCwgcHJldkNoaWxkKTtcbiAgICAgICAgdGhpcy51cGRhdGVkKGNvbnRleHQpO1xuICAgIH1cbiAgICBhZGRQbHVnaW5zKCkge1xuICAgICAgICBhZGRDb21wb25lbnRQbHVnaW5zKHRoaXMuc3BlYy50eXBlLCBkb21QbHVnaW5zKTtcbiAgICB9XG4gICAgZGVsZXRlUGx1Z2lucygpIHtcbiAgICAgICAgZGVsZXRlQ29tcG9uZW50UGx1Z2lucyh0aGlzLnNwZWMudHlwZSwgZG9tUGx1Z2lucyk7XG4gICAgfVxuICAgIGF0dGFjaChjb250ZXh0KSB7XG4gICAgICAgIHRoaXMuYWRkUGx1Z2lucygpO1xuICAgICAgICBjb25zdCB1bmJveGVkID0gdGhpcy51bmJveChjb250ZXh0KTtcbiAgICAgICAgY29uc3QgY2hpbGRTcGVjID0gdW5ib3hlZCA9PT0gY29udGV4dC52ZG9tLkxFQVZFID8gbnVsbCA6IHVuYm94ZWQ7XG4gICAgICAgIHRoaXMuY2hpbGQgPSBjcmVhdGVWTm9kZShjaGlsZFNwZWMsIHRoaXMpO1xuICAgIH1cbiAgICB1cGRhdGUocHJldiwgY29udGV4dCkge1xuICAgICAgICB0aGlzLnN0b3JlID0gcHJldi5zdG9yZTtcbiAgICAgICAgdGhpcy5wcmV2ID0gcHJldi5zcGVjO1xuICAgICAgICB0aGlzLnN0b3JlW3N5bWJvbHMuQUNUSVZFXSA9IHRoaXM7XG4gICAgICAgIGNvbnN0IHByZXZDb250ZXh0ID0gY29udGV4dC52ZG9tLmdldFZOb2RlQ29udGV4dChwcmV2KTtcbiAgICAgICAgdGhpcy5hZGRQbHVnaW5zKCk7XG4gICAgICAgIGNvbnN0IHVuYm94ZWQgPSB0aGlzLnVuYm94KHByZXZDb250ZXh0KTtcbiAgICAgICAgbGV0IHJlc3VsdCA9IG51bGw7XG4gICAgICAgIGlmICh1bmJveGVkID09PSBjb250ZXh0LnZkb20uTEVBVkUpIHtcbiAgICAgICAgICAgIHJlc3VsdCA9IHVuYm94ZWQ7XG4gICAgICAgICAgICB0aGlzLmNoaWxkID0gcHJldi5jaGlsZDtcbiAgICAgICAgICAgIGNvbnRleHQudmRvbS5hZG9wdFZOb2RlKHRoaXMuY2hpbGQsIHRoaXMpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5jaGlsZCA9IGNyZWF0ZVZOb2RlKHVuYm94ZWQsIHRoaXMpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIGhhbmRsZShldmVudCwgY29udGV4dCkge1xuICAgICAgICBjb25zdCBmbiA9IHRoaXMuc3RvcmVbZXZlbnRdO1xuICAgICAgICBpZiAoZm4pIHtcbiAgICAgICAgICAgIGNvbnN0IG5vZGVzID0gY29udGV4dC5ub2Rlcy5sZW5ndGggPT09IDAgPyBbbnVsbF0gOiBjb250ZXh0Lm5vZGVzO1xuICAgICAgICAgICAgZm4oLi4ubm9kZXMpO1xuICAgICAgICB9XG4gICAgfVxuICAgIGF0dGFjaGVkKGNvbnRleHQpIHtcbiAgICAgICAgdGhpcy5kZWxldGVQbHVnaW5zKCk7XG4gICAgICAgIHRoaXMuaGFuZGxlKHN5bWJvbHMuQ1JFQVRFRCwgY29udGV4dCk7XG4gICAgICAgIHRoaXMuaGFuZGxlKHN5bWJvbHMuUkVOREVSRUQsIGNvbnRleHQpO1xuICAgIH1cbiAgICBkZXRhY2hlZChjb250ZXh0KSB7XG4gICAgICAgIHRoaXMuaGFuZGxlKHN5bWJvbHMuUkVNT1ZFRCwgY29udGV4dCk7XG4gICAgfVxuICAgIHVwZGF0ZWQoY29udGV4dCkge1xuICAgICAgICB0aGlzLmRlbGV0ZVBsdWdpbnMoKTtcbiAgICAgICAgdGhpcy5oYW5kbGUoc3ltYm9scy5VUERBVEVELCBjb250ZXh0KTtcbiAgICAgICAgdGhpcy5oYW5kbGUoc3ltYm9scy5SRU5ERVJFRCwgY29udGV4dCk7XG4gICAgfVxufVxuQ29tcG9uZW50Vk5vZGUuY29udGV4dCA9IG51bGw7XG5mdW5jdGlvbiBnZXRDb21wb25lbnRDb250ZXh0KCkge1xuICAgIHJldHVybiBDb21wb25lbnRWTm9kZS5jb250ZXh0O1xufVxuY2xhc3MgVGV4dFZOb2RlIGV4dGVuZHMgVk5vZGVCYXNlIHtcbiAgICBjb25zdHJ1Y3Rvcih0ZXh0LCBwYXJlbnQpIHtcbiAgICAgICAgc3VwZXIocGFyZW50KTtcbiAgICAgICAgdGhpcy50ZXh0ID0gdGV4dDtcbiAgICB9XG4gICAgbWF0Y2hlcyhvdGhlcikge1xuICAgICAgICByZXR1cm4gb3RoZXIgaW5zdGFuY2VvZiBUZXh0Vk5vZGU7XG4gICAgfVxuICAgIGNoaWxkcmVuKCkge1xuICAgICAgICByZXR1cm4gW3RoaXMuY2hpbGRdO1xuICAgIH1cbiAgICBnZXRFeGlzdGluZ05vZGUoY29udGV4dCkge1xuICAgICAgICBjb25zdCB7IHBhcmVudCB9ID0gY29udGV4dDtcbiAgICAgICAgbGV0IG5vZGU7XG4gICAgICAgIGlmIChjb250ZXh0Lm5vZGUgaW5zdGFuY2VvZiBUZXh0KSB7XG4gICAgICAgICAgICBub2RlID0gY29udGV4dC5ub2RlO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKCFpc0VsZW1lbnRSZWZpbmVkKHBhcmVudCwgY29udGV4dC52ZG9tKSAmJlxuICAgICAgICAgICAgY29udGV4dC52ZG9tLmlzRE9NTm9kZUNhcHR1cmVkKHBhcmVudCkpIHtcbiAgICAgICAgICAgIGNvbnN0IHNpYmxpbmcgPSBjb250ZXh0LnNpYmxpbmc7XG4gICAgICAgICAgICBjb25zdCBndWVzcyA9IHNpYmxpbmcgPyBzaWJsaW5nLm5leHRTaWJsaW5nIDogcGFyZW50LmZpcnN0Q2hpbGQ7XG4gICAgICAgICAgICBpZiAoZ3Vlc3MgJiZcbiAgICAgICAgICAgICAgICAhY29udGV4dC52ZG9tLmlzRE9NTm9kZUNhcHR1cmVkKGd1ZXNzKSAmJlxuICAgICAgICAgICAgICAgIGd1ZXNzIGluc3RhbmNlb2YgVGV4dCkge1xuICAgICAgICAgICAgICAgIG5vZGUgPSBndWVzcztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbm9kZTtcbiAgICB9XG4gICAgYXR0YWNoKGNvbnRleHQpIHtcbiAgICAgICAgY29uc3QgZXhpc3RpbmcgPSB0aGlzLmdldEV4aXN0aW5nTm9kZShjb250ZXh0KTtcbiAgICAgICAgbGV0IG5vZGU7XG4gICAgICAgIGlmIChleGlzdGluZykge1xuICAgICAgICAgICAgbm9kZSA9IGV4aXN0aW5nO1xuICAgICAgICAgICAgbm9kZS50ZXh0Q29udGVudCA9IHRoaXMudGV4dDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIG5vZGUgPSBkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZSh0aGlzLnRleHQpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuY2hpbGQgPSBjcmVhdGVWTm9kZShub2RlLCB0aGlzKTtcbiAgICB9XG4gICAgdXBkYXRlKHByZXYsIGNvbnRleHQpIHtcbiAgICAgICAgY29uc3QgcHJldkNvbnRleHQgPSBjb250ZXh0LnZkb20uZ2V0Vk5vZGVDb250ZXh0KHByZXYpO1xuICAgICAgICBjb25zdCB7IG5vZGUgfSA9IHByZXZDb250ZXh0O1xuICAgICAgICBpZiAodGhpcy50ZXh0ICE9PSBwcmV2LnRleHQpIHtcbiAgICAgICAgICAgIG5vZGUudGV4dENvbnRlbnQgPSB0aGlzLnRleHQ7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5jaGlsZCA9IGNyZWF0ZVZOb2RlKG5vZGUsIHRoaXMpO1xuICAgIH1cbn1cbmNsYXNzIElubGluZUZ1bmN0aW9uVk5vZGUgZXh0ZW5kcyBWTm9kZUJhc2Uge1xuICAgIGNvbnN0cnVjdG9yKGZuLCBwYXJlbnQpIHtcbiAgICAgICAgc3VwZXIocGFyZW50KTtcbiAgICAgICAgdGhpcy5mbiA9IGZuO1xuICAgIH1cbiAgICBtYXRjaGVzKG90aGVyKSB7XG4gICAgICAgIHJldHVybiBvdGhlciBpbnN0YW5jZW9mIElubGluZUZ1bmN0aW9uVk5vZGU7XG4gICAgfVxuICAgIGNoaWxkcmVuKCkge1xuICAgICAgICByZXR1cm4gW3RoaXMuY2hpbGRdO1xuICAgIH1cbiAgICBjYWxsKGNvbnRleHQpIHtcbiAgICAgICAgY29uc3QgZm4gPSB0aGlzLmZuO1xuICAgICAgICBjb25zdCBpbmxpbmVGbkNvbnRleHQgPSB7XG4gICAgICAgICAgICBwYXJlbnQ6IGNvbnRleHQucGFyZW50LFxuICAgICAgICAgICAgZ2V0IG5vZGUoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNvbnRleHQubm9kZTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBnZXQgbm9kZXMoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNvbnRleHQubm9kZXM7XG4gICAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgICAgICBjb25zdCByZXN1bHQgPSBmbihpbmxpbmVGbkNvbnRleHQpO1xuICAgICAgICB0aGlzLmNoaWxkID0gY3JlYXRlVk5vZGUocmVzdWx0LCB0aGlzKTtcbiAgICB9XG4gICAgYXR0YWNoKGNvbnRleHQpIHtcbiAgICAgICAgdGhpcy5jYWxsKGNvbnRleHQpO1xuICAgIH1cbiAgICB1cGRhdGUocHJldiwgY29udGV4dCkge1xuICAgICAgICBjb25zdCBwcmV2Q29udGV4dCA9IGNvbnRleHQudmRvbS5nZXRWTm9kZUNvbnRleHQocHJldik7XG4gICAgICAgIHRoaXMuY2FsbChwcmV2Q29udGV4dCk7XG4gICAgfVxufVxuY2xhc3MgTnVsbFZOb2RlIGV4dGVuZHMgVk5vZGVCYXNlIHtcbiAgICBtYXRjaGVzKG90aGVyKSB7XG4gICAgICAgIHJldHVybiBvdGhlciBpbnN0YW5jZW9mIE51bGxWTm9kZTtcbiAgICB9XG59XG5jbGFzcyBET01WTm9kZSBleHRlbmRzIFZOb2RlQmFzZSB7XG4gICAgY29uc3RydWN0b3Iobm9kZSwgY2hpbGRTcGVjcywgcGFyZW50LCBpc05hdGl2ZSkge1xuICAgICAgICBzdXBlcihwYXJlbnQpO1xuICAgICAgICB0aGlzLm5vZGUgPSBub2RlO1xuICAgICAgICB0aGlzLmNoaWxkU3BlY3MgPSBjaGlsZFNwZWNzO1xuICAgICAgICB0aGlzLmlzTmF0aXZlID0gaXNOYXRpdmU7XG4gICAgfVxuICAgIG1hdGNoZXMob3RoZXIpIHtcbiAgICAgICAgcmV0dXJuIG90aGVyIGluc3RhbmNlb2YgRE9NVk5vZGUgJiYgdGhpcy5ub2RlID09PSBvdGhlci5ub2RlO1xuICAgIH1cbiAgICB3cmFwKCkge1xuICAgICAgICB0aGlzLmNoaWxkVk5vZGVzID0gdGhpcy5jaGlsZFNwZWNzLm1hcCgoc3BlYykgPT4gY3JlYXRlVk5vZGUoc3BlYywgdGhpcykpO1xuICAgIH1cbiAgICBpbnNlcnROb2RlKGNvbnRleHQpIHtcbiAgICAgICAgY29uc3QgeyBwYXJlbnQsIHNpYmxpbmcgfSA9IGNvbnRleHQ7XG4gICAgICAgIGNvbnN0IHNob3VsZEluc2VydCA9ICEocGFyZW50ID09PSB0aGlzLm5vZGUucGFyZW50RWxlbWVudCAmJlxuICAgICAgICAgICAgc2libGluZyA9PT0gdGhpcy5ub2RlLnByZXZpb3VzU2libGluZyk7XG4gICAgICAgIGlmIChzaG91bGRJbnNlcnQpIHtcbiAgICAgICAgICAgIGNvbnN0IHRhcmdldCA9IHNpYmxpbmcgPyBzaWJsaW5nLm5leHRTaWJsaW5nIDogcGFyZW50LmZpcnN0Q2hpbGQ7XG4gICAgICAgICAgICBwYXJlbnQuaW5zZXJ0QmVmb3JlKHRoaXMubm9kZSwgdGFyZ2V0KTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBhdHRhY2goY29udGV4dCkge1xuICAgICAgICB0aGlzLndyYXAoKTtcbiAgICAgICAgdGhpcy5pbnNlcnROb2RlKGNvbnRleHQpO1xuICAgIH1cbiAgICBkZXRhY2goY29udGV4dCkge1xuICAgICAgICBjb250ZXh0LnBhcmVudC5yZW1vdmVDaGlsZCh0aGlzLm5vZGUpO1xuICAgIH1cbiAgICB1cGRhdGUocHJldiwgY29udGV4dCkge1xuICAgICAgICB0aGlzLndyYXAoKTtcbiAgICAgICAgdGhpcy5pbnNlcnROb2RlKGNvbnRleHQpO1xuICAgIH1cbiAgICBjbGVhbnVwRE9NQ2hpbGRyZW4oY29udGV4dCkge1xuICAgICAgICBjb25zdCBlbGVtZW50ID0gdGhpcy5ub2RlO1xuICAgICAgICBmb3IgKGxldCBjdXJyZW50ID0gZWxlbWVudC5sYXN0Q2hpbGQ7IGN1cnJlbnQgIT0gbnVsbDspIHtcbiAgICAgICAgICAgIGlmIChjb250ZXh0LnZkb20uaXNET01Ob2RlQ2FwdHVyZWQoY3VycmVudCkpIHtcbiAgICAgICAgICAgICAgICBjdXJyZW50ID0gY3VycmVudC5wcmV2aW91c1NpYmxpbmc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zdCBwcmV2ID0gY3VycmVudC5wcmV2aW91c1NpYmxpbmc7XG4gICAgICAgICAgICAgICAgZWxlbWVudC5yZW1vdmVDaGlsZChjdXJyZW50KTtcbiAgICAgICAgICAgICAgICBjdXJyZW50ID0gcHJldjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICByZWZpbmUoY29udGV4dCkge1xuICAgICAgICBpZiAoIXRoaXMuaXNOYXRpdmUpIHtcbiAgICAgICAgICAgIHRoaXMuY2xlYW51cERPTUNoaWxkcmVuKGNvbnRleHQpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGVsZW1lbnQgPSB0aGlzLm5vZGU7XG4gICAgICAgIG1hcmtFbGVtZW50QXNSZWZpbmVkKGVsZW1lbnQsIGNvbnRleHQudmRvbSk7XG4gICAgfVxuICAgIGF0dGFjaGVkKGNvbnRleHQpIHtcbiAgICAgICAgY29uc3QgeyBub2RlIH0gPSB0aGlzO1xuICAgICAgICBpZiAobm9kZSBpbnN0YW5jZW9mIEVsZW1lbnQgJiZcbiAgICAgICAgICAgICFpc0VsZW1lbnRSZWZpbmVkKG5vZGUsIGNvbnRleHQudmRvbSkgJiZcbiAgICAgICAgICAgIGNvbnRleHQudmRvbS5pc0RPTU5vZGVDYXB0dXJlZChub2RlKSkge1xuICAgICAgICAgICAgdGhpcy5yZWZpbmUoY29udGV4dCk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgY2hpbGRyZW4oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmNoaWxkVk5vZGVzO1xuICAgIH1cbn1cbmZ1bmN0aW9uIGlzRE9NVk5vZGUodikge1xuICAgIHJldHVybiB2IGluc3RhbmNlb2YgRE9NVk5vZGU7XG59XG5mdW5jdGlvbiBjcmVhdGVET01WTm9kZShub2RlLCBjaGlsZFNwZWNzLCBwYXJlbnQsIGlzTmF0aXZlKSB7XG4gICAgcmV0dXJuIG5ldyBET01WTm9kZShub2RlLCBjaGlsZFNwZWNzLCBwYXJlbnQsIGlzTmF0aXZlKTtcbn1cbmNsYXNzIEFycmF5Vk5vZGUgZXh0ZW5kcyBWTm9kZUJhc2Uge1xuICAgIGNvbnN0cnVjdG9yKGl0ZW1zLCBrZXksIHBhcmVudCkge1xuICAgICAgICBzdXBlcihwYXJlbnQpO1xuICAgICAgICB0aGlzLml0ZW1zID0gaXRlbXM7XG4gICAgICAgIHRoaXMuaWQgPSBrZXk7XG4gICAgfVxuICAgIG1hdGNoZXMob3RoZXIpIHtcbiAgICAgICAgcmV0dXJuIG90aGVyIGluc3RhbmNlb2YgQXJyYXlWTm9kZTtcbiAgICB9XG4gICAga2V5KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5pZDtcbiAgICB9XG4gICAgY2hpbGRyZW4oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmNoaWxkVk5vZGVzO1xuICAgIH1cbiAgICB3cmFwKCkge1xuICAgICAgICB0aGlzLmNoaWxkVk5vZGVzID0gdGhpcy5pdGVtcy5tYXAoKHNwZWMpID0+IGNyZWF0ZVZOb2RlKHNwZWMsIHRoaXMpKTtcbiAgICB9XG4gICAgYXR0YWNoKCkge1xuICAgICAgICB0aGlzLndyYXAoKTtcbiAgICB9XG4gICAgdXBkYXRlKCkge1xuICAgICAgICB0aGlzLndyYXAoKTtcbiAgICB9XG59XG5mdW5jdGlvbiBjcmVhdGVWTm9kZShzcGVjLCBwYXJlbnQpIHtcbiAgICBpZiAoaXNOb2RlU3BlYyhzcGVjKSkge1xuICAgICAgICByZXR1cm4gbmV3IEVsZW1lbnRWTm9kZShzcGVjLCBwYXJlbnQpO1xuICAgIH1cbiAgICBpZiAoaXNDb21wb25lbnRTcGVjKHNwZWMpKSB7XG4gICAgICAgIGlmIChzcGVjLnR5cGUgPT09IEFycmF5KSB7XG4gICAgICAgICAgICByZXR1cm4gbmV3IEFycmF5Vk5vZGUoc3BlYy5jaGlsZHJlbiwgc3BlYy5wcm9wcy5rZXksIHBhcmVudCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5ldyBDb21wb25lbnRWTm9kZShzcGVjLCBwYXJlbnQpO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIHNwZWMgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHJldHVybiBuZXcgVGV4dFZOb2RlKHNwZWMsIHBhcmVudCk7XG4gICAgfVxuICAgIGlmIChzcGVjID09IG51bGwpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBOdWxsVk5vZGUocGFyZW50KTtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBzcGVjID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIHJldHVybiBuZXcgSW5saW5lRnVuY3Rpb25WTm9kZShzcGVjLCBwYXJlbnQpO1xuICAgIH1cbiAgICBpZiAoc3BlYyBpbnN0YW5jZW9mIE5vZGUpIHtcbiAgICAgICAgcmV0dXJuIGNyZWF0ZURPTVZOb2RlKHNwZWMsIFtdLCBwYXJlbnQsIHRydWUpO1xuICAgIH1cbiAgICBpZiAoQXJyYXkuaXNBcnJheShzcGVjKSkge1xuICAgICAgICByZXR1cm4gbmV3IEFycmF5Vk5vZGUoc3BlYywgbnVsbCwgcGFyZW50KTtcbiAgICB9XG4gICAgdGhyb3cgbmV3IEVycm9yKCdVbmFibGUgdG8gY3JlYXRlIHZpcnR1YWwgbm9kZSBmb3Igc3BlYycpO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVWRE9NKHJvb3ROb2RlKSB7XG4gICAgY29uc3QgY29udGV4dHMgPSBuZXcgV2Vha01hcCgpO1xuICAgIGNvbnN0IGh1YnMgPSBuZXcgV2Vha01hcCgpO1xuICAgIGNvbnN0IHBhcmVudE5vZGVzID0gbmV3IFdlYWtNYXAoKTtcbiAgICBjb25zdCBwYXNzaW5nTGlua3MgPSBuZXcgV2Vha01hcCgpO1xuICAgIGNvbnN0IGxpbmtlZFBhcmVudHMgPSBuZXcgV2Vha1NldCgpO1xuICAgIGNvbnN0IExFQVZFID0gU3ltYm9sKCk7XG4gICAgZnVuY3Rpb24gZXhlY3V0ZSQxKHZub2RlLCBvbGQpIHtcbiAgICAgICAgZXhlY3V0ZSh2bm9kZSwgb2xkLCB2ZG9tKTtcbiAgICB9XG4gICAgZnVuY3Rpb24gY3JlYXRWTm9kZUNvbnRleHQodm5vZGUpIHtcbiAgICAgICAgY29uc3QgcGFyZW50Tm9kZSA9IHBhcmVudE5vZGVzLmdldCh2bm9kZSk7XG4gICAgICAgIGNvbnRleHRzLnNldCh2bm9kZSwge1xuICAgICAgICAgICAgcGFyZW50OiBwYXJlbnROb2RlLFxuICAgICAgICAgICAgZ2V0IG5vZGUoKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgbGlua2VkID0gcGFzc2luZ0xpbmtzXG4gICAgICAgICAgICAgICAgICAgIC5nZXQodm5vZGUpXG4gICAgICAgICAgICAgICAgICAgIC5maW5kKChsaW5rKSA9PiBsaW5rLm5vZGUgIT0gbnVsbCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGxpbmtlZCA/IGxpbmtlZC5ub2RlIDogbnVsbDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBnZXQgbm9kZXMoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHBhc3NpbmdMaW5rc1xuICAgICAgICAgICAgICAgICAgICAuZ2V0KHZub2RlKVxuICAgICAgICAgICAgICAgICAgICAubWFwKChsaW5rKSA9PiBsaW5rLm5vZGUpXG4gICAgICAgICAgICAgICAgICAgIC5maWx0ZXIoKG5vZGUpID0+IG5vZGUpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGdldCBzaWJsaW5nKCkge1xuICAgICAgICAgICAgICAgIGlmIChwYXJlbnROb2RlID09PSByb290Tm9kZS5wYXJlbnRFbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBwYXNzaW5nTGlua3MuZ2V0KHZub2RlKS5maXJzdC5ub2RlLnByZXZpb3VzU2libGluZztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29uc3QgaHViID0gaHVicy5nZXQocGFyZW50Tm9kZSk7XG4gICAgICAgICAgICAgICAgbGV0IGN1cnJlbnQgPSBwYXNzaW5nTGlua3MuZ2V0KHZub2RlKS5maXJzdDtcbiAgICAgICAgICAgICAgICB3aGlsZSAoKGN1cnJlbnQgPSBodWIubGlua3MuYmVmb3JlKGN1cnJlbnQpKSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoY3VycmVudC5ub2RlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gY3VycmVudC5ub2RlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHZkb20sXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBmdW5jdGlvbiBjcmVhdGVSb290Vk5vZGVMaW5rcyh2bm9kZSkge1xuICAgICAgICBjb25zdCBwYXJlbnROb2RlID0gcm9vdE5vZGUucGFyZW50RWxlbWVudCB8fCBkb2N1bWVudC5jcmVhdGVEb2N1bWVudEZyYWdtZW50KCk7XG4gICAgICAgIGNvbnN0IG5vZGUgPSByb290Tm9kZTtcbiAgICAgICAgY29uc3QgbGlua3MgPSBuZXcgTGlua2VkTGlzdCh7XG4gICAgICAgICAgICBwYXJlbnROb2RlLFxuICAgICAgICAgICAgbm9kZSxcbiAgICAgICAgfSk7XG4gICAgICAgIHBhc3NpbmdMaW5rcy5zZXQodm5vZGUsIGxpbmtzLmNvcHkoKSk7XG4gICAgICAgIHBhcmVudE5vZGVzLnNldCh2bm9kZSwgcGFyZW50Tm9kZSk7XG4gICAgICAgIGh1YnMuc2V0KHBhcmVudE5vZGUsIHtcbiAgICAgICAgICAgIG5vZGU6IHBhcmVudE5vZGUsXG4gICAgICAgICAgICBsaW5rcyxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIGZ1bmN0aW9uIGNyZWF0ZVZOb2RlTGlua3Modm5vZGUpIHtcbiAgICAgICAgY29uc3QgcGFyZW50ID0gdm5vZGUucGFyZW50KCk7XG4gICAgICAgIGNvbnN0IGlzQnJhbmNoID0gbGlua2VkUGFyZW50cy5oYXMocGFyZW50KTtcbiAgICAgICAgY29uc3QgcGFyZW50Tm9kZSA9IGlzRE9NVk5vZGUocGFyZW50KVxuICAgICAgICAgICAgPyBwYXJlbnQubm9kZVxuICAgICAgICAgICAgOiBwYXJlbnROb2Rlcy5nZXQocGFyZW50KTtcbiAgICAgICAgcGFyZW50Tm9kZXMuc2V0KHZub2RlLCBwYXJlbnROb2RlKTtcbiAgICAgICAgY29uc3Qgdm5vZGVMaW5rcyA9IG5ldyBMaW5rZWRMaXN0KCk7XG4gICAgICAgIHBhc3NpbmdMaW5rcy5zZXQodm5vZGUsIHZub2RlTGlua3MpO1xuICAgICAgICBpZiAoaXNCcmFuY2gpIHtcbiAgICAgICAgICAgIGNvbnN0IG5ld0xpbmsgPSB7XG4gICAgICAgICAgICAgICAgcGFyZW50Tm9kZSxcbiAgICAgICAgICAgICAgICBub2RlOiBudWxsLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGxldCBjdXJyZW50ID0gdm5vZGU7XG4gICAgICAgICAgICBkbyB7XG4gICAgICAgICAgICAgICAgcGFzc2luZ0xpbmtzLmdldChjdXJyZW50KS5wdXNoKG5ld0xpbmspO1xuICAgICAgICAgICAgICAgIGN1cnJlbnQgPSBjdXJyZW50LnBhcmVudCgpO1xuICAgICAgICAgICAgfSB3aGlsZSAoY3VycmVudCAmJiAhaXNET01WTm9kZShjdXJyZW50KSk7XG4gICAgICAgICAgICBodWJzLmdldChwYXJlbnROb2RlKS5saW5rcy5wdXNoKG5ld0xpbmspO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgbGlua2VkUGFyZW50cy5hZGQocGFyZW50KTtcbiAgICAgICAgICAgIGNvbnN0IGxpbmtzID0gaXNET01WTm9kZShwYXJlbnQpXG4gICAgICAgICAgICAgICAgPyBodWJzLmdldChwYXJlbnROb2RlKS5saW5rc1xuICAgICAgICAgICAgICAgIDogcGFzc2luZ0xpbmtzLmdldChwYXJlbnQpO1xuICAgICAgICAgICAgbGlua3MuZm9yRWFjaCgobGluaykgPT4gdm5vZGVMaW5rcy5wdXNoKGxpbmspKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBmdW5jdGlvbiBjb25uZWN0RE9NVk5vZGUodm5vZGUpIHtcbiAgICAgICAgaWYgKGlzRE9NVk5vZGUodm5vZGUpKSB7XG4gICAgICAgICAgICBjb25zdCB7IG5vZGUgfSA9IHZub2RlO1xuICAgICAgICAgICAgaHVicy5zZXQobm9kZSwge1xuICAgICAgICAgICAgICAgIG5vZGUsXG4gICAgICAgICAgICAgICAgbGlua3M6IG5ldyBMaW5rZWRMaXN0KHtcbiAgICAgICAgICAgICAgICAgICAgcGFyZW50Tm9kZTogbm9kZSxcbiAgICAgICAgICAgICAgICAgICAgbm9kZTogbnVsbCxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcGFzc2luZ0xpbmtzLmdldCh2bm9kZSkuZm9yRWFjaCgobGluaykgPT4gKGxpbmsubm9kZSA9IG5vZGUpKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBmdW5jdGlvbiBhZGRWTm9kZSh2bm9kZSkge1xuICAgICAgICBjb25zdCBwYXJlbnQgPSB2bm9kZS5wYXJlbnQoKTtcbiAgICAgICAgaWYgKHBhcmVudCA9PSBudWxsKSB7XG4gICAgICAgICAgICBjcmVhdGVSb290Vk5vZGVMaW5rcyh2bm9kZSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBjcmVhdGVWTm9kZUxpbmtzKHZub2RlKTtcbiAgICAgICAgfVxuICAgICAgICBjb25uZWN0RE9NVk5vZGUodm5vZGUpO1xuICAgICAgICBjcmVhdFZOb2RlQ29udGV4dCh2bm9kZSk7XG4gICAgfVxuICAgIGZ1bmN0aW9uIGdldFZOb2RlQ29udGV4dCh2bm9kZSkge1xuICAgICAgICByZXR1cm4gY29udGV4dHMuZ2V0KHZub2RlKTtcbiAgICB9XG4gICAgZnVuY3Rpb24gZ2V0QW5jZXN0b3JzTGlua3Modm5vZGUpIHtcbiAgICAgICAgY29uc3QgcGFyZW50Tm9kZSA9IHBhcmVudE5vZGVzLmdldCh2bm9kZSk7XG4gICAgICAgIGNvbnN0IGh1YiA9IGh1YnMuZ2V0KHBhcmVudE5vZGUpO1xuICAgICAgICBjb25zdCBhbGxMaW5rcyA9IFtdO1xuICAgICAgICBsZXQgY3VycmVudCA9IHZub2RlO1xuICAgICAgICB3aGlsZSAoKGN1cnJlbnQgPSBjdXJyZW50LnBhcmVudCgpKSAmJiAhaXNET01WTm9kZShjdXJyZW50KSkge1xuICAgICAgICAgICAgYWxsTGlua3MucHVzaChwYXNzaW5nTGlua3MuZ2V0KGN1cnJlbnQpKTtcbiAgICAgICAgfVxuICAgICAgICBhbGxMaW5rcy5wdXNoKGh1Yi5saW5rcyk7XG4gICAgICAgIHJldHVybiBhbGxMaW5rcztcbiAgICB9XG4gICAgZnVuY3Rpb24gcmVwbGFjZVZOb2RlKG9sZCwgdm5vZGUpIHtcbiAgICAgICAgaWYgKHZub2RlLnBhcmVudCgpID09IG51bGwpIHtcbiAgICAgICAgICAgIGFkZFZOb2RlKHZub2RlKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBvbGRDb250ZXh0ID0gY29udGV4dHMuZ2V0KG9sZCk7XG4gICAgICAgIGNvbnN0IHsgcGFyZW50OiBwYXJlbnROb2RlIH0gPSBvbGRDb250ZXh0O1xuICAgICAgICBwYXJlbnROb2Rlcy5zZXQodm5vZGUsIHBhcmVudE5vZGUpO1xuICAgICAgICBjb25zdCBvbGRMaW5rcyA9IHBhc3NpbmdMaW5rcy5nZXQob2xkKTtcbiAgICAgICAgY29uc3QgbmV3TGluayA9IHtcbiAgICAgICAgICAgIHBhcmVudE5vZGUsXG4gICAgICAgICAgICBub2RlOiBudWxsLFxuICAgICAgICB9O1xuICAgICAgICBnZXRBbmNlc3RvcnNMaW5rcyh2bm9kZSkuZm9yRWFjaCgobGlua3MpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IG5leHRMaW5rID0gbGlua3MuYWZ0ZXIob2xkTGlua3MubGFzdCk7XG4gICAgICAgICAgICBvbGRMaW5rcy5mb3JFYWNoKChsaW5rKSA9PiBsaW5rcy5kZWxldGUobGluaykpO1xuICAgICAgICAgICAgaWYgKG5leHRMaW5rKSB7XG4gICAgICAgICAgICAgICAgbGlua3MuaW5zZXJ0QmVmb3JlKG5ld0xpbmssIG5leHRMaW5rKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGxpbmtzLnB1c2gobmV3TGluayk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBjb25zdCB2bm9kZUxpbmtzID0gbmV3IExpbmtlZExpc3QobmV3TGluayk7XG4gICAgICAgIHBhc3NpbmdMaW5rcy5zZXQodm5vZGUsIHZub2RlTGlua3MpO1xuICAgICAgICBjcmVhdFZOb2RlQ29udGV4dCh2bm9kZSk7XG4gICAgfVxuICAgIGZ1bmN0aW9uIGFkb3B0Vk5vZGUodm5vZGUsIHBhcmVudCkge1xuICAgICAgICBjb25zdCB2bm9kZUxpbmtzID0gcGFzc2luZ0xpbmtzLmdldCh2bm9kZSk7XG4gICAgICAgIGNvbnN0IHBhcmVudExpbmtzID0gcGFzc2luZ0xpbmtzLmdldChwYXJlbnQpLmNvcHkoKTtcbiAgICAgICAgdm5vZGUucGFyZW50KHBhcmVudCk7XG4gICAgICAgIGdldEFuY2VzdG9yc0xpbmtzKHZub2RlKS5mb3JFYWNoKChsaW5rcykgPT4ge1xuICAgICAgICAgICAgdm5vZGVMaW5rcy5mb3JFYWNoKChsaW5rKSA9PiBsaW5rcy5pbnNlcnRCZWZvcmUobGluaywgcGFyZW50TGlua3MuZmlyc3QpKTtcbiAgICAgICAgICAgIHBhcmVudExpbmtzLmZvckVhY2goKGxpbmspID0+IGxpbmtzLmRlbGV0ZShsaW5rKSk7XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBmdW5jdGlvbiBpc0RPTU5vZGVDYXB0dXJlZChub2RlKSB7XG4gICAgICAgIHJldHVybiBodWJzLmhhcyhub2RlKSAmJiBub2RlICE9PSByb290Tm9kZS5wYXJlbnRFbGVtZW50O1xuICAgIH1cbiAgICBjb25zdCB2ZG9tID0ge1xuICAgICAgICBleGVjdXRlOiBleGVjdXRlJDEsXG4gICAgICAgIGFkZFZOb2RlLFxuICAgICAgICBnZXRWTm9kZUNvbnRleHQsXG4gICAgICAgIHJlcGxhY2VWTm9kZSxcbiAgICAgICAgYWRvcHRWTm9kZSxcbiAgICAgICAgaXNET01Ob2RlQ2FwdHVyZWQsXG4gICAgICAgIExFQVZFLFxuICAgIH07XG4gICAgcmV0dXJuIHZkb207XG59XG5cbmNvbnN0IHJvb3RzID0gbmV3IFdlYWtNYXAoKTtcbmNvbnN0IHZkb21zID0gbmV3IFdlYWtNYXAoKTtcbmZ1bmN0aW9uIHJlYWxpemUobm9kZSwgdm5vZGUpIHtcbiAgICBjb25zdCBvbGQgPSByb290cy5nZXQobm9kZSkgfHwgbnVsbDtcbiAgICByb290cy5zZXQobm9kZSwgdm5vZGUpO1xuICAgIGxldCB2ZG9tO1xuICAgIGlmICh2ZG9tcy5oYXMobm9kZSkpIHtcbiAgICAgICAgdmRvbSA9IHZkb21zLmdldChub2RlKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHZkb20gPSBjcmVhdGVWRE9NKG5vZGUpO1xuICAgICAgICB2ZG9tcy5zZXQobm9kZSwgdmRvbSk7XG4gICAgfVxuICAgIHZkb20uZXhlY3V0ZSh2bm9kZSwgb2xkKTtcbiAgICByZXR1cm4gdmRvbS5nZXRWTm9kZUNvbnRleHQodm5vZGUpO1xufVxuZnVuY3Rpb24gcmVuZGVyKGVsZW1lbnQsIHNwZWMpIHtcbiAgICBjb25zdCB2bm9kZSA9IGNyZWF0ZURPTVZOb2RlKGVsZW1lbnQsIEFycmF5LmlzQXJyYXkoc3BlYykgPyBzcGVjIDogW3NwZWNdLCBudWxsLCBmYWxzZSk7XG4gICAgcmVhbGl6ZShlbGVtZW50LCB2bm9kZSk7XG4gICAgcmV0dXJuIGVsZW1lbnQ7XG59XG5mdW5jdGlvbiBzeW5jKG5vZGUsIHNwZWMpIHtcbiAgICBjb25zdCB2bm9kZSA9IGNyZWF0ZVZOb2RlKHNwZWMsIG51bGwpO1xuICAgIGNvbnN0IGNvbnRleHQgPSByZWFsaXplKG5vZGUsIHZub2RlKTtcbiAgICBjb25zdCB7IG5vZGVzIH0gPSBjb250ZXh0O1xuICAgIGlmIChub2Rlcy5sZW5ndGggIT09IDEgfHwgbm9kZXNbMF0gIT09IG5vZGUpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdTcGVjIGRvZXMgbm90IG1hdGNoIHRoZSBub2RlJyk7XG4gICAgfVxuICAgIHJldHVybiBub2Rlc1swXTtcbn1cbmZ1bmN0aW9uIHRlYXJkb3duKG5vZGUpIHtcbiAgICByb290cy5kZWxldGUobm9kZSk7XG4gICAgdmRvbXMuZGVsZXRlKG5vZGUpO1xufVxuXG5jb25zdCBwbHVnaW5zID0ge1xuICAgIGNyZWF0ZUVsZW1lbnQ6IGNyZWF0ZVBsdWdpbnNBUEkoUExVR0lOU19DUkVBVEVfRUxFTUVOVCksXG4gICAgc2V0QXR0cmlidXRlOiBjcmVhdGVQbHVnaW5zQVBJKFBMVUdJTlNfU0VUX0FUVFJJQlVURSksXG59O1xuXG5leHBvcnQgeyBnZXRDb21wb25lbnRDb250ZXh0IGFzIGdldENvbnRleHQsIHBsdWdpbnMsIHJlbmRlciwgc3luYywgdGVhcmRvd24gfTtcbiIsImltcG9ydCB7aXNGaXJlZm94fSBmcm9tICcuLi91dGlscy9wbGF0Zm9ybSc7XG5cbmV4cG9ydCBmdW5jdGlvbiBjbGFzc2VzKC4uLmFyZ3M6IChzdHJpbmcgfCB7W2Nsczogc3RyaW5nXTogYm9vbGVhbn0pW10pIHtcbiAgICBjb25zdCBjbGFzc2VzID0gW107XG4gICAgYXJncy5maWx0ZXIoKGMpID0+IEJvb2xlYW4oYykpLmZvckVhY2goKGMpID0+IHtcbiAgICAgICAgaWYgKHR5cGVvZiBjID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgY2xhc3Nlcy5wdXNoKGMpO1xuICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBjID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgY2xhc3Nlcy5wdXNoKC4uLk9iamVjdC5rZXlzKGMpLmZpbHRlcigoa2V5KSA9PiBCb29sZWFuKGNba2V5XSkpKTtcbiAgICAgICAgfVxuICAgIH0pO1xuICAgIHJldHVybiBjbGFzc2VzLmpvaW4oJyAnKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNvbXBvc2U8VCBleHRlbmRzIE1hbGV2aWMuQ29tcG9uZW50Pih0eXBlOiBULCAuLi53cmFwcGVyczogKCh0OiBUKSA9PiBUKVtdKSB7XG4gICAgcmV0dXJuIHdyYXBwZXJzLnJlZHVjZSgodCwgdykgPT4gdyh0KSwgdHlwZSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBvcGVuRmlsZShvcHRpb25zOiB7ZXh0ZW5zaW9uczogc3RyaW5nW119LCBjYWxsYmFjazogKGNvbnRlbnQ6IHN0cmluZykgPT4gdm9pZCkge1xuICAgIGNvbnN0IGlucHV0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnaW5wdXQnKTtcbiAgICBpbnB1dC50eXBlID0gJ2ZpbGUnO1xuICAgIGlucHV0LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG4gICAgaWYgKG9wdGlvbnMuZXh0ZW5zaW9ucyAmJiBvcHRpb25zLmV4dGVuc2lvbnMubGVuZ3RoID4gMCkge1xuICAgICAgICBpbnB1dC5hY2NlcHQgPSBvcHRpb25zLmV4dGVuc2lvbnMubWFwKChleHQpID0+IGAuJHtleHR9YCkuam9pbignLCcpO1xuICAgIH1cbiAgICBjb25zdCByZWFkZXIgPSBuZXcgRmlsZVJlYWRlcigpO1xuICAgIHJlYWRlci5vbmxvYWRlbmQgPSAoKSA9PiBjYWxsYmFjayhyZWFkZXIucmVzdWx0IGFzIHN0cmluZyk7XG4gICAgaW5wdXQub25jaGFuZ2UgPSAoKSA9PiB7XG4gICAgICAgIGlmIChpbnB1dC5maWxlc1swXSkge1xuICAgICAgICAgICAgcmVhZGVyLnJlYWRBc1RleHQoaW5wdXQuZmlsZXNbMF0pO1xuICAgICAgICAgICAgZG9jdW1lbnQuYm9keS5yZW1vdmVDaGlsZChpbnB1dCk7XG4gICAgICAgIH1cbiAgICB9O1xuICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoaW5wdXQpO1xuICAgIGlucHV0LmNsaWNrKCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzYXZlRmlsZShuYW1lOiBzdHJpbmcsIGNvbnRlbnQ6IHN0cmluZykge1xuICAgIGlmIChpc0ZpcmVmb3goKSkge1xuICAgICAgICBjb25zdCBhID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpO1xuICAgICAgICBhLmhyZWYgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKG5ldyBCbG9iKFtjb250ZW50XSkpO1xuICAgICAgICBhLmRvd25sb2FkID0gbmFtZTtcbiAgICAgICAgYS5jbGljaygpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHt0eXBlOiAnc2F2ZS1maWxlJywgZGF0YToge25hbWUsIGNvbnRlbnR9fSk7XG4gICAgfVxufVxuXG50eXBlIEFueVZvaWRGdW5jdGlvbiA9ICguLi5hcmdzOiBhbnlbXSkgPT4gdm9pZDtcblxuZXhwb3J0IGZ1bmN0aW9uIHRocm90dGxlPEYgZXh0ZW5kcyBBbnlWb2lkRnVuY3Rpb24+KGNhbGxiYWNrOiBGKTogRiB7XG4gICAgbGV0IGZyYW1lSWQgPSBudWxsO1xuICAgIHJldHVybiAoKC4uLmFyZ3M6IGFueVtdKSA9PiB7XG4gICAgICAgIGlmICghZnJhbWVJZCkge1xuICAgICAgICAgICAgY2FsbGJhY2soLi4uYXJncyk7XG4gICAgICAgICAgICBmcmFtZUlkID0gcmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IChmcmFtZUlkID0gbnVsbCkpO1xuICAgICAgICB9XG4gICAgfSkgYXMgRjtcbn1cblxuaW50ZXJmYWNlIFN3aXBlRXZlbnRPYmplY3Qge1xuICAgIGNsaWVudFg6IG51bWJlcjtcbiAgICBjbGllbnRZOiBudW1iZXI7XG59XG5cbnR5cGUgU3dpcGVFdmVudEhhbmRsZXI8VCA9IHZvaWQ+ID0gKGU6IFN3aXBlRXZlbnRPYmplY3QsIG5hdGl2ZUV2ZW50OiBNb3VzZUV2ZW50IHwgVG91Y2hFdmVudCkgPT4gVDtcbnR5cGUgU3RhcnRTd2lwZUhhbmRsZXIgPSBTd2lwZUV2ZW50SGFuZGxlcjx7bW92ZTogU3dpcGVFdmVudEhhbmRsZXI7IHVwOiBTd2lwZUV2ZW50SGFuZGxlcn0+O1xuXG5mdW5jdGlvbiBvblN3aXBlU3RhcnQoXG4gICAgc3RhcnRFdmVudE9iajogTW91c2VFdmVudCB8IFRvdWNoRXZlbnQsXG4gICAgc3RhcnRIYW5kbGVyOiBTdGFydFN3aXBlSGFuZGxlcixcbikge1xuICAgIGNvbnN0IGlzVG91Y2hFdmVudCA9XG4gICAgICAgIHR5cGVvZiBUb3VjaEV2ZW50ICE9PSAndW5kZWZpbmVkJyAmJlxuICAgICAgICBzdGFydEV2ZW50T2JqIGluc3RhbmNlb2YgVG91Y2hFdmVudDtcbiAgICBjb25zdCB0b3VjaElkID0gaXNUb3VjaEV2ZW50XG4gICAgICAgID8gKHN0YXJ0RXZlbnRPYmogYXMgVG91Y2hFdmVudCkuY2hhbmdlZFRvdWNoZXNbMF0uaWRlbnRpZmllclxuICAgICAgICA6IG51bGw7XG4gICAgY29uc3QgcG9pbnRlck1vdmVFdmVudCA9IGlzVG91Y2hFdmVudCA/ICd0b3VjaG1vdmUnIDogJ21vdXNlbW92ZSc7XG4gICAgY29uc3QgcG9pbnRlclVwRXZlbnQgPSBpc1RvdWNoRXZlbnQgPyAndG91Y2hlbmQnIDogJ21vdXNldXAnO1xuXG4gICAgaWYgKCFpc1RvdWNoRXZlbnQpIHtcbiAgICAgICAgc3RhcnRFdmVudE9iai5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGdldFN3aXBlRXZlbnRPYmplY3QoZTogTW91c2VFdmVudCB8IFRvdWNoRXZlbnQpIHtcbiAgICAgICAgY29uc3Qge2NsaWVudFgsIGNsaWVudFl9ID0gaXNUb3VjaEV2ZW50XG4gICAgICAgICAgICA/IGdldFRvdWNoKGUgYXMgVG91Y2hFdmVudClcbiAgICAgICAgICAgIDogZSBhcyBNb3VzZUV2ZW50O1xuICAgICAgICByZXR1cm4ge2NsaWVudFgsIGNsaWVudFl9O1xuICAgIH1cblxuICAgIGNvbnN0IHN0YXJ0U0UgPSBnZXRTd2lwZUV2ZW50T2JqZWN0KHN0YXJ0RXZlbnRPYmopO1xuICAgIGNvbnN0IHttb3ZlOiBtb3ZlSGFuZGxlciwgdXA6IHVwSGFuZGxlcn0gPSBzdGFydEhhbmRsZXIoc3RhcnRTRSwgc3RhcnRFdmVudE9iaik7XG5cbiAgICBmdW5jdGlvbiBnZXRUb3VjaChlOiBUb3VjaEV2ZW50KSB7XG4gICAgICAgIHJldHVybiBBcnJheS5mcm9tKGUuY2hhbmdlZFRvdWNoZXMpLmZpbmQoXG4gICAgICAgICAgICAoe2lkZW50aWZpZXI6IGlkfSkgPT4gaWQgPT09IHRvdWNoSWQsXG4gICAgICAgICk7XG4gICAgfVxuXG4gICAgY29uc3Qgb25Qb2ludGVyTW92ZSA9IHRocm90dGxlKChlKSA9PiB7XG4gICAgICAgIGNvbnN0IHNlID0gZ2V0U3dpcGVFdmVudE9iamVjdChlKTtcbiAgICAgICAgbW92ZUhhbmRsZXIoc2UsIGUpO1xuICAgIH0pO1xuXG4gICAgZnVuY3Rpb24gb25Qb2ludGVyVXAoZSkge1xuICAgICAgICB1bnN1YnNjcmliZSgpO1xuICAgICAgICBjb25zdCBzZSA9IGdldFN3aXBlRXZlbnRPYmplY3QoZSk7XG4gICAgICAgIHVwSGFuZGxlcihzZSwgZSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gdW5zdWJzY3JpYmUoKSB7XG4gICAgICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKHBvaW50ZXJNb3ZlRXZlbnQsIG9uUG9pbnRlck1vdmUpO1xuICAgICAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcihwb2ludGVyVXBFdmVudCwgb25Qb2ludGVyVXApO1xuICAgIH1cblxuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKHBvaW50ZXJNb3ZlRXZlbnQsIG9uUG9pbnRlck1vdmUsIHtwYXNzaXZlOiB0cnVlfSk7XG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIocG9pbnRlclVwRXZlbnQsIG9uUG9pbnRlclVwLCB7cGFzc2l2ZTogdHJ1ZX0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlU3dpcGVIYW5kbGVyKHN0YXJ0SGFuZGxlcjogU3RhcnRTd2lwZUhhbmRsZXIpIHtcbiAgICByZXR1cm4gKGU6IE1vdXNlRXZlbnQgfCBUb3VjaEV2ZW50KSA9PiBvblN3aXBlU3RhcnQoZSwgc3RhcnRIYW5kbGVyKTtcbn1cbiIsImltcG9ydCB7Y2xhc3Nlc30gZnJvbSAnLi4vdXRpbHMnO1xuXG5mdW5jdGlvbiB0b0FycmF5PFQ+KHg6IFQgfCBUW10pIHtcbiAgICByZXR1cm4gQXJyYXkuaXNBcnJheSh4KSA/IHggOiBbeF07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtZXJnZUNsYXNzKFxuICAgIGNsczogc3RyaW5nIHwge1tjbHM6IHN0cmluZ106IGFueX0gfCAoc3RyaW5nIHwge1tjbHM6IHN0cmluZ106IGFueX0pW10sXG4gICAgcHJvcHNDbHM6IHN0cmluZyB8IHtbY2xzOiBzdHJpbmddOiBhbnl9IHwgKHN0cmluZyB8IHtbY2xzOiBzdHJpbmddOiBhbnl9KVtdXG4pIHtcbiAgICBjb25zdCBub3JtYWxpemVkID0gdG9BcnJheShjbHMpLmNvbmNhdCh0b0FycmF5KHByb3BzQ2xzKSk7XG4gICAgcmV0dXJuIGNsYXNzZXMoLi4ubm9ybWFsaXplZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBvbWl0QXR0cnMob21pdDogc3RyaW5nW10sIGF0dHJzOiBNYWxldmljLk5vZGVBdHRycykge1xuICAgIGNvbnN0IHJlc3VsdDogTWFsZXZpYy5Ob2RlQXR0cnMgPSB7fTtcbiAgICBPYmplY3Qua2V5cyhhdHRycykuZm9yRWFjaCgoa2V5KSA9PiB7XG4gICAgICAgIGlmIChvbWl0LmluZGV4T2Yoa2V5KSA8IDApIHtcbiAgICAgICAgICAgIHJlc3VsdFtrZXldID0gYXR0cnNba2V5XTtcbiAgICAgICAgfVxuICAgIH0pO1xuICAgIHJldHVybiByZXN1bHQ7XG59XG4iLCJpbXBvcnQge219IGZyb20gJ21hbGV2aWMnO1xuaW1wb3J0IHttZXJnZUNsYXNzLCBvbWl0QXR0cnN9IGZyb20gJy4uL3V0aWxzJztcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gQnV0dG9uKHByb3BzOiBNYWxldmljLk5vZGVBdHRycywgLi4uY2hpbGRyZW4pIHtcbiAgICBjb25zdCBjbHMgPSBtZXJnZUNsYXNzKCdidXR0b24nLCBwcm9wcy5jbGFzcyk7XG4gICAgY29uc3QgYXR0cnMgPSBvbWl0QXR0cnMoWydjbGFzcyddLCBwcm9wcyk7XG5cbiAgICByZXR1cm4gKFxuICAgICAgICA8YnV0dG9uIGNsYXNzPXtjbHN9IHsuLi5hdHRyc30+XG4gICAgICAgICAgICA8c3BhbiBjbGFzcz1cImJ1dHRvbl9fd3JhcHBlclwiPlxuICAgICAgICAgICAgICAgIHsuLi5jaGlsZHJlbn1cbiAgICAgICAgICAgIDwvc3Bhbj5cbiAgICAgICAgPC9idXR0b24+XG4gICAgKTtcbn1cbiIsImV4cG9ydCBpbnRlcmZhY2UgUkdCQSB7XG4gICAgcjogbnVtYmVyO1xuICAgIGc6IG51bWJlcjtcbiAgICBiOiBudW1iZXI7XG4gICAgYT86IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBIU0xBIHtcbiAgICBoOiBudW1iZXI7XG4gICAgczogbnVtYmVyO1xuICAgIGw6IG51bWJlcjtcbiAgICBhPzogbnVtYmVyO1xufVxuXG4vLyBodHRwczovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9IU0xfYW5kX0hTVlxuZXhwb3J0IGZ1bmN0aW9uIGhzbFRvUkdCKHtoLCBzLCBsLCBhID0gMX06IEhTTEEpOiBSR0JBIHtcbiAgICBpZiAocyA9PT0gMCkge1xuICAgICAgICBjb25zdCBbciwgYiwgZ10gPSBbbCwgbCwgbF0ubWFwKCh4KSA9PiBNYXRoLnJvdW5kKHggKiAyNTUpKTtcbiAgICAgICAgcmV0dXJuIHtyLCBnLCBiLCBhfTtcbiAgICB9XG5cbiAgICBjb25zdCBjID0gKDEgLSBNYXRoLmFicygyICogbCAtIDEpKSAqIHM7XG4gICAgY29uc3QgeCA9IGMgKiAoMSAtIE1hdGguYWJzKChoIC8gNjApICUgMiAtIDEpKTtcbiAgICBjb25zdCBtID0gbCAtIGMgLyAyO1xuICAgIGNvbnN0IFtyLCBnLCBiXSA9IChcbiAgICAgICAgaCA8IDYwID8gW2MsIHgsIDBdIDpcbiAgICAgICAgICAgIGggPCAxMjAgPyBbeCwgYywgMF0gOlxuICAgICAgICAgICAgICAgIGggPCAxODAgPyBbMCwgYywgeF0gOlxuICAgICAgICAgICAgICAgICAgICBoIDwgMjQwID8gWzAsIHgsIGNdIDpcbiAgICAgICAgICAgICAgICAgICAgICAgIGggPCAzMDAgPyBbeCwgMCwgY10gOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFtjLCAwLCB4XVxuICAgICkubWFwKChuKSA9PiBNYXRoLnJvdW5kKChuICsgbSkgKiAyNTUpKTtcblxuICAgIHJldHVybiB7ciwgZywgYiwgYX07XG59XG5cbi8vIGh0dHBzOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL0hTTF9hbmRfSFNWXG5leHBvcnQgZnVuY3Rpb24gcmdiVG9IU0woe3I6IHIyNTUsIGc6IGcyNTUsIGI6IGIyNTUsIGEgPSAxfTogUkdCQSk6IEhTTEEge1xuICAgIGNvbnN0IHIgPSByMjU1IC8gMjU1O1xuICAgIGNvbnN0IGcgPSBnMjU1IC8gMjU1O1xuICAgIGNvbnN0IGIgPSBiMjU1IC8gMjU1O1xuXG4gICAgY29uc3QgbWF4ID0gTWF0aC5tYXgociwgZywgYik7XG4gICAgY29uc3QgbWluID0gTWF0aC5taW4ociwgZywgYik7XG4gICAgY29uc3QgYyA9IG1heCAtIG1pbjtcblxuICAgIGNvbnN0IGwgPSAobWF4ICsgbWluKSAvIDI7XG5cbiAgICBpZiAoYyA9PT0gMCkge1xuICAgICAgICByZXR1cm4ge2g6IDAsIHM6IDAsIGwsIGF9O1xuICAgIH1cblxuICAgIGxldCBoID0gKFxuICAgICAgICBtYXggPT09IHIgPyAoKChnIC0gYikgLyBjKSAlIDYpIDpcbiAgICAgICAgICAgIG1heCA9PT0gZyA/ICgoYiAtIHIpIC8gYyArIDIpIDpcbiAgICAgICAgICAgICAgICAoKHIgLSBnKSAvIGMgKyA0KVxuICAgICkgKiA2MDtcbiAgICBpZiAoaCA8IDApIHtcbiAgICAgICAgaCArPSAzNjA7XG4gICAgfVxuXG4gICAgY29uc3QgcyA9IGMgLyAoMSAtIE1hdGguYWJzKDIgKiBsIC0gMSkpO1xuXG4gICAgcmV0dXJuIHtoLCBzLCBsLCBhfTtcbn1cblxuZnVuY3Rpb24gdG9GaXhlZChuOiBudW1iZXIsIGRpZ2l0cyA9IDApIHtcbiAgICBjb25zdCBmaXhlZCA9IG4udG9GaXhlZChkaWdpdHMpO1xuICAgIGlmIChkaWdpdHMgPT09IDApIHtcbiAgICAgICAgcmV0dXJuIGZpeGVkO1xuICAgIH1cbiAgICBjb25zdCBkb3QgPSBmaXhlZC5pbmRleE9mKCcuJyk7XG4gICAgaWYgKGRvdCA+PSAwKSB7XG4gICAgICAgIGNvbnN0IHplcm9zTWF0Y2ggPSBmaXhlZC5tYXRjaCgvMCskLyk7XG4gICAgICAgIGlmICh6ZXJvc01hdGNoKSB7XG4gICAgICAgICAgICBpZiAoemVyb3NNYXRjaC5pbmRleCA9PT0gZG90ICsgMSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmaXhlZC5zdWJzdHJpbmcoMCwgZG90KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBmaXhlZC5zdWJzdHJpbmcoMCwgemVyb3NNYXRjaC5pbmRleCk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZpeGVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmdiVG9TdHJpbmcocmdiOiBSR0JBKSB7XG4gICAgY29uc3Qge3IsIGcsIGIsIGF9ID0gcmdiO1xuICAgIGlmIChhICE9IG51bGwgJiYgYSA8IDEpIHtcbiAgICAgICAgcmV0dXJuIGByZ2JhKCR7dG9GaXhlZChyKX0sICR7dG9GaXhlZChnKX0sICR7dG9GaXhlZChiKX0sICR7dG9GaXhlZChhLCAyKX0pYDtcbiAgICB9XG4gICAgcmV0dXJuIGByZ2IoJHt0b0ZpeGVkKHIpfSwgJHt0b0ZpeGVkKGcpfSwgJHt0b0ZpeGVkKGIpfSlgO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmdiVG9IZXhTdHJpbmcoe3IsIGcsIGIsIGF9OiBSR0JBKSB7XG4gICAgcmV0dXJuIGAjJHsoYSAhPSBudWxsICYmIGEgPCAxID8gW3IsIGcsIGIsIE1hdGgucm91bmQoYSAqIDI1NSldIDogW3IsIGcsIGJdKS5tYXAoKHgpID0+IHtcbiAgICAgICAgcmV0dXJuIGAke3ggPCAxNiA/ICcwJyA6ICcnfSR7eC50b1N0cmluZygxNil9YDtcbiAgICB9KS5qb2luKCcnKX1gO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaHNsVG9TdHJpbmcoaHNsOiBIU0xBKSB7XG4gICAgY29uc3Qge2gsIHMsIGwsIGF9ID0gaHNsO1xuICAgIGlmIChhICE9IG51bGwgJiYgYSA8IDEpIHtcbiAgICAgICAgcmV0dXJuIGBoc2xhKCR7dG9GaXhlZChoKX0sICR7dG9GaXhlZChzICogMTAwKX0lLCAke3RvRml4ZWQobCAqIDEwMCl9JSwgJHt0b0ZpeGVkKGEsIDIpfSlgO1xuICAgIH1cbiAgICByZXR1cm4gYGhzbCgke3RvRml4ZWQoaCl9LCAke3RvRml4ZWQocyAqIDEwMCl9JSwgJHt0b0ZpeGVkKGwgKiAxMDApfSUpYDtcbn1cblxuY29uc3QgcmdiTWF0Y2ggPSAvXnJnYmE/XFwoW15cXChcXCldK1xcKSQvO1xuY29uc3QgaHNsTWF0Y2ggPSAvXmhzbGE/XFwoW15cXChcXCldK1xcKSQvO1xuY29uc3QgaGV4TWF0Y2ggPSAvXiNbMC05YS1mXSskL2k7XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZSgkY29sb3I6IHN0cmluZyk6IFJHQkEge1xuICAgIGNvbnN0IGMgPSAkY29sb3IudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG5cbiAgICBpZiAoYy5tYXRjaChyZ2JNYXRjaCkpIHtcbiAgICAgICAgcmV0dXJuIHBhcnNlUkdCKGMpO1xuICAgIH1cblxuICAgIGlmIChjLm1hdGNoKGhzbE1hdGNoKSkge1xuICAgICAgICByZXR1cm4gcGFyc2VIU0woYyk7XG4gICAgfVxuXG4gICAgaWYgKGMubWF0Y2goaGV4TWF0Y2gpKSB7XG4gICAgICAgIHJldHVybiBwYXJzZUhleChjKTtcbiAgICB9XG5cbiAgICBpZiAoa25vd25Db2xvcnMuaGFzKGMpKSB7XG4gICAgICAgIHJldHVybiBnZXRDb2xvckJ5TmFtZShjKTtcbiAgICB9XG5cbiAgICBpZiAoc3lzdGVtQ29sb3JzLmhhcyhjKSkge1xuICAgICAgICByZXR1cm4gZ2V0U3lzdGVtQ29sb3IoYyk7XG4gICAgfVxuXG4gICAgaWYgKCRjb2xvciA9PT0gJ3RyYW5zcGFyZW50Jykge1xuICAgICAgICByZXR1cm4ge3I6IDAsIGc6IDAsIGI6IDAsIGE6IDB9O1xuICAgIH1cblxuICAgIHRocm93IG5ldyBFcnJvcihgVW5hYmxlIHRvIHBhcnNlICR7JGNvbG9yfWApO1xufVxuXG5mdW5jdGlvbiBnZXROdW1iZXJzRnJvbVN0cmluZyhzdHI6IHN0cmluZywgc3BsaXR0ZXI6IFJlZ0V4cCwgcmFuZ2U6IG51bWJlcltdLCB1bml0czoge1t1bml0OiBzdHJpbmddOiBudW1iZXJ9KSB7XG4gICAgY29uc3QgcmF3ID0gc3RyLnNwbGl0KHNwbGl0dGVyKS5maWx0ZXIoKHgpID0+IHgpO1xuICAgIGNvbnN0IHVuaXRzTGlzdCA9IE9iamVjdC5lbnRyaWVzKHVuaXRzKTtcbiAgICBjb25zdCBudW1iZXJzID0gcmF3Lm1hcCgocikgPT4gci50cmltKCkpLm1hcCgociwgaSkgPT4ge1xuICAgICAgICBsZXQgbjogbnVtYmVyO1xuICAgICAgICBjb25zdCB1bml0ID0gdW5pdHNMaXN0LmZpbmQoKFt1XSkgPT4gci5lbmRzV2l0aCh1KSk7XG4gICAgICAgIGlmICh1bml0KSB7XG4gICAgICAgICAgICBuID0gcGFyc2VGbG9hdChyLnN1YnN0cmluZygwLCByLmxlbmd0aCAtIHVuaXRbMF0ubGVuZ3RoKSkgLyB1bml0WzFdICogcmFuZ2VbaV07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBuID0gcGFyc2VGbG9hdChyKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAocmFuZ2VbaV0gPiAxKSB7XG4gICAgICAgICAgICByZXR1cm4gTWF0aC5yb3VuZChuKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbjtcbiAgICB9KTtcbiAgICByZXR1cm4gbnVtYmVycztcbn1cblxuY29uc3QgcmdiU3BsaXR0ZXIgPSAvcmdiYT98XFwofFxcKXxcXC98LHxcXHMvaWc7XG5jb25zdCByZ2JSYW5nZSA9IFsyNTUsIDI1NSwgMjU1LCAxXTtcbmNvbnN0IHJnYlVuaXRzID0geyclJzogMTAwfTtcblxuZnVuY3Rpb24gcGFyc2VSR0IoJHJnYjogc3RyaW5nKSB7XG4gICAgY29uc3QgW3IsIGcsIGIsIGEgPSAxXSA9IGdldE51bWJlcnNGcm9tU3RyaW5nKCRyZ2IsIHJnYlNwbGl0dGVyLCByZ2JSYW5nZSwgcmdiVW5pdHMpO1xuICAgIHJldHVybiB7ciwgZywgYiwgYX07XG59XG5cbmNvbnN0IGhzbFNwbGl0dGVyID0gL2hzbGE/fFxcKHxcXCl8XFwvfCx8XFxzL2lnO1xuY29uc3QgaHNsUmFuZ2UgPSBbMzYwLCAxLCAxLCAxXTtcbmNvbnN0IGhzbFVuaXRzID0geyclJzogMTAwLCAnZGVnJzogMzYwLCAncmFkJzogMiAqIE1hdGguUEksICd0dXJuJzogMX07XG5cbmZ1bmN0aW9uIHBhcnNlSFNMKCRoc2w6IHN0cmluZykge1xuICAgIGNvbnN0IFtoLCBzLCBsLCBhID0gMV0gPSBnZXROdW1iZXJzRnJvbVN0cmluZygkaHNsLCBoc2xTcGxpdHRlciwgaHNsUmFuZ2UsIGhzbFVuaXRzKTtcbiAgICByZXR1cm4gaHNsVG9SR0Ioe2gsIHMsIGwsIGF9KTtcbn1cblxuZnVuY3Rpb24gcGFyc2VIZXgoJGhleDogc3RyaW5nKSB7XG4gICAgY29uc3QgaCA9ICRoZXguc3Vic3RyaW5nKDEpO1xuICAgIHN3aXRjaCAoaC5sZW5ndGgpIHtcbiAgICAgICAgY2FzZSAzOlxuICAgICAgICBjYXNlIDQ6IHtcbiAgICAgICAgICAgIGNvbnN0IFtyLCBnLCBiXSA9IFswLCAxLCAyXS5tYXAoKGkpID0+IHBhcnNlSW50KGAke2hbaV19JHtoW2ldfWAsIDE2KSk7XG4gICAgICAgICAgICBjb25zdCBhID0gaC5sZW5ndGggPT09IDMgPyAxIDogKHBhcnNlSW50KGAke2hbM119JHtoWzNdfWAsIDE2KSAvIDI1NSk7XG4gICAgICAgICAgICByZXR1cm4ge3IsIGcsIGIsIGF9O1xuICAgICAgICB9XG4gICAgICAgIGNhc2UgNjpcbiAgICAgICAgY2FzZSA4OiB7XG4gICAgICAgICAgICBjb25zdCBbciwgZywgYl0gPSBbMCwgMiwgNF0ubWFwKChpKSA9PiBwYXJzZUludChoLnN1YnN0cmluZyhpLCBpICsgMiksIDE2KSk7XG4gICAgICAgICAgICBjb25zdCBhID0gaC5sZW5ndGggPT09IDYgPyAxIDogKHBhcnNlSW50KGguc3Vic3RyaW5nKDYsIDgpLCAxNikgLyAyNTUpO1xuICAgICAgICAgICAgcmV0dXJuIHtyLCBnLCBiLCBhfTtcbiAgICAgICAgfVxuICAgIH1cbiAgICB0aHJvdyBuZXcgRXJyb3IoYFVuYWJsZSB0byBwYXJzZSAkeyRoZXh9YCk7XG59XG5cbmZ1bmN0aW9uIGdldENvbG9yQnlOYW1lKCRjb2xvcjogc3RyaW5nKSB7XG4gICAgY29uc3QgbiA9IGtub3duQ29sb3JzLmdldCgkY29sb3IpO1xuICAgIHJldHVybiB7XG4gICAgICAgIHI6IChuID4+IDE2KSAmIDI1NSxcbiAgICAgICAgZzogKG4gPj4gOCkgJiAyNTUsXG4gICAgICAgIGI6IChuID4+IDApICYgMjU1LFxuICAgICAgICBhOiAxXG4gICAgfTtcbn1cblxuZnVuY3Rpb24gZ2V0U3lzdGVtQ29sb3IoJGNvbG9yOiBzdHJpbmcpIHtcbiAgICBjb25zdCBuID0gc3lzdGVtQ29sb3JzLmdldCgkY29sb3IpO1xuICAgIHJldHVybiB7XG4gICAgICAgIHI6IChuID4+IDE2KSAmIDI1NSxcbiAgICAgICAgZzogKG4gPj4gOCkgJiAyNTUsXG4gICAgICAgIGI6IChuID4+IDApICYgMjU1LFxuICAgICAgICBhOiAxXG4gICAgfTtcbn1cblxuY29uc3Qga25vd25Db2xvcnM6IE1hcDxzdHJpbmcsIG51bWJlcj4gPSBuZXcgTWFwKE9iamVjdC5lbnRyaWVzKHtcbiAgICBhbGljZWJsdWU6IDB4ZjBmOGZmLFxuICAgIGFudGlxdWV3aGl0ZTogMHhmYWViZDcsXG4gICAgYXF1YTogMHgwMGZmZmYsXG4gICAgYXF1YW1hcmluZTogMHg3ZmZmZDQsXG4gICAgYXp1cmU6IDB4ZjBmZmZmLFxuICAgIGJlaWdlOiAweGY1ZjVkYyxcbiAgICBiaXNxdWU6IDB4ZmZlNGM0LFxuICAgIGJsYWNrOiAweDAwMDAwMCxcbiAgICBibGFuY2hlZGFsbW9uZDogMHhmZmViY2QsXG4gICAgYmx1ZTogMHgwMDAwZmYsXG4gICAgYmx1ZXZpb2xldDogMHg4YTJiZTIsXG4gICAgYnJvd246IDB4YTUyYTJhLFxuICAgIGJ1cmx5d29vZDogMHhkZWI4ODcsXG4gICAgY2FkZXRibHVlOiAweDVmOWVhMCxcbiAgICBjaGFydHJldXNlOiAweDdmZmYwMCxcbiAgICBjaG9jb2xhdGU6IDB4ZDI2OTFlLFxuICAgIGNvcmFsOiAweGZmN2Y1MCxcbiAgICBjb3JuZmxvd2VyYmx1ZTogMHg2NDk1ZWQsXG4gICAgY29ybnNpbGs6IDB4ZmZmOGRjLFxuICAgIGNyaW1zb246IDB4ZGMxNDNjLFxuICAgIGN5YW46IDB4MDBmZmZmLFxuICAgIGRhcmtibHVlOiAweDAwMDA4YixcbiAgICBkYXJrY3lhbjogMHgwMDhiOGIsXG4gICAgZGFya2dvbGRlbnJvZDogMHhiODg2MGIsXG4gICAgZGFya2dyYXk6IDB4YTlhOWE5LFxuICAgIGRhcmtncmV5OiAweGE5YTlhOSxcbiAgICBkYXJrZ3JlZW46IDB4MDA2NDAwLFxuICAgIGRhcmtraGFraTogMHhiZGI3NmIsXG4gICAgZGFya21hZ2VudGE6IDB4OGIwMDhiLFxuICAgIGRhcmtvbGl2ZWdyZWVuOiAweDU1NmIyZixcbiAgICBkYXJrb3JhbmdlOiAweGZmOGMwMCxcbiAgICBkYXJrb3JjaGlkOiAweDk5MzJjYyxcbiAgICBkYXJrcmVkOiAweDhiMDAwMCxcbiAgICBkYXJrc2FsbW9uOiAweGU5OTY3YSxcbiAgICBkYXJrc2VhZ3JlZW46IDB4OGZiYzhmLFxuICAgIGRhcmtzbGF0ZWJsdWU6IDB4NDgzZDhiLFxuICAgIGRhcmtzbGF0ZWdyYXk6IDB4MmY0ZjRmLFxuICAgIGRhcmtzbGF0ZWdyZXk6IDB4MmY0ZjRmLFxuICAgIGRhcmt0dXJxdW9pc2U6IDB4MDBjZWQxLFxuICAgIGRhcmt2aW9sZXQ6IDB4OTQwMGQzLFxuICAgIGRlZXBwaW5rOiAweGZmMTQ5MyxcbiAgICBkZWVwc2t5Ymx1ZTogMHgwMGJmZmYsXG4gICAgZGltZ3JheTogMHg2OTY5NjksXG4gICAgZGltZ3JleTogMHg2OTY5NjksXG4gICAgZG9kZ2VyYmx1ZTogMHgxZTkwZmYsXG4gICAgZmlyZWJyaWNrOiAweGIyMjIyMixcbiAgICBmbG9yYWx3aGl0ZTogMHhmZmZhZjAsXG4gICAgZm9yZXN0Z3JlZW46IDB4MjI4YjIyLFxuICAgIGZ1Y2hzaWE6IDB4ZmYwMGZmLFxuICAgIGdhaW5zYm9ybzogMHhkY2RjZGMsXG4gICAgZ2hvc3R3aGl0ZTogMHhmOGY4ZmYsXG4gICAgZ29sZDogMHhmZmQ3MDAsXG4gICAgZ29sZGVucm9kOiAweGRhYTUyMCxcbiAgICBncmF5OiAweDgwODA4MCxcbiAgICBncmV5OiAweDgwODA4MCxcbiAgICBncmVlbjogMHgwMDgwMDAsXG4gICAgZ3JlZW55ZWxsb3c6IDB4YWRmZjJmLFxuICAgIGhvbmV5ZGV3OiAweGYwZmZmMCxcbiAgICBob3RwaW5rOiAweGZmNjliNCxcbiAgICBpbmRpYW5yZWQ6IDB4Y2Q1YzVjLFxuICAgIGluZGlnbzogMHg0YjAwODIsXG4gICAgaXZvcnk6IDB4ZmZmZmYwLFxuICAgIGtoYWtpOiAweGYwZTY4YyxcbiAgICBsYXZlbmRlcjogMHhlNmU2ZmEsXG4gICAgbGF2ZW5kZXJibHVzaDogMHhmZmYwZjUsXG4gICAgbGF3bmdyZWVuOiAweDdjZmMwMCxcbiAgICBsZW1vbmNoaWZmb246IDB4ZmZmYWNkLFxuICAgIGxpZ2h0Ymx1ZTogMHhhZGQ4ZTYsXG4gICAgbGlnaHRjb3JhbDogMHhmMDgwODAsXG4gICAgbGlnaHRjeWFuOiAweGUwZmZmZixcbiAgICBsaWdodGdvbGRlbnJvZHllbGxvdzogMHhmYWZhZDIsXG4gICAgbGlnaHRncmF5OiAweGQzZDNkMyxcbiAgICBsaWdodGdyZXk6IDB4ZDNkM2QzLFxuICAgIGxpZ2h0Z3JlZW46IDB4OTBlZTkwLFxuICAgIGxpZ2h0cGluazogMHhmZmI2YzEsXG4gICAgbGlnaHRzYWxtb246IDB4ZmZhMDdhLFxuICAgIGxpZ2h0c2VhZ3JlZW46IDB4MjBiMmFhLFxuICAgIGxpZ2h0c2t5Ymx1ZTogMHg4N2NlZmEsXG4gICAgbGlnaHRzbGF0ZWdyYXk6IDB4Nzc4ODk5LFxuICAgIGxpZ2h0c2xhdGVncmV5OiAweDc3ODg5OSxcbiAgICBsaWdodHN0ZWVsYmx1ZTogMHhiMGM0ZGUsXG4gICAgbGlnaHR5ZWxsb3c6IDB4ZmZmZmUwLFxuICAgIGxpbWU6IDB4MDBmZjAwLFxuICAgIGxpbWVncmVlbjogMHgzMmNkMzIsXG4gICAgbGluZW46IDB4ZmFmMGU2LFxuICAgIG1hZ2VudGE6IDB4ZmYwMGZmLFxuICAgIG1hcm9vbjogMHg4MDAwMDAsXG4gICAgbWVkaXVtYXF1YW1hcmluZTogMHg2NmNkYWEsXG4gICAgbWVkaXVtYmx1ZTogMHgwMDAwY2QsXG4gICAgbWVkaXVtb3JjaGlkOiAweGJhNTVkMyxcbiAgICBtZWRpdW1wdXJwbGU6IDB4OTM3MGRiLFxuICAgIG1lZGl1bXNlYWdyZWVuOiAweDNjYjM3MSxcbiAgICBtZWRpdW1zbGF0ZWJsdWU6IDB4N2I2OGVlLFxuICAgIG1lZGl1bXNwcmluZ2dyZWVuOiAweDAwZmE5YSxcbiAgICBtZWRpdW10dXJxdW9pc2U6IDB4NDhkMWNjLFxuICAgIG1lZGl1bXZpb2xldHJlZDogMHhjNzE1ODUsXG4gICAgbWlkbmlnaHRibHVlOiAweDE5MTk3MCxcbiAgICBtaW50Y3JlYW06IDB4ZjVmZmZhLFxuICAgIG1pc3R5cm9zZTogMHhmZmU0ZTEsXG4gICAgbW9jY2FzaW46IDB4ZmZlNGI1LFxuICAgIG5hdmFqb3doaXRlOiAweGZmZGVhZCxcbiAgICBuYXZ5OiAweDAwMDA4MCxcbiAgICBvbGRsYWNlOiAweGZkZjVlNixcbiAgICBvbGl2ZTogMHg4MDgwMDAsXG4gICAgb2xpdmVkcmFiOiAweDZiOGUyMyxcbiAgICBvcmFuZ2U6IDB4ZmZhNTAwLFxuICAgIG9yYW5nZXJlZDogMHhmZjQ1MDAsXG4gICAgb3JjaGlkOiAweGRhNzBkNixcbiAgICBwYWxlZ29sZGVucm9kOiAweGVlZThhYSxcbiAgICBwYWxlZ3JlZW46IDB4OThmYjk4LFxuICAgIHBhbGV0dXJxdW9pc2U6IDB4YWZlZWVlLFxuICAgIHBhbGV2aW9sZXRyZWQ6IDB4ZGI3MDkzLFxuICAgIHBhcGF5YXdoaXA6IDB4ZmZlZmQ1LFxuICAgIHBlYWNocHVmZjogMHhmZmRhYjksXG4gICAgcGVydTogMHhjZDg1M2YsXG4gICAgcGluazogMHhmZmMwY2IsXG4gICAgcGx1bTogMHhkZGEwZGQsXG4gICAgcG93ZGVyYmx1ZTogMHhiMGUwZTYsXG4gICAgcHVycGxlOiAweDgwMDA4MCxcbiAgICByZWJlY2NhcHVycGxlOiAweDY2MzM5OSxcbiAgICByZWQ6IDB4ZmYwMDAwLFxuICAgIHJvc3licm93bjogMHhiYzhmOGYsXG4gICAgcm95YWxibHVlOiAweDQxNjllMSxcbiAgICBzYWRkbGVicm93bjogMHg4YjQ1MTMsXG4gICAgc2FsbW9uOiAweGZhODA3MixcbiAgICBzYW5keWJyb3duOiAweGY0YTQ2MCxcbiAgICBzZWFncmVlbjogMHgyZThiNTcsXG4gICAgc2Vhc2hlbGw6IDB4ZmZmNWVlLFxuICAgIHNpZW5uYTogMHhhMDUyMmQsXG4gICAgc2lsdmVyOiAweGMwYzBjMCxcbiAgICBza3libHVlOiAweDg3Y2VlYixcbiAgICBzbGF0ZWJsdWU6IDB4NmE1YWNkLFxuICAgIHNsYXRlZ3JheTogMHg3MDgwOTAsXG4gICAgc2xhdGVncmV5OiAweDcwODA5MCxcbiAgICBzbm93OiAweGZmZmFmYSxcbiAgICBzcHJpbmdncmVlbjogMHgwMGZmN2YsXG4gICAgc3RlZWxibHVlOiAweDQ2ODJiNCxcbiAgICB0YW46IDB4ZDJiNDhjLFxuICAgIHRlYWw6IDB4MDA4MDgwLFxuICAgIHRoaXN0bGU6IDB4ZDhiZmQ4LFxuICAgIHRvbWF0bzogMHhmZjYzNDcsXG4gICAgdHVycXVvaXNlOiAweDQwZTBkMCxcbiAgICB2aW9sZXQ6IDB4ZWU4MmVlLFxuICAgIHdoZWF0OiAweGY1ZGViMyxcbiAgICB3aGl0ZTogMHhmZmZmZmYsXG4gICAgd2hpdGVzbW9rZTogMHhmNWY1ZjUsXG4gICAgeWVsbG93OiAweGZmZmYwMCxcbiAgICB5ZWxsb3dncmVlbjogMHg5YWNkMzIsXG59KSk7XG5cbmNvbnN0IHN5c3RlbUNvbG9yczogTWFwPHN0cmluZywgbnVtYmVyPiA9IG5ldyBNYXAoT2JqZWN0LmVudHJpZXMoe1xuICAgIEFjdGl2ZUJvcmRlcjogMHgzYjk5ZmMsXG4gICAgQWN0aXZlQ2FwdGlvbjogMHgwMDAwMDAsXG4gICAgQXBwV29ya3NwYWNlOiAweGFhYWFhYSxcbiAgICBCYWNrZ3JvdW5kOiAweDYzNjNjZSxcbiAgICBCdXR0b25GYWNlOiAweGZmZmZmZixcbiAgICBCdXR0b25IaWdobGlnaHQ6IDB4ZTllOWU5LFxuICAgIEJ1dHRvblNoYWRvdzogMHg5ZmEwOWYsXG4gICAgQnV0dG9uVGV4dDogMHgwMDAwMDAsXG4gICAgQ2FwdGlvblRleHQ6IDB4MDAwMDAwLFxuICAgIEdyYXlUZXh0OiAweDdmN2Y3ZixcbiAgICBIaWdobGlnaHQ6IDB4YjJkN2ZmLFxuICAgIEhpZ2hsaWdodFRleHQ6IDB4MDAwMDAwLFxuICAgIEluYWN0aXZlQm9yZGVyOiAweGZmZmZmZixcbiAgICBJbmFjdGl2ZUNhcHRpb246IDB4ZmZmZmZmLFxuICAgIEluYWN0aXZlQ2FwdGlvblRleHQ6IDB4MDAwMDAwLFxuICAgIEluZm9CYWNrZ3JvdW5kOiAweGZiZmNjNSxcbiAgICBJbmZvVGV4dDogMHgwMDAwMDAsXG4gICAgTWVudTogMHhmNmY2ZjYsXG4gICAgTWVudVRleHQ6IDB4ZmZmZmZmLFxuICAgIFNjcm9sbGJhcjogMHhhYWFhYWEsXG4gICAgVGhyZWVERGFya1NoYWRvdzogMHgwMDAwMDAsXG4gICAgVGhyZWVERmFjZTogMHhjMGMwYzAsXG4gICAgVGhyZWVESGlnaGxpZ2h0OiAweGZmZmZmZixcbiAgICBUaHJlZURMaWdodFNoYWRvdzogMHhmZmZmZmYsXG4gICAgVGhyZWVEU2hhZG93OiAweDAwMDAwMCxcbiAgICBXaW5kb3c6IDB4ZWNlY2VjLFxuICAgIFdpbmRvd0ZyYW1lOiAweGFhYWFhYSxcbiAgICBXaW5kb3dUZXh0OiAweDAwMDAwMCxcbiAgICAnLXdlYmtpdC1mb2N1cy1yaW5nLWNvbG9yJzogMHhlNTk3MDBcbn0pLm1hcCgoW2tleSwgdmFsdWVdKSA9PiBba2V5LnRvTG93ZXJDYXNlKCksIHZhbHVlXSBhcyBbc3RyaW5nLCBudW1iZXJdKSk7XG4iLCJpbXBvcnQge219IGZyb20gJ21hbGV2aWMnO1xuaW1wb3J0IHttZXJnZUNsYXNzLCBvbWl0QXR0cnN9IGZyb20gJy4uL3V0aWxzJztcblxuaW50ZXJmYWNlIFRleHRCb3hQcm9wcyBleHRlbmRzIE1hbGV2aWMuTm9kZUF0dHJzIHtcbiAgICBvbmlucHV0PzogKGU6IEV2ZW50ICYge3RhcmdldDogSFRNTElucHV0RWxlbWVudH0pID0+IHZvaWQ7XG4gICAgb25jaGFuZ2U/OiAoZTogRXZlbnQgJiB7dGFyZ2V0OiBIVE1MSW5wdXRFbGVtZW50fSkgPT4gdm9pZDtcbn1cblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gVGV4dEJveChwcm9wczogVGV4dEJveFByb3BzKSB7XG4gICAgY29uc3QgY2xzID0gbWVyZ2VDbGFzcygndGV4dGJveCcsIHByb3BzLmNsYXNzKTtcbiAgICBjb25zdCBhdHRycyA9IG9taXRBdHRycyhbJ2NsYXNzJywgJ3R5cGUnXSwgcHJvcHMpO1xuXG4gICAgcmV0dXJuIChcbiAgICAgICAgPGlucHV0IGNsYXNzPXtjbHN9IHR5cGU9XCJ0ZXh0XCIgey4uLmF0dHJzfSAvPlxuICAgICk7XG59XG4iLCJleHBvcnQgZnVuY3Rpb24gc2NhbGUoeDogbnVtYmVyLCBpbkxvdzogbnVtYmVyLCBpbkhpZ2g6IG51bWJlciwgb3V0TG93OiBudW1iZXIsIG91dEhpZ2g6IG51bWJlcikge1xuICAgIHJldHVybiAoeCAtIGluTG93KSAqIChvdXRIaWdoIC0gb3V0TG93KSAvIChpbkhpZ2ggLSBpbkxvdykgKyBvdXRMb3c7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjbGFtcCh4OiBudW1iZXIsIG1pbjogbnVtYmVyLCBtYXg6IG51bWJlcikge1xuICAgIHJldHVybiBNYXRoLm1pbihtYXgsIE1hdGgubWF4KG1pbiwgeCkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbXVsdGlwbHlNYXRyaWNlcyhtMTogbnVtYmVyW11bXSwgbTI6IG51bWJlcltdW10pIHtcbiAgICBjb25zdCByZXN1bHQ6IG51bWJlcltdW10gPSBbXTtcbiAgICBmb3IgKGxldCBpID0gMCwgbGVuID0gbTEubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgcmVzdWx0W2ldID0gW107XG4gICAgICAgIGZvciAobGV0IGogPSAwLCBsZW4yID0gbTJbMF0ubGVuZ3RoOyBqIDwgbGVuMjsgaisrKSB7XG4gICAgICAgICAgICBsZXQgc3VtID0gMDtcbiAgICAgICAgICAgIGZvciAobGV0IGsgPSAwLCBsZW4zID0gbTFbMF0ubGVuZ3RoOyBrIDwgbGVuMzsgaysrKSB7XG4gICAgICAgICAgICAgICAgc3VtICs9IG0xW2ldW2tdICogbTJba11bal07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXN1bHRbaV1bal0gPSBzdW07XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbn1cbiIsImltcG9ydCB7bX0gZnJvbSAnbWFsZXZpYyc7XG5pbXBvcnQge2dldENvbnRleHR9IGZyb20gJ21hbGV2aWMvZG9tJztcbmltcG9ydCB7cmdiVG9IU0wsIHBhcnNlLCBoc2xUb1N0cmluZywgcmdiVG9IZXhTdHJpbmcsIFJHQkF9IGZyb20gJy4uLy4uLy4uL3V0aWxzL2NvbG9yJztcbmltcG9ydCB7Y2xhbXAsIHNjYWxlfSBmcm9tICcuLi8uLi8uLi91dGlscy9tYXRoJztcbmltcG9ydCB7Y3JlYXRlU3dpcGVIYW5kbGVyfSBmcm9tICcuLi8uLi91dGlscyc7XG5cbmludGVyZmFjZSBIU0Ige1xuICAgIGg6IG51bWJlcjtcbiAgICBzOiBudW1iZXI7XG4gICAgYjogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgSFNCUGlja2VyUHJvcHMge1xuICAgIGNvbG9yOiBzdHJpbmc7XG4gICAgb25DaGFuZ2U6IChjb2xvcjogc3RyaW5nKSA9PiB2b2lkO1xuICAgIG9uQ29sb3JQcmV2aWV3OiAoY29sb3I6IHN0cmluZykgPT4gdm9pZDtcbn1cblxuaW50ZXJmYWNlIEhTQlBpY2tlclN0YXRlIHtcbiAgICBhY3RpdmVIU0I6IEhTQjtcbiAgICBhY3RpdmVDaGFuZ2VIYW5kbGVyOiAoY29sb3I6IHN0cmluZykgPT4gdm9pZDtcbiAgICBodWVUb3VjaFN0YXJ0SGFuZGxlcjogKGU6IFRvdWNoRXZlbnQpID0+IHZvaWQ7XG4gICAgc2JUb3VjaFN0YXJ0SGFuZGxlcjogKGU6IFRvdWNoRXZlbnQpID0+IHZvaWQ7XG59XG5cbmZ1bmN0aW9uIHJnYlRvSFNCKHtyLCBnLCBifTogUkdCQSkge1xuICAgIGNvbnN0IG1pbiA9IE1hdGgubWluKHIsIGcsIGIpO1xuICAgIGNvbnN0IG1heCA9IE1hdGgubWF4KHIsIGcsIGIpO1xuICAgIHJldHVybiB7XG4gICAgICAgIGg6IHJnYlRvSFNMKHtyLCBnLCBifSkuaCxcbiAgICAgICAgczogbWF4ID09PSAwID8gMCA6ICgxIC0gKG1pbiAvIG1heCkpLFxuICAgICAgICBiOiBtYXggLyAyNTUsXG4gICAgfTtcbn1cblxuZnVuY3Rpb24gaHNiVG9SR0Ioe2g6IGh1ZSwgczogc2F0LCBiOiBicn06IEhTQik6IFJHQkEge1xuICAgIGxldCBjOiBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl07XG4gICAgaWYgKGh1ZSA8IDYwKSB7XG4gICAgICAgIGMgPSBbMSwgaHVlIC8gNjAsIDBdO1xuICAgIH0gZWxzZSBpZiAoaHVlIDwgMTIwKSB7XG4gICAgICAgIGMgPSBbKDEyMCAtIGh1ZSkgLyA2MCwgMSwgMF07XG4gICAgfSBlbHNlIGlmIChodWUgPCAxODApIHtcbiAgICAgICAgYyA9IFswLCAxLCAoaHVlIC0gMTIwKSAvIDYwXTtcbiAgICB9IGVsc2UgaWYgKGh1ZSA8IDI0MCkge1xuICAgICAgICBjID0gWzAsICgyNDAgLSBodWUpIC8gNjAsIDFdO1xuICAgIH0gZWxzZSBpZiAoaHVlIDwgMzAwKSB7XG4gICAgICAgIGMgPSBbKGh1ZSAtIDI0MCkgLyA2MCwgMCwgMV07XG4gICAgfSBlbHNlIHtcbiAgICAgICAgYyA9IFsxLCAwLCAoMzYwIC0gaHVlKSAvIDYwXTtcbiAgICB9XG5cbiAgICBjb25zdCBtYXggPSBNYXRoLm1heCguLi5jKTtcbiAgICBjb25zdCBbciwgZywgYl0gPSBjXG4gICAgICAgIC5tYXAoKHYpID0+IHYgKyAobWF4IC0gdikgKiAoMSAtIHNhdCkpXG4gICAgICAgIC5tYXAoKHYpID0+IHYgKiBicilcbiAgICAgICAgLm1hcCgodikgPT4gTWF0aC5yb3VuZCh2ICogMjU1KSk7XG5cbiAgICByZXR1cm4ge3IsIGcsIGIsIGE6IDF9O1xufVxuXG5mdW5jdGlvbiBoc2JUb1N0cmluZyhoc2I6IEhTQikge1xuICAgIGNvbnN0IHJnYiA9IGhzYlRvUkdCKGhzYik7XG4gICAgcmV0dXJuIHJnYlRvSGV4U3RyaW5nKHJnYik7XG59XG5cbmZ1bmN0aW9uIHJlbmRlcihjYW52YXM6IEhUTUxDYW52YXNFbGVtZW50LCBnZXRQaXhlbDogKHgsIHkpID0+IFVpbnQ4Q2xhbXBlZEFycmF5KSB7XG4gICAgY29uc3Qge3dpZHRoLCBoZWlnaHR9ID0gY2FudmFzO1xuICAgIGNvbnN0IGNvbnRleHQgPSBjYW52YXMuZ2V0Q29udGV4dCgnMmQnKTtcbiAgICBjb25zdCBpbWFnZURhdGEgPSBjb250ZXh0LmdldEltYWdlRGF0YSgwLCAwLCB3aWR0aCwgaGVpZ2h0KTtcbiAgICBjb25zdCBkID0gaW1hZ2VEYXRhLmRhdGE7XG4gICAgZm9yIChsZXQgeSA9IDA7IHkgPCBoZWlnaHQ7IHkrKykge1xuICAgICAgICBmb3IgKGxldCB4ID0gMDsgeCA8IHdpZHRoOyB4KyspIHtcbiAgICAgICAgICAgIGNvbnN0IGkgPSA0ICogKHkgKiB3aWR0aCArIHgpO1xuICAgICAgICAgICAgY29uc3QgYyA9IGdldFBpeGVsKHgsIHkpO1xuICAgICAgICAgICAgZm9yIChsZXQgaiA9IDA7IGogPCA0OyBqKyspIHtcbiAgICAgICAgICAgICAgICBkW2kgKyBqXSA9IGNbal07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgY29udGV4dC5wdXRJbWFnZURhdGEoaW1hZ2VEYXRhLCAwLCAwKTtcbn1cblxuZnVuY3Rpb24gcmVuZGVySHVlKGNhbnZhczogSFRNTENhbnZhc0VsZW1lbnQpIHtcbiAgICBjb25zdCB7aGVpZ2h0fSA9IGNhbnZhcztcbiAgICByZW5kZXIoY2FudmFzLCAoXywgeSkgPT4ge1xuICAgICAgICBjb25zdCBodWUgPSBzY2FsZSh5LCAwLCBoZWlnaHQsIDAsIDM2MCk7XG4gICAgICAgIGNvbnN0IHtyLCBnLCBifSA9IGhzYlRvUkdCKHtoOiBodWUsIHM6IDEsIGI6IDF9KTtcbiAgICAgICAgcmV0dXJuIG5ldyBVaW50OENsYW1wZWRBcnJheShbciwgZywgYiwgMjU1XSk7XG4gICAgfSk7XG59XG5cbmZ1bmN0aW9uIHJlbmRlclNCKGh1ZTogbnVtYmVyLCBjYW52YXM6IEhUTUxDYW52YXNFbGVtZW50KSB7XG4gICAgY29uc3Qge3dpZHRoLCBoZWlnaHR9ID0gY2FudmFzO1xuICAgIHJlbmRlcihjYW52YXMsICh4LCB5KSA9PiB7XG4gICAgICAgIGNvbnN0IHNhdCA9IHNjYWxlKHgsIDAsIHdpZHRoIC0gMSwgMCwgMSk7XG4gICAgICAgIGNvbnN0IGJyID0gc2NhbGUoeSwgMCwgaGVpZ2h0IC0gMSwgMSwgMCk7XG4gICAgICAgIGNvbnN0IHtyLCBnLCBifSA9IGhzYlRvUkdCKHtoOiBodWUsIHM6IHNhdCwgYjogYnJ9KTtcbiAgICAgICAgcmV0dXJuIG5ldyBVaW50OENsYW1wZWRBcnJheShbciwgZywgYiwgMjU1XSk7XG4gICAgfSk7XG59XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIEhTQlBpY2tlcihwcm9wczogSFNCUGlja2VyUHJvcHMpIHtcbiAgICBjb25zdCBjb250ZXh0ID0gZ2V0Q29udGV4dCgpO1xuICAgIGNvbnN0IHN0b3JlID0gY29udGV4dC5zdG9yZSBhcyBIU0JQaWNrZXJTdGF0ZTtcbiAgICBzdG9yZS5hY3RpdmVDaGFuZ2VIYW5kbGVyID0gcHJvcHMub25DaGFuZ2U7XG5cbiAgICBjb25zdCBwcmV2Q29sb3IgPSBjb250ZXh0LnByZXYgJiYgY29udGV4dC5wcmV2LnByb3BzLmNvbG9yO1xuICAgIGNvbnN0IHByZXZBY3RpdmVDb2xvciA9IHN0b3JlLmFjdGl2ZUhTQiA/IGhzYlRvU3RyaW5nKHN0b3JlLmFjdGl2ZUhTQikgOiBudWxsO1xuICAgIGNvbnN0IGRpZENvbG9yQ2hhbmdlID0gcHJvcHMuY29sb3IgIT09IHByZXZDb2xvciAmJiBwcm9wcy5jb2xvciAhPT0gcHJldkFjdGl2ZUNvbG9yO1xuICAgIGxldCBhY3RpdmVIU0I6IEhTQjtcbiAgICBpZiAoZGlkQ29sb3JDaGFuZ2UpIHtcbiAgICAgICAgY29uc3QgcmdiID0gcGFyc2UocHJvcHMuY29sb3IpO1xuICAgICAgICBhY3RpdmVIU0IgPSByZ2JUb0hTQihyZ2IpO1xuICAgICAgICBzdG9yZS5hY3RpdmVIU0IgPSBhY3RpdmVIU0I7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgYWN0aXZlSFNCID0gc3RvcmUuYWN0aXZlSFNCO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIG9uU0JDYW52YXNSZW5kZXIoY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudCkge1xuICAgICAgICBjb25zdCBodWUgPSBhY3RpdmVIU0IuaDtcbiAgICAgICAgY29uc3QgcHJldkh1ZSA9IHByZXZDb2xvciAmJiByZ2JUb0hTQihwYXJzZShwcmV2Q29sb3IpKS5oO1xuICAgICAgICBpZiAoaHVlID09PSBwcmV2SHVlKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgcmVuZGVyU0IoaHVlLCBjYW52YXMpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIG9uSHVlQ2FudmFzQ3JlYXRlKGNhbnZhczogSFRNTENhbnZhc0VsZW1lbnQpIHtcbiAgICAgICAgcmVuZGVySHVlKGNhbnZhcyk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gY3JlYXRlSFNCU3dpcGVIYW5kbGVyKGdldEV2ZW50SFNCOiAoZToge2NsaWVudFg6IG51bWJlcjsgY2xpZW50WTogbnVtYmVyOyByZWN0OiBDbGllbnRSZWN0fSkgPT4gSFNCKSB7XG4gICAgICAgIHJldHVybiBjcmVhdGVTd2lwZUhhbmRsZXIoKHN0YXJ0RXZ0LCBzdGFydE5hdGl2ZUV2dCkgPT4ge1xuICAgICAgICAgICAgdHlwZSBTd2lwZUV2ZW50ID0gdHlwZW9mIHN0YXJ0RXZ0O1xuXG4gICAgICAgICAgICBjb25zdCByZWN0ID0gKHN0YXJ0TmF0aXZlRXZ0LmN1cnJlbnRUYXJnZXQgYXMgSFRNTEVsZW1lbnQpLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXG4gICAgICAgICAgICBmdW5jdGlvbiBvblBvaW50ZXJNb3ZlKGU6IFN3aXBlRXZlbnQpIHtcbiAgICAgICAgICAgICAgICBzdG9yZS5hY3RpdmVIU0IgPSBnZXRFdmVudEhTQih7Li4uZSwgcmVjdH0pO1xuICAgICAgICAgICAgICAgIHByb3BzLm9uQ29sb3JQcmV2aWV3KGhzYlRvU3RyaW5nKHN0b3JlLmFjdGl2ZUhTQikpO1xuICAgICAgICAgICAgICAgIGNvbnRleHQucmVmcmVzaCgpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmdW5jdGlvbiBvblBvaW50ZXJVcChlOiBTd2lwZUV2ZW50KSB7XG4gICAgICAgICAgICAgICAgY29uc3QgaHNiID0gZ2V0RXZlbnRIU0Ioey4uLmUsIHJlY3R9KTtcbiAgICAgICAgICAgICAgICBzdG9yZS5hY3RpdmVIU0IgPSBoc2I7XG4gICAgICAgICAgICAgICAgcHJvcHMub25DaGFuZ2UoaHNiVG9TdHJpbmcoaHNiKSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHN0b3JlLmFjdGl2ZUhTQiA9IGdldEV2ZW50SFNCKHsuLi5zdGFydEV2dCwgcmVjdH0pO1xuICAgICAgICAgICAgY29udGV4dC5yZWZyZXNoKCk7XG5cbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgbW92ZTogb25Qb2ludGVyTW92ZSxcbiAgICAgICAgICAgICAgICB1cDogb25Qb2ludGVyVXAsXG4gICAgICAgICAgICB9O1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBjb25zdCBvblNCUG9pbnRlckRvd24gPSBjcmVhdGVIU0JTd2lwZUhhbmRsZXIoKHtjbGllbnRYLCBjbGllbnRZLCByZWN0fSkgPT4ge1xuICAgICAgICBjb25zdCBzYXQgPSBjbGFtcCgoY2xpZW50WCAtIHJlY3QubGVmdCkgLyByZWN0LndpZHRoLCAwLCAxKTtcbiAgICAgICAgY29uc3QgYnIgPSBjbGFtcCgxIC0gKGNsaWVudFkgLSByZWN0LnRvcCkgLyByZWN0LmhlaWdodCwgMCwgMSk7XG4gICAgICAgIHJldHVybiB7Li4uYWN0aXZlSFNCLCBzOiBzYXQsIGI6IGJyfTtcbiAgICB9KTtcblxuICAgIGNvbnN0IG9uSHVlUG9pbnRlckRvd24gPSBjcmVhdGVIU0JTd2lwZUhhbmRsZXIoKHtjbGllbnRZLCByZWN0fSkgPT4ge1xuICAgICAgICBjb25zdCBodWUgPSBjbGFtcCgoY2xpZW50WSAtIHJlY3QudG9wKSAvIHJlY3QuaGVpZ2h0LCAwLCAxKSAqIDM2MDtcbiAgICAgICAgcmV0dXJuIHsuLi5hY3RpdmVIU0IsIGg6IGh1ZX07XG4gICAgfSk7XG5cbiAgICBjb25zdCBodWVDdXJzb3JTdHlsZSA9IHtcbiAgICAgICAgJ2JhY2tncm91bmQtY29sb3InOiBoc2xUb1N0cmluZyh7aDogYWN0aXZlSFNCLmgsIHM6IDEsIGw6IDAuNSwgYTogMX0pLFxuICAgICAgICAnbGVmdCc6ICcwJScsXG4gICAgICAgICd0b3AnOiBgJHthY3RpdmVIU0IuaCAvIDM2MCAqIDEwMH0lYCxcbiAgICB9O1xuICAgIGNvbnN0IHNiQ3Vyc29yU3R5bGUgPSB7XG4gICAgICAgICdiYWNrZ3JvdW5kLWNvbG9yJzogcmdiVG9IZXhTdHJpbmcoaHNiVG9SR0IoYWN0aXZlSFNCKSksXG4gICAgICAgICdsZWZ0JzogYCR7YWN0aXZlSFNCLnMgKiAxMDB9JWAsXG4gICAgICAgICd0b3AnOiBgJHsoMSAtIGFjdGl2ZUhTQi5iKSAqIDEwMH0lYCxcbiAgICB9O1xuXG4gICAgcmV0dXJuIChcbiAgICAgICAgPHNwYW4gY2xhc3M9XCJoc2ItcGlja2VyXCI+XG4gICAgICAgICAgICA8c3BhblxuICAgICAgICAgICAgICAgIGNsYXNzPVwiaHNiLXBpY2tlcl9fc2ItY29udGFpbmVyXCJcbiAgICAgICAgICAgICAgICBvbm1vdXNlZG93bj17b25TQlBvaW50ZXJEb3dufVxuICAgICAgICAgICAgICAgIG9udXBkYXRlPXsoZWw6IEhUTUxFbGVtZW50KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChzdG9yZS5zYlRvdWNoU3RhcnRIYW5kbGVyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBlbC5yZW1vdmVFdmVudExpc3RlbmVyKCd0b3VjaHN0YXJ0Jywgc3RvcmUuc2JUb3VjaFN0YXJ0SGFuZGxlcik7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWwuYWRkRXZlbnRMaXN0ZW5lcigndG91Y2hzdGFydCcsIG9uU0JQb2ludGVyRG93biwge3Bhc3NpdmU6IHRydWV9KTtcbiAgICAgICAgICAgICAgICAgICAgc3RvcmUuc2JUb3VjaFN0YXJ0SGFuZGxlciA9IG9uU0JQb2ludGVyRG93bjtcbiAgICAgICAgICAgICAgICB9fVxuICAgICAgICAgICAgPlxuICAgICAgICAgICAgICAgIDxjYW52YXMgY2xhc3M9XCJoc2ItcGlja2VyX19zYi1jYW52YXNcIiBvbnJlbmRlcj17b25TQkNhbnZhc1JlbmRlcn0gLz5cbiAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz1cImhzYi1waWNrZXJfX3NiLWN1cnNvclwiIHN0eWxlPXtzYkN1cnNvclN0eWxlfT48L3NwYW4+XG4gICAgICAgICAgICA8L3NwYW4+XG4gICAgICAgICAgICA8c3BhblxuICAgICAgICAgICAgICAgIGNsYXNzPVwiaHNiLXBpY2tlcl9faHVlLWNvbnRhaW5lclwiXG4gICAgICAgICAgICAgICAgb25tb3VzZWRvd249e29uSHVlUG9pbnRlckRvd259XG4gICAgICAgICAgICAgICAgb251cGRhdGU9eyhlbDogSFRNTEVsZW1lbnQpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHN0b3JlLmh1ZVRvdWNoU3RhcnRIYW5kbGVyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBlbC5yZW1vdmVFdmVudExpc3RlbmVyKCd0b3VjaHN0YXJ0Jywgc3RvcmUuaHVlVG91Y2hTdGFydEhhbmRsZXIpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGVsLmFkZEV2ZW50TGlzdGVuZXIoJ3RvdWNoc3RhcnQnLCBvbkh1ZVBvaW50ZXJEb3duLCB7cGFzc2l2ZTogdHJ1ZX0pO1xuICAgICAgICAgICAgICAgICAgICBzdG9yZS5odWVUb3VjaFN0YXJ0SGFuZGxlciA9IG9uSHVlUG9pbnRlckRvd247XG4gICAgICAgICAgICAgICAgfX1cbiAgICAgICAgICAgID5cbiAgICAgICAgICAgICAgICA8Y2FudmFzIGNsYXNzPVwiaHNiLXBpY2tlcl9faHVlLWNhbnZhc1wiIG9uY3JlYXRlPXtvbkh1ZUNhbnZhc0NyZWF0ZX0gLz5cbiAgICAgICAgICAgICAgICA8c3BhbiBjbGFzcz1cImhzYi1waWNrZXJfX2h1ZS1jdXJzb3JcIiBzdHlsZT17aHVlQ3Vyc29yU3R5bGV9Pjwvc3Bhbj5cbiAgICAgICAgICAgIDwvc3Bhbj5cbiAgICAgICAgPC9zcGFuPlxuICAgICk7XG59XG4iLCJpbXBvcnQge219IGZyb20gJ21hbGV2aWMnO1xuaW1wb3J0IHtnZXRDb250ZXh0fSBmcm9tICdtYWxldmljL2RvbSc7XG5pbXBvcnQge3BhcnNlfSBmcm9tICcuLi8uLi8uLi91dGlscy9jb2xvcic7XG5pbXBvcnQgVGV4dEJveCBmcm9tICcuLi90ZXh0Ym94JztcbmltcG9ydCBIU0JQaWNrZXIgZnJvbSAnLi9oc2ItcGlja2VyJztcblxuaW50ZXJmYWNlIENvbG9yUGlja2VyUHJvcHMge1xuICAgIGNsYXNzPzogYW55O1xuICAgIGNvbG9yOiBzdHJpbmc7XG4gICAgb25DaGFuZ2U6IChjb2xvcjogc3RyaW5nKSA9PiB2b2lkO1xuICAgIGNhblJlc2V0OiBib29sZWFuO1xuICAgIG9uUmVzZXQ6ICgpID0+IHZvaWQ7XG59XG5cbmZ1bmN0aW9uIGlzVmFsaWRDb2xvcihjb2xvcjogc3RyaW5nKSB7XG4gICAgdHJ5IHtcbiAgICAgICAgcGFyc2UoY29sb3IpO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbn1cblxuY29uc3QgY29sb3JQaWNrZXJGb2N1c2VzID0gbmV3IFdlYWtNYXA8Tm9kZSwgKCkgPT4gdm9pZD4oKTtcblxuZnVuY3Rpb24gZm9jdXNDb2xvclBpY2tlcihub2RlOiBOb2RlKSB7XG4gICAgY29uc3QgZm9jdXMgPSBjb2xvclBpY2tlckZvY3VzZXMuZ2V0KG5vZGUpO1xuICAgIGZvY3VzKCk7XG59XG5cbmZ1bmN0aW9uIENvbG9yUGlja2VyKHByb3BzOiBDb2xvclBpY2tlclByb3BzKSB7XG4gICAgY29uc3QgY29udGV4dCA9IGdldENvbnRleHQoKTtcbiAgICBjb250ZXh0Lm9uUmVuZGVyKChub2RlKSA9PiBjb2xvclBpY2tlckZvY3VzZXMuc2V0KG5vZGUsIGZvY3VzKSk7XG4gICAgY29uc3Qgc3RvcmUgPSBjb250ZXh0LnN0b3JlIGFzIHtpc0ZvY3VzZWQ6IGJvb2xlYW47IHRleHRCb3hOb2RlOiBIVE1MSW5wdXRFbGVtZW50OyBwcmV2aWV3Tm9kZTogSFRNTEVsZW1lbnR9O1xuXG4gICAgY29uc3QgaXNDb2xvclZhbGlkID0gaXNWYWxpZENvbG9yKHByb3BzLmNvbG9yKTtcblxuICAgIGZ1bmN0aW9uIG9uQ29sb3JQcmV2aWV3KHByZXZpZXdDb2xvcjogc3RyaW5nKSB7XG4gICAgICAgIHN0b3JlLnByZXZpZXdOb2RlLnN0eWxlLmJhY2tncm91bmRDb2xvciA9IHByZXZpZXdDb2xvcjtcbiAgICAgICAgc3RvcmUudGV4dEJveE5vZGUudmFsdWUgPSBwcmV2aWV3Q29sb3I7XG4gICAgICAgIHN0b3JlLnRleHRCb3hOb2RlLmJsdXIoKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBvbkNvbG9yQ2hhbmdlKHJhd1ZhbHVlOiBzdHJpbmcpIHtcbiAgICAgICAgY29uc3QgdmFsdWUgPSByYXdWYWx1ZS50cmltKCk7XG4gICAgICAgIGlmIChpc1ZhbGlkQ29sb3IodmFsdWUpKSB7XG4gICAgICAgICAgICBwcm9wcy5vbkNoYW5nZSh2YWx1ZSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwcm9wcy5vbkNoYW5nZShwcm9wcy5jb2xvcik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBmb2N1cygpIHtcbiAgICAgICAgaWYgKHN0b3JlLmlzRm9jdXNlZCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHN0b3JlLmlzRm9jdXNlZCA9IHRydWU7XG4gICAgICAgIGNvbnRleHQucmVmcmVzaCgpO1xuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vkb3duJywgb25PdXRlckNsaWNrKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBibHVyKCkge1xuICAgICAgICBpZiAoIXN0b3JlLmlzRm9jdXNlZCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdtb3VzZWRvd24nLCBvbk91dGVyQ2xpY2spO1xuICAgICAgICBzdG9yZS5pc0ZvY3VzZWQgPSBmYWxzZTtcbiAgICAgICAgY29udGV4dC5yZWZyZXNoKCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gdG9nZ2xlRm9jdXMoKSB7XG4gICAgICAgIGlmIChzdG9yZS5pc0ZvY3VzZWQpIHtcbiAgICAgICAgICAgIGJsdXIoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGZvY3VzKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBvbk91dGVyQ2xpY2soZTogTW91c2VFdmVudCkge1xuICAgICAgICBpZiAoIWUuY29tcG9zZWRQYXRoKCkuc29tZSgoZWwpID0+IGVsID09PSBjb250ZXh0Lm5vZGUpKSB7XG4gICAgICAgICAgICBibHVyKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCB0ZXh0Qm94ID0gKFxuICAgICAgICA8VGV4dEJveFxuICAgICAgICAgICAgY2xhc3M9XCJjb2xvci1waWNrZXJfX2lucHV0XCJcbiAgICAgICAgICAgIG9ucmVuZGVyPXsoZWwpID0+IHtcbiAgICAgICAgICAgICAgICBzdG9yZS50ZXh0Qm94Tm9kZSA9IGVsIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG4gICAgICAgICAgICAgICAgc3RvcmUudGV4dEJveE5vZGUudmFsdWUgPSBpc0NvbG9yVmFsaWQgPyBwcm9wcy5jb2xvciA6ICcnO1xuICAgICAgICAgICAgfX1cbiAgICAgICAgICAgIG9ua2V5cHJlc3M9eyhlKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgaW5wdXQgPSBlLnRhcmdldCBhcyBIVE1MSW5wdXRFbGVtZW50O1xuICAgICAgICAgICAgICAgIGlmIChlLmtleSA9PT0gJ0VudGVyJykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB7dmFsdWV9ID0gaW5wdXQ7XG4gICAgICAgICAgICAgICAgICAgIG9uQ29sb3JDaGFuZ2UodmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICBibHVyKCk7XG4gICAgICAgICAgICAgICAgICAgIG9uQ29sb3JQcmV2aWV3KHZhbHVlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9fVxuICAgICAgICAgICAgb25mb2N1cz17Zm9jdXN9XG4gICAgICAgIC8+XG4gICAgKTtcblxuICAgIGNvbnN0IHByZXZpZXdFbGVtZW50ID0gKFxuICAgICAgICA8c3BhblxuICAgICAgICAgICAgY2xhc3M9XCJjb2xvci1waWNrZXJfX3ByZXZpZXdcIlxuICAgICAgICAgICAgb25jbGljaz17dG9nZ2xlRm9jdXN9XG4gICAgICAgICAgICBvbnJlbmRlcj17KGVsOiBIVE1MRWxlbWVudCkgPT4ge1xuICAgICAgICAgICAgICAgIHN0b3JlLnByZXZpZXdOb2RlID0gZWw7XG4gICAgICAgICAgICAgICAgZWwuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gaXNDb2xvclZhbGlkID8gcHJvcHMuY29sb3IgOiAndHJhbnNwYXJlbnQnO1xuICAgICAgICAgICAgfX1cbiAgICAgICAgPjwvc3Bhbj5cbiAgICApO1xuXG4gICAgY29uc3QgcmVzZXRCdXR0b24gPSBwcm9wcy5jYW5SZXNldCA/IChcbiAgICAgICAgPHNwYW5cbiAgICAgICAgICAgIHJvbGU9XCJidXR0b25cIlxuICAgICAgICAgICAgY2xhc3M9XCJjb2xvci1waWNrZXJfX3Jlc2V0XCJcbiAgICAgICAgICAgIG9uY2xpY2s9eygpID0+IHtcbiAgICAgICAgICAgICAgICBwcm9wcy5vblJlc2V0KCk7XG4gICAgICAgICAgICAgICAgYmx1cigpO1xuICAgICAgICAgICAgfX1cbiAgICAgICAgPjwvc3Bhbj5cbiAgICApIDogbnVsbDtcblxuICAgIGNvbnN0IHRleHRCb3hMaW5lID0gKFxuICAgICAgICA8c3BhbiBjbGFzcz1cImNvbG9yLXBpY2tlcl9fdGV4dGJveC1saW5lXCI+XG4gICAgICAgICAgICB7dGV4dEJveH1cbiAgICAgICAgICAgIHtwcmV2aWV3RWxlbWVudH1cbiAgICAgICAgICAgIHtyZXNldEJ1dHRvbn1cbiAgICAgICAgPC9zcGFuPlxuICAgICk7XG5cbiAgICBjb25zdCBoc2JMaW5lID0gaXNDb2xvclZhbGlkID8gKFxuICAgICAgICA8c3BhbiBjbGFzcz1cImNvbG9yLXBpY2tlcl9faHNiLWxpbmVcIj5cbiAgICAgICAgICAgIDxIU0JQaWNrZXJcbiAgICAgICAgICAgICAgICBjb2xvcj17cHJvcHMuY29sb3J9XG4gICAgICAgICAgICAgICAgb25DaGFuZ2U9e29uQ29sb3JDaGFuZ2V9XG4gICAgICAgICAgICAgICAgb25Db2xvclByZXZpZXc9e29uQ29sb3JQcmV2aWV3fVxuICAgICAgICAgICAgLz5cbiAgICAgICAgPC9zcGFuPlxuICAgICkgOiBudWxsO1xuXG4gICAgcmV0dXJuIChcbiAgICAgICAgPHNwYW4gY2xhc3M9e1snY29sb3ItcGlja2VyJywgc3RvcmUuaXNGb2N1c2VkICYmICdjb2xvci1waWNrZXItLWZvY3VzZWQnLCBwcm9wcy5jbGFzc119PlxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJjb2xvci1waWNrZXJfX3dyYXBwZXJcIj5cbiAgICAgICAgICAgICAgICB7dGV4dEJveExpbmV9XG4gICAgICAgICAgICAgICAge2hzYkxpbmV9XG4gICAgICAgICAgICA8L3NwYW4+XG4gICAgICAgIDwvc3Bhbj5cbiAgICApO1xufVxuXG5leHBvcnQgZGVmYXVsdCBPYmplY3QuYXNzaWduKENvbG9yUGlja2VyLCB7Zm9jdXM6IGZvY3VzQ29sb3JQaWNrZXJ9KTtcbiIsImltcG9ydCB7Z2V0Q29udGV4dCwgcmVuZGVyfSBmcm9tICdtYWxldmljL2RvbSc7XG5pbXBvcnQge2lzU3RyaW5naWZ5aW5nfSBmcm9tICdtYWxldmljL3N0cmluZyc7XG5cbmNvbnN0IERFRkFVTFRfT1ZFUkxBWV9LRVkgPSBTeW1ib2woKTtcbmNvbnN0IG92ZXJsYXlOb2RlcyA9IG5ldyBNYXA8YW55LCBIVE1MRWxlbWVudD4oKTtcbmNvbnN0IGNsaWNrTGlzdGVuZXJzID0gbmV3IFdlYWtNYXA8SFRNTEVsZW1lbnQsICgpID0+IHZvaWQ+KCk7XG5cbmZ1bmN0aW9uIGdldE92ZXJsYXlET01Ob2RlKGtleTogYW55KSB7XG4gICAgaWYgKGtleSA9PSBudWxsKSB7XG4gICAgICAgIGtleSA9IERFRkFVTFRfT1ZFUkxBWV9LRVk7XG4gICAgfVxuXG4gICAgaWYgKCFvdmVybGF5Tm9kZXMuaGFzKGtleSkpIHtcbiAgICAgICAgY29uc3Qgbm9kZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICBub2RlLmNsYXNzTGlzdC5hZGQoJ292ZXJsYXknKTtcbiAgICAgICAgbm9kZS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7XG4gICAgICAgICAgICBpZiAoY2xpY2tMaXN0ZW5lcnMuaGFzKG5vZGUpICYmIGUuY3VycmVudFRhcmdldCA9PT0gbm9kZSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGxpc3RlbmVyID0gY2xpY2tMaXN0ZW5lcnMuZ2V0KG5vZGUpO1xuICAgICAgICAgICAgICAgIGxpc3RlbmVyKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBvdmVybGF5Tm9kZXMuc2V0KGtleSwgbm9kZSk7XG4gICAgfVxuICAgIHJldHVybiBvdmVybGF5Tm9kZXMuZ2V0KGtleSk7XG59XG5cbmludGVyZmFjZSBPdmVybGF5UHJvcHMge1xuICAgIGtleT86IGFueTtcbn1cblxuZnVuY3Rpb24gT3ZlcmxheShwcm9wczogT3ZlcmxheVByb3BzKSB7XG4gICAgaWYgKGlzU3RyaW5naWZ5aW5nKCkpIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIHJldHVybiBnZXRPdmVybGF5RE9NTm9kZShwcm9wcy5rZXkpO1xufVxuXG5pbnRlcmZhY2UgT3ZlcmxheVBvcnRhbFByb3BzIHtcbiAgICBrZXk/OiBhbnk7XG4gICAgb25PdXRlckNsaWNrPzogKCkgPT4gdm9pZDtcbn1cblxuZnVuY3Rpb24gUG9ydGFsKHByb3BzOiBPdmVybGF5UG9ydGFsUHJvcHMsIC4uLmNvbnRlbnQ6IE1hbGV2aWMuQ2hpbGRbXSkge1xuICAgIGNvbnN0IGNvbnRleHQgPSBnZXRDb250ZXh0KCk7XG5cbiAgICBjb250ZXh0Lm9uUmVuZGVyKCgpID0+IHtcbiAgICAgICAgY29uc3Qgbm9kZSA9IGdldE92ZXJsYXlET01Ob2RlKHByb3BzLmtleSk7XG4gICAgICAgIGlmIChwcm9wcy5vbk91dGVyQ2xpY2spIHtcbiAgICAgICAgICAgIGNsaWNrTGlzdGVuZXJzLnNldChub2RlLCBwcm9wcy5vbk91dGVyQ2xpY2spO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY2xpY2tMaXN0ZW5lcnMuZGVsZXRlKG5vZGUpO1xuICAgICAgICB9XG4gICAgICAgIHJlbmRlcihub2RlLCBjb250ZW50KTtcbiAgICB9KTtcblxuICAgIGNvbnRleHQub25SZW1vdmUoKCkgPT4ge1xuICAgICAgICBjb25zdCBjb250YWluZXIgPSBnZXRPdmVybGF5RE9NTm9kZShwcm9wcy5rZXkpO1xuICAgICAgICByZW5kZXIoY29udGFpbmVyLCBudWxsKTtcbiAgICB9KTtcblxuICAgIHJldHVybiBjb250ZXh0LmxlYXZlKCk7XG59XG5cbmV4cG9ydCBkZWZhdWx0IE9iamVjdC5hc3NpZ24oT3ZlcmxheSwge1BvcnRhbH0pO1xuIiwiZXhwb3J0IGZ1bmN0aW9uIGdldExvY2FsTWVzc2FnZShtZXNzYWdlTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIGNocm9tZS5pMThuLmdldE1lc3NhZ2UobWVzc2FnZU5hbWUpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0VUlMYW5ndWFnZSgpIHtcbiAgICBjb25zdCBjb2RlID0gY2hyb21lLmkxOG4uZ2V0VUlMYW5ndWFnZSgpO1xuICAgIGlmIChjb2RlLmVuZHNXaXRoKCctbWFjJykpIHtcbiAgICAgICAgcmV0dXJuIGNvZGUuc3Vic3RyaW5nKDAsIGNvZGUubGVuZ3RoIC0gNCk7XG4gICAgfVxuICAgIHJldHVybiBjb2RlO1xufVxuIiwiaW1wb3J0IHttfSBmcm9tICdtYWxldmljJztcbmltcG9ydCBUZXh0Qm94IGZyb20gJy4uL3RleHRib3gnO1xuaW1wb3J0IHtnZXRVSUxhbmd1YWdlfSBmcm9tICcuLi8uLi8uLi91dGlscy9sb2NhbGVzJztcbmltcG9ydCB7cGFyc2VUaW1lfSBmcm9tICcuLi8uLi8uLi91dGlscy90aW1lJztcblxuaW50ZXJmYWNlIFRpbWVQaWNrZXJQcm9wcyB7XG4gICAgc3RhcnRUaW1lOiBzdHJpbmc7XG4gICAgZW5kVGltZTogc3RyaW5nO1xuICAgIG9uQ2hhbmdlOiAoW3N0YXJ0LCBlbmRdOiBbc3RyaW5nLCBzdHJpbmddKSA9PiB2b2lkO1xufVxuXG5jb25zdCBpczEySCA9IChuZXcgRGF0ZSgpKS50b0xvY2FsZVRpbWVTdHJpbmcoZ2V0VUlMYW5ndWFnZSgpKS5lbmRzV2l0aCgnTScpO1xuXG5mdW5jdGlvbiB0b0xvY2FsZVRpbWUoJHRpbWU6IHN0cmluZykge1xuICAgIGNvbnN0IFtob3VycywgbWludXRlc10gPSBwYXJzZVRpbWUoJHRpbWUpO1xuXG4gICAgY29uc3QgbW0gPSBgJHttaW51dGVzIDwgMTAgPyAnMCcgOiAnJ30ke21pbnV0ZXN9YDtcblxuICAgIGlmIChpczEySCkge1xuICAgICAgICBjb25zdCBoID0gKGhvdXJzID09PSAwID9cbiAgICAgICAgICAgICcxMicgOlxuICAgICAgICAgICAgaG91cnMgPiAxMiA/XG4gICAgICAgICAgICAgICAgKGhvdXJzIC0gMTIpIDpcbiAgICAgICAgICAgICAgICBob3Vycyk7XG4gICAgICAgIHJldHVybiBgJHtofToke21tfSR7aG91cnMgPCAxMiA/ICdBTScgOiAnUE0nfWA7XG4gICAgfVxuXG4gICAgcmV0dXJuIGAke2hvdXJzfToke21tfWA7XG59XG5cbmZ1bmN0aW9uIHRvMjRIVGltZSgkdGltZTogc3RyaW5nKSB7XG4gICAgY29uc3QgW2hvdXJzLCBtaW51dGVzXSA9IHBhcnNlVGltZSgkdGltZSk7XG4gICAgY29uc3QgbW0gPSBgJHttaW51dGVzIDwgMTAgPyAnMCcgOiAnJ30ke21pbnV0ZXN9YDtcbiAgICByZXR1cm4gYCR7aG91cnN9OiR7bW19YDtcbn1cblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gVGltZVJhbmdlUGlja2VyKHByb3BzOiBUaW1lUGlja2VyUHJvcHMpIHtcbiAgICBmdW5jdGlvbiBvblN0YXJ0VGltZUNoYW5nZSgkc3RhcnRUaW1lOiBzdHJpbmcpIHtcbiAgICAgICAgcHJvcHMub25DaGFuZ2UoW3RvMjRIVGltZSgkc3RhcnRUaW1lKSwgcHJvcHMuZW5kVGltZV0pO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIG9uRW5kVGltZUNoYW5nZSgkZW5kVGltZTogc3RyaW5nKSB7XG4gICAgICAgIHByb3BzLm9uQ2hhbmdlKFtwcm9wcy5zdGFydFRpbWUsIHRvMjRIVGltZSgkZW5kVGltZSldKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzZXRTdGFydFRpbWUobm9kZTogSFRNTElucHV0RWxlbWVudCkge1xuICAgICAgICBub2RlLnZhbHVlID0gdG9Mb2NhbGVUaW1lKHByb3BzLnN0YXJ0VGltZSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc2V0RW5kVGltZShub2RlOiBIVE1MSW5wdXRFbGVtZW50KSB7XG4gICAgICAgIG5vZGUudmFsdWUgPSB0b0xvY2FsZVRpbWUocHJvcHMuZW5kVGltZSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIChcbiAgICAgICAgPHNwYW4gY2xhc3M9XCJ0aW1lLXJhbmdlLXBpY2tlclwiPlxuICAgICAgICAgICAgPFRleHRCb3hcbiAgICAgICAgICAgICAgICBjbGFzcz1cInRpbWUtcmFuZ2UtcGlja2VyX19pbnB1dCB0aW1lLXJhbmdlLXBpY2tlcl9faW5wdXQtLXN0YXJ0XCJcbiAgICAgICAgICAgICAgICBwbGFjZWhvbGRlcj17dG9Mb2NhbGVUaW1lKCcxODowMCcpfVxuICAgICAgICAgICAgICAgIG9ucmVuZGVyPXtzZXRTdGFydFRpbWV9XG4gICAgICAgICAgICAgICAgb25jaGFuZ2U9eyhlKSA9PiBvblN0YXJ0VGltZUNoYW5nZSgoZS50YXJnZXQgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWUpfVxuICAgICAgICAgICAgICAgIG9ua2V5cHJlc3M9eyhlKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChlLmtleSA9PT0gJ0VudGVyJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgaW5wdXQgPSBlLnRhcmdldCBhcyBIVE1MSW5wdXRFbGVtZW50O1xuICAgICAgICAgICAgICAgICAgICAgICAgaW5wdXQuYmx1cigpO1xuICAgICAgICAgICAgICAgICAgICAgICAgb25TdGFydFRpbWVDaGFuZ2UoaW5wdXQudmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfX1cblxuICAgICAgICAgICAgLz5cbiAgICAgICAgICAgIDxUZXh0Qm94XG4gICAgICAgICAgICAgICAgY2xhc3M9XCJ0aW1lLXJhbmdlLXBpY2tlcl9faW5wdXQgdGltZS1yYW5nZS1waWNrZXJfX2lucHV0LS1lbmRcIlxuICAgICAgICAgICAgICAgIHBsYWNlaG9sZGVyPXt0b0xvY2FsZVRpbWUoJzk6MDAnKX1cbiAgICAgICAgICAgICAgICBvbnJlbmRlcj17c2V0RW5kVGltZX1cbiAgICAgICAgICAgICAgICBvbmNoYW5nZT17KGUpID0+IG9uRW5kVGltZUNoYW5nZSgoZS50YXJnZXQgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWUpfVxuICAgICAgICAgICAgICAgIG9ua2V5cHJlc3M9eyhlKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChlLmtleSA9PT0gJ0VudGVyJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgaW5wdXQgPSBlLnRhcmdldCBhcyBIVE1MSW5wdXRFbGVtZW50O1xuICAgICAgICAgICAgICAgICAgICAgICAgaW5wdXQuYmx1cigpO1xuICAgICAgICAgICAgICAgICAgICAgICAgb25FbmRUaW1lQ2hhbmdlKGlucHV0LnZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH19XG4gICAgICAgICAgICAvPlxuICAgICAgICA8L3NwYW4+XG4gICAgKTtcbn1cbiIsImV4cG9ydCBmdW5jdGlvbiBpc0lQVjYodXJsOiBzdHJpbmcpIHtcbiAgICBjb25zdCBvcGVuaW5nQnJhY2tldEluZGV4ID0gdXJsLmluZGV4T2YoJ1snKTtcbiAgICBpZiAob3BlbmluZ0JyYWNrZXRJbmRleCA8IDApIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBjb25zdCBxdWVyeUluZGV4ID0gdXJsLmluZGV4T2YoJz8nKTtcbiAgICBpZiAocXVlcnlJbmRleCA+PSAwICYmIG9wZW5pbmdCcmFja2V0SW5kZXggPiBxdWVyeUluZGV4KSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG59XG5cbmNvbnN0IGlwVjZIb3N0UmVnZXggPSAvXFxbLio/XFxdKFxcOlxcZCspPy87XG5cbmV4cG9ydCBmdW5jdGlvbiBjb21wYXJlSVBWNihmaXJzdFVSTDogc3RyaW5nLCBzZWNvbmRVUkw6IHN0cmluZykge1xuICAgIGNvbnN0IGZpcnN0SG9zdCA9IGZpcnN0VVJMLm1hdGNoKGlwVjZIb3N0UmVnZXgpWzBdO1xuICAgIGNvbnN0IHNlY29uZEhvc3QgPSBzZWNvbmRVUkwubWF0Y2goaXBWNkhvc3RSZWdleClbMF07XG4gICAgcmV0dXJuIGZpcnN0SG9zdCA9PT0gc2Vjb25kSG9zdDtcbn1cbiIsImltcG9ydCB7VXNlclNldHRpbmdzfSBmcm9tICcuLi9kZWZpbml0aW9ucyc7XG5pbXBvcnQge2lzSVBWNiwgY29tcGFyZUlQVjZ9IGZyb20gJy4vaXB2Nic7XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRVUkxIb3N0T3JQcm90b2NvbCgkdXJsOiBzdHJpbmcpIHtcbiAgICBjb25zdCB1cmwgPSBuZXcgVVJMKCR1cmwpO1xuICAgIGlmICh1cmwuaG9zdCkge1xuICAgICAgICByZXR1cm4gdXJsLmhvc3Q7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHVybC5wcm90b2NvbDtcbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjb21wYXJlVVJMUGF0dGVybnMoYTogc3RyaW5nLCBiOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gYS5sb2NhbGVDb21wYXJlKGIpO1xufVxuXG4vKipcbiAqIERldGVybWluZXMgd2hldGhlciBVUkwgaGFzIGEgbWF0Y2ggaW4gVVJMIHRlbXBsYXRlIGxpc3QuXG4gKiBAcGFyYW0gdXJsIFNpdGUgVVJMLlxuICogQHBhcmFtbGlzdCBMaXN0IHRvIHNlYXJjaCBpbnRvLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaXNVUkxJbkxpc3QodXJsOiBzdHJpbmcsIGxpc3Q6IHN0cmluZ1tdKSB7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBsaXN0Lmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmIChpc1VSTE1hdGNoZWQodXJsLCBsaXN0W2ldKSkge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xufVxuXG4vKipcbiAqIERldGVybWluZXMgd2hldGhlciBVUkwgbWF0Y2hlcyB0aGUgdGVtcGxhdGUuXG4gKiBAcGFyYW0gdXJsIFVSTC5cbiAqIEBwYXJhbSB1cmxUZW1wbGF0ZSBVUkwgdGVtcGxhdGUgKFwiZ29vZ2xlLipcIiwgXCJ5b3V0dWJlLmNvbVwiIGV0YykuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc1VSTE1hdGNoZWQodXJsOiBzdHJpbmcsIHVybFRlbXBsYXRlOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICBjb25zdCBpc0ZpcnN0SVBWNiA9IGlzSVBWNih1cmwpO1xuICAgIGNvbnN0IGlzU2Vjb25kSVBWNiA9IGlzSVBWNih1cmxUZW1wbGF0ZSk7XG4gICAgaWYgKGlzRmlyc3RJUFY2ICYmIGlzU2Vjb25kSVBWNikge1xuICAgICAgICByZXR1cm4gY29tcGFyZUlQVjYodXJsLCB1cmxUZW1wbGF0ZSk7XG4gICAgfSBlbHNlIGlmICghaXNTZWNvbmRJUFY2ICYmICFpc1NlY29uZElQVjYpIHtcbiAgICAgICAgY29uc3QgcmVnZXggPSBjcmVhdGVVcmxSZWdleCh1cmxUZW1wbGF0ZSk7XG4gICAgICAgIHJldHVybiBCb29sZWFuKHVybC5tYXRjaChyZWdleCkpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVVybFJlZ2V4KHVybFRlbXBsYXRlOiBzdHJpbmcpOiBSZWdFeHAge1xuICAgIHVybFRlbXBsYXRlID0gdXJsVGVtcGxhdGUudHJpbSgpO1xuICAgIGNvbnN0IGV4YWN0QmVnaW5uaW5nID0gKHVybFRlbXBsYXRlWzBdID09PSAnXicpO1xuICAgIGNvbnN0IGV4YWN0RW5kaW5nID0gKHVybFRlbXBsYXRlW3VybFRlbXBsYXRlLmxlbmd0aCAtIDFdID09PSAnJCcpO1xuXG4gICAgdXJsVGVtcGxhdGUgPSAodXJsVGVtcGxhdGVcbiAgICAgICAgLnJlcGxhY2UoL15cXF4vLCAnJykgLy8gUmVtb3ZlIF4gYXQgc3RhcnRcbiAgICAgICAgLnJlcGxhY2UoL1xcJCQvLCAnJykgLy8gUmVtb3ZlICQgYXQgZW5kXG4gICAgICAgIC5yZXBsYWNlKC9eLio/XFwvezIsM30vLCAnJykgLy8gUmVtb3ZlIHNjaGVtZVxuICAgICAgICAucmVwbGFjZSgvXFw/LiokLywgJycpIC8vIFJlbW92ZSBxdWVyeVxuICAgICAgICAucmVwbGFjZSgvXFwvJC8sICcnKSAvLyBSZW1vdmUgbGFzdCBzbGFzaFxuICAgICk7XG5cbiAgICBsZXQgc2xhc2hJbmRleDogbnVtYmVyO1xuICAgIGxldCBiZWZvcmVTbGFzaDogc3RyaW5nO1xuICAgIGxldCBhZnRlclNsYXNoOiBzdHJpbmc7XG4gICAgaWYgKChzbGFzaEluZGV4ID0gdXJsVGVtcGxhdGUuaW5kZXhPZignLycpKSA+PSAwKSB7XG4gICAgICAgIGJlZm9yZVNsYXNoID0gdXJsVGVtcGxhdGUuc3Vic3RyaW5nKDAsIHNsYXNoSW5kZXgpOyAvLyBnb29nbGUuKlxuICAgICAgICBhZnRlclNsYXNoID0gdXJsVGVtcGxhdGUucmVwbGFjZSgnJCcsICcnKS5zdWJzdHJpbmcoc2xhc2hJbmRleCk7IC8vIC9sb2dpbi9hYmNcbiAgICB9IGVsc2Uge1xuICAgICAgICBiZWZvcmVTbGFzaCA9IHVybFRlbXBsYXRlLnJlcGxhY2UoJyQnLCAnJyk7XG4gICAgfVxuXG4gICAgLy9cbiAgICAvLyBTQ0hFTUUgYW5kIFNVQkRPTUFJTlNcblxuICAgIGxldCByZXN1bHQgPSAoZXhhY3RCZWdpbm5pbmcgP1xuICAgICAgICAnXiguKj9cXFxcOlxcXFwvezIsM30pPycgLy8gU2NoZW1lXG4gICAgICAgIDogJ14oLio/XFxcXDpcXFxcL3syLDN9KT8oW15cXC9dKj9cXFxcLik/JyAvLyBTY2hlbWUgYW5kIHN1YmRvbWFpbnNcbiAgICApO1xuXG4gICAgLy9cbiAgICAvLyBIT1NUIGFuZCBQT1JUXG5cbiAgICBjb25zdCBob3N0UGFydHMgPSBiZWZvcmVTbGFzaC5zcGxpdCgnLicpO1xuICAgIHJlc3VsdCArPSAnKCc7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBob3N0UGFydHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKGhvc3RQYXJ0c1tpXSA9PT0gJyonKSB7XG4gICAgICAgICAgICBob3N0UGFydHNbaV0gPSAnW15cXFxcLlxcXFwvXSs/JztcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXN1bHQgKz0gaG9zdFBhcnRzLmpvaW4oJ1xcXFwuJyk7XG4gICAgcmVzdWx0ICs9ICcpJztcblxuICAgIC8vXG4gICAgLy8gUEFUSCBhbmQgUVVFUllcblxuICAgIGlmIChhZnRlclNsYXNoKSB7XG4gICAgICAgIHJlc3VsdCArPSAnKCc7XG4gICAgICAgIHJlc3VsdCArPSBhZnRlclNsYXNoLnJlcGxhY2UoJy8nLCAnXFxcXC8nKTtcbiAgICAgICAgcmVzdWx0ICs9ICcpJztcbiAgICB9XG5cbiAgICByZXN1bHQgKz0gKGV4YWN0RW5kaW5nID9cbiAgICAgICAgJyhcXFxcLz8oXFxcXD9bXlxcL10qPyk/KSQnIC8vIEFsbCBmb2xsb3dpbmcgcXVlcmllc1xuICAgICAgICA6ICcoXFxcXC8/Lio/KSQnIC8vIEFsbCBmb2xsb3dpbmcgcGF0aHMgYW5kIHF1ZXJpZXNcbiAgICApO1xuXG4gICAgLy9cbiAgICAvLyBSZXN1bHRcblxuICAgIHJldHVybiBuZXcgUmVnRXhwKHJlc3VsdCwgJ2knKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzUERGKHVybDogc3RyaW5nKSB7XG4gICAgaWYgKHVybC5pbmNsdWRlcygnLnBkZicpKSB7XG4gICAgICAgIGlmICh1cmwuaW5jbHVkZXMoJz8nKSkge1xuICAgICAgICAgICAgdXJsID0gdXJsLnN1YnN0cmluZygwLCB1cmwubGFzdEluZGV4T2YoJz8nKSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHVybC5pbmNsdWRlcygnIycpKSB7XG4gICAgICAgICAgICB1cmwgPSB1cmwuc3Vic3RyaW5nKDAsIHVybC5sYXN0SW5kZXhPZignIycpKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodXJsLm1hdGNoKC8od2lraXBlZGlhfHdpa2ltZWRpYSkub3JnL2kpICYmIHVybC5tYXRjaCgvKHdpa2lwZWRpYXx3aWtpbWVkaWEpXFwub3JnXFwvLipcXC9bYS16XStcXDpbXlxcOlxcL10rXFwucGRmL2kpKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHVybC5lbmRzV2l0aCgnLnBkZicpKSB7XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gdXJsLmxlbmd0aDsgMCA8IGk7IGktLSkge1xuICAgICAgICAgICAgICAgIGlmICh1cmxbaV0gPT09ICc9Jykge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICh1cmxbaV0gPT09ICcvJykge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNVUkxFbmFibGVkKHVybDogc3RyaW5nLCB1c2VyU2V0dGluZ3M6IFVzZXJTZXR0aW5ncywge2lzUHJvdGVjdGVkLCBpc0luRGFya0xpc3R9KSB7XG4gICAgaWYgKGlzUHJvdGVjdGVkICYmICF1c2VyU2V0dGluZ3MuZW5hYmxlRm9yUHJvdGVjdGVkUGFnZXMpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBpZiAoaXNQREYodXJsKSkge1xuICAgICAgICByZXR1cm4gdXNlclNldHRpbmdzLmVuYWJsZUZvclBERjtcbiAgICB9XG4gICAgY29uc3QgaXNVUkxJblVzZXJMaXN0ID0gaXNVUkxJbkxpc3QodXJsLCB1c2VyU2V0dGluZ3Muc2l0ZUxpc3QpO1xuICAgIGlmICh1c2VyU2V0dGluZ3MuYXBwbHlUb0xpc3RlZE9ubHkpIHtcbiAgICAgICAgcmV0dXJuIGlzVVJMSW5Vc2VyTGlzdDtcbiAgICB9XG4gICAgLy8gVE9ETzogVXNlIGBzaXRlTGlzdEVuYWJsZWRgLCBgc2l0ZUxpc3REaXNhYmxlZGAsIGBlbmFibGVkQnlEZWZhdWx0YCBvcHRpb25zLlxuICAgIC8vIERlbGV0ZSBgc2l0ZUxpc3RgIGFuZCBgYXBwbHlUb0xpc3RlZE9ubHlgIG9wdGlvbnMsIHRyYW5zZmVyIHVzZXIncyB2YWx1ZXMuXG4gICAgY29uc3QgaXNVUkxJbkVuYWJsZWRMaXN0ID0gaXNVUkxJbkxpc3QodXJsLCB1c2VyU2V0dGluZ3Muc2l0ZUxpc3RFbmFibGVkKTtcbiAgICBpZiAoaXNVUkxJbkVuYWJsZWRMaXN0ICYmIGlzSW5EYXJrTGlzdCkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuICghaXNJbkRhcmtMaXN0ICYmICFpc1VSTEluVXNlckxpc3QpO1xufVxuIiwiaW1wb3J0IHttfSBmcm9tICdtYWxldmljJztcbmltcG9ydCB7QnV0dG9ufSBmcm9tICcuLi8uLi9jb250cm9scyc7XG5pbXBvcnQge2dldFVSTEhvc3RPclByb3RvY29sLCBpc1VSTEluTGlzdH0gZnJvbSAnLi4vLi4vLi4vdXRpbHMvdXJsJztcbmltcG9ydCB7RXh0V3JhcHBlciwgVGFiSW5mb30gZnJvbSAnLi4vLi4vLi4vZGVmaW5pdGlvbnMnO1xuXG5pbnRlcmZhY2UgQm9keVByb3BzIGV4dGVuZHMgRXh0V3JhcHBlciB7XG4gICAgdGFiOiBUYWJJbmZvO1xufVxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBCb2R5KHtkYXRhLCB0YWIsIGFjdGlvbnN9OiBCb2R5UHJvcHMpIHtcblxuICAgIGNvbnN0IGhvc3QgPSBnZXRVUkxIb3N0T3JQcm90b2NvbCh0YWIudXJsKTtcbiAgICBjb25zdCBjdXN0b20gPSBkYXRhLnNldHRpbmdzLmN1c3RvbVRoZW1lcy5maW5kKCh7dXJsfSkgPT4gaXNVUkxJbkxpc3QodGFiLnVybCwgdXJsKSk7XG5cbiAgICBsZXQgdGV4dE5vZGU6IEhUTUxUZXh0QXJlYUVsZW1lbnQ7XG5cbiAgICBjb25zdCBwbGFjZWhvbGRlclRleHQgPSBbXG4gICAgICAgICcqIHsnLFxuICAgICAgICAnICAgIGJhY2tncm91bmQtY29sb3I6ICMyMzQgIWltcG9ydGFudDsnLFxuICAgICAgICAnICAgIGNvbG9yOiAjY2JhICFpbXBvcnRhbnQ7JyxcbiAgICAgICAgJ30nLFxuICAgIF0uam9pbignXFxuJyk7XG5cbiAgICBmdW5jdGlvbiBvblRleHRSZW5kZXIobm9kZSkge1xuICAgICAgICB0ZXh0Tm9kZSA9IG5vZGU7XG4gICAgICAgIHRleHROb2RlLnZhbHVlID0gKGN1c3RvbSA/IGN1c3RvbS50aGVtZS5zdHlsZXNoZWV0IDogZGF0YS5zZXR0aW5ncy50aGVtZS5zdHlsZXNoZWV0KSB8fCAnJztcbiAgICAgICAgaWYgKGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgIT09IHRleHROb2RlKSB7XG4gICAgICAgICAgICB0ZXh0Tm9kZS5mb2N1cygpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gYXBwbHlTdHlsZVNoZWV0KGNzczogc3RyaW5nKSB7XG4gICAgICAgIGlmIChjdXN0b20pIHtcbiAgICAgICAgICAgIGN1c3RvbS50aGVtZSA9IHsuLi5jdXN0b20udGhlbWUsIC4uLntzdHlsZXNoZWV0OiBjc3N9fTtcbiAgICAgICAgICAgIGFjdGlvbnMuY2hhbmdlU2V0dGluZ3Moe2N1c3RvbVRoZW1lczogZGF0YS5zZXR0aW5ncy5jdXN0b21UaGVtZXN9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGFjdGlvbnMuc2V0VGhlbWUoe3N0eWxlc2hlZXQ6IGNzc30pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcmVzZXQoKSB7XG4gICAgICAgIGFwcGx5U3R5bGVTaGVldCgnJyk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gYXBwbHkoKSB7XG4gICAgICAgIGNvbnN0IGNzcyA9IHRleHROb2RlLnZhbHVlO1xuICAgICAgICBhcHBseVN0eWxlU2hlZXQoY3NzKTtcbiAgICB9XG5cbiAgICByZXR1cm4gKFxuICAgICAgICA8Ym9keT5cbiAgICAgICAgICAgIDxoZWFkZXI+XG4gICAgICAgICAgICAgICAgPGltZyBpZD1cImxvZ29cIiBzcmM9XCIuLi9hc3NldHMvaW1hZ2VzL2RhcmtyZWFkZXItdHlwZS5zdmdcIiBhbHQ9XCJEYXJrIFJlYWRlclwiIC8+XG4gICAgICAgICAgICAgICAgPGgxIGlkPVwidGl0bGVcIj5DU1MgRWRpdG9yPC9oMT5cbiAgICAgICAgICAgIDwvaGVhZGVyPlxuICAgICAgICAgICAgPGgzIGlkPVwic3ViLXRpdGxlXCI+e2N1c3RvbSA/IGhvc3QgOiAnQWxsIHdlYnNpdGVzJ308L2gzPlxuICAgICAgICAgICAgPHRleHRhcmVhXG4gICAgICAgICAgICAgICAgaWQ9XCJlZGl0b3JcIlxuICAgICAgICAgICAgICAgIG5hdGl2ZVxuICAgICAgICAgICAgICAgIHBsYWNlaG9sZGVyPXtwbGFjZWhvbGRlclRleHR9XG4gICAgICAgICAgICAgICAgb25yZW5kZXI9e29uVGV4dFJlbmRlcn1cbiAgICAgICAgICAgIC8+XG4gICAgICAgICAgICA8ZGl2IGlkPVwiYnV0dG9uc1wiPlxuICAgICAgICAgICAgICAgIDxCdXR0b24gb25jbGljaz17cmVzZXR9PlJlc2V0PC9CdXR0b24+XG4gICAgICAgICAgICAgICAgPEJ1dHRvbiBvbmNsaWNrPXthcHBseX0+QXBwbHk8L0J1dHRvbj5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICA8L2JvZHk+XG4gICAgKTtcbn1cbiIsImltcG9ydCB7RXh0ZW5zaW9uRGF0YSwgRXh0ZW5zaW9uQWN0aW9ucywgRmlsdGVyQ29uZmlnLCBUYWJJbmZvLCBNZXNzYWdlLCBVc2VyU2V0dGluZ3N9IGZyb20gJy4uLy4uL2RlZmluaXRpb25zJztcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgQ29ubmVjdG9yIGltcGxlbWVudHMgRXh0ZW5zaW9uQWN0aW9ucyB7XG4gICAgcHJpdmF0ZSBwb3J0OiBjaHJvbWUucnVudGltZS5Qb3J0O1xuICAgIHByaXZhdGUgY291bnRlcjogbnVtYmVyO1xuXG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIHRoaXMuY291bnRlciA9IDA7XG4gICAgICAgIHRoaXMucG9ydCA9IGNocm9tZS5ydW50aW1lLmNvbm5lY3Qoe25hbWU6ICd1aSd9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGdldFJlcXVlc3RJZCgpIHtcbiAgICAgICAgcmV0dXJuICsrdGhpcy5jb3VudGVyO1xuICAgIH1cblxuICAgIHByaXZhdGUgc2VuZFJlcXVlc3Q8VD4ocmVxdWVzdDogTWVzc2FnZSwgZXhlY3V0b3I6IChyZXNwb25zZTogTWVzc2FnZSwgcmVzb2x2ZTogKGRhdGE/OiBUKSA9PiB2b2lkLCByZWplY3Q6IChlcnJvcjogRXJyb3IpID0+IHZvaWQpID0+IHZvaWQpIHtcbiAgICAgICAgY29uc3QgaWQgPSB0aGlzLmdldFJlcXVlc3RJZCgpO1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2U8VD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgbGlzdGVuZXIgPSAoe2lkOiByZXNwb25zZUlkLCAuLi5yZXNwb25zZX06IE1lc3NhZ2UpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAocmVzcG9uc2VJZCA9PT0gaWQpIHtcbiAgICAgICAgICAgICAgICAgICAgZXhlY3V0b3IocmVzcG9uc2UsIHJlc29sdmUsIHJlamVjdCk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMucG9ydC5vbk1lc3NhZ2UucmVtb3ZlTGlzdGVuZXIobGlzdGVuZXIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICB0aGlzLnBvcnQub25NZXNzYWdlLmFkZExpc3RlbmVyKGxpc3RlbmVyKTtcbiAgICAgICAgICAgIHRoaXMucG9ydC5wb3N0TWVzc2FnZSh7Li4ucmVxdWVzdCwgaWR9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgZ2V0RGF0YSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2VuZFJlcXVlc3Q8RXh0ZW5zaW9uRGF0YT4oe3R5cGU6ICdnZXQtZGF0YSd9LCAoe2RhdGF9LCByZXNvbHZlKSA9PiByZXNvbHZlKGRhdGEpKTtcbiAgICB9XG5cbiAgICBnZXRBY3RpdmVUYWJJbmZvKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5zZW5kUmVxdWVzdDxUYWJJbmZvPih7dHlwZTogJ2dldC1hY3RpdmUtdGFiLWluZm8nfSwgKHtkYXRhfSwgcmVzb2x2ZSkgPT4gcmVzb2x2ZShkYXRhKSk7XG4gICAgfVxuXG4gICAgc3Vic2NyaWJlVG9DaGFuZ2VzKGNhbGxiYWNrOiAoZGF0YTogRXh0ZW5zaW9uRGF0YSkgPT4gdm9pZCkge1xuICAgICAgICBjb25zdCBpZCA9IHRoaXMuZ2V0UmVxdWVzdElkKCk7XG4gICAgICAgIHRoaXMucG9ydC5vbk1lc3NhZ2UuYWRkTGlzdGVuZXIoKHtpZDogcmVzcG9uc2VJZCwgZGF0YX06IE1lc3NhZ2UpID0+IHtcbiAgICAgICAgICAgIGlmIChyZXNwb25zZUlkID09PSBpZCkge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKGRhdGEpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5wb3J0LnBvc3RNZXNzYWdlKHt0eXBlOiAnc3Vic2NyaWJlLXRvLWNoYW5nZXMnLCBpZH0pO1xuICAgIH1cblxuICAgIGVuYWJsZSgpIHtcbiAgICAgICAgdGhpcy5wb3J0LnBvc3RNZXNzYWdlKHt0eXBlOiAnZW5hYmxlJ30pO1xuICAgIH1cblxuICAgIGRpc2FibGUoKSB7XG4gICAgICAgIHRoaXMucG9ydC5wb3N0TWVzc2FnZSh7dHlwZTogJ2Rpc2FibGUnfSk7XG4gICAgfVxuXG4gICAgc2V0U2hvcnRjdXQoY29tbWFuZDogc3RyaW5nLCBzaG9ydGN1dDogc3RyaW5nKSB7XG4gICAgICAgIHRoaXMucG9ydC5wb3N0TWVzc2FnZSh7dHlwZTogJ3NldC1zaG9ydGN1dCcsIGRhdGE6IHtjb21tYW5kLCBzaG9ydGN1dH19KTtcbiAgICB9XG5cbiAgICBjaGFuZ2VTZXR0aW5ncyhzZXR0aW5nczogUGFydGlhbDxVc2VyU2V0dGluZ3M+KSB7XG4gICAgICAgIHRoaXMucG9ydC5wb3N0TWVzc2FnZSh7dHlwZTogJ2NoYW5nZS1zZXR0aW5ncycsIGRhdGE6IHNldHRpbmdzfSk7XG4gICAgfVxuXG4gICAgc2V0VGhlbWUodGhlbWU6IFBhcnRpYWw8RmlsdGVyQ29uZmlnPikge1xuICAgICAgICB0aGlzLnBvcnQucG9zdE1lc3NhZ2Uoe3R5cGU6ICdzZXQtdGhlbWUnLCBkYXRhOiB0aGVtZX0pO1xuICAgIH1cblxuICAgIHRvZ2dsZVVSTCh1cmw6IHN0cmluZykge1xuICAgICAgICB0aGlzLnBvcnQucG9zdE1lc3NhZ2Uoe3R5cGU6ICd0b2dnbGUtdXJsJywgZGF0YTogdXJsfSk7XG4gICAgfVxuXG4gICAgbWFya05ld3NBc1JlYWQoaWRzOiBzdHJpbmdbXSkge1xuICAgICAgICB0aGlzLnBvcnQucG9zdE1lc3NhZ2Uoe3R5cGU6ICdtYXJrLW5ld3MtYXMtcmVhZCcsIGRhdGE6IGlkc30pO1xuICAgIH1cblxuICAgIGxvYWRDb25maWcob3B0aW9uczoge2xvY2FsOiBib29sZWFufSkge1xuICAgICAgICB0aGlzLnBvcnQucG9zdE1lc3NhZ2Uoe3R5cGU6ICdsb2FkLWNvbmZpZycsIGRhdGE6IG9wdGlvbnN9KTtcbiAgICB9XG5cbiAgICBhcHBseURldkR5bmFtaWNUaGVtZUZpeGVzKHRleHQ6IHN0cmluZykge1xuICAgICAgICByZXR1cm4gdGhpcy5zZW5kUmVxdWVzdDx2b2lkPih7dHlwZTogJ2FwcGx5LWRldi1keW5hbWljLXRoZW1lLWZpeGVzJywgZGF0YTogdGV4dH0sICh7ZXJyb3J9LCByZXNvbHZlLCByZWplY3QpID0+IGVycm9yID8gcmVqZWN0KGVycm9yKSA6IHJlc29sdmUoKSk7XG4gICAgfVxuXG4gICAgcmVzZXREZXZEeW5hbWljVGhlbWVGaXhlcygpIHtcbiAgICAgICAgdGhpcy5wb3J0LnBvc3RNZXNzYWdlKHt0eXBlOiAncmVzZXQtZGV2LWR5bmFtaWMtdGhlbWUtZml4ZXMnfSk7XG4gICAgfVxuXG4gICAgYXBwbHlEZXZJbnZlcnNpb25GaXhlcyh0ZXh0OiBzdHJpbmcpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2VuZFJlcXVlc3Q8dm9pZD4oe3R5cGU6ICdhcHBseS1kZXYtaW52ZXJzaW9uLWZpeGVzJywgZGF0YTogdGV4dH0sICh7ZXJyb3J9LCByZXNvbHZlLCByZWplY3QpID0+IGVycm9yID8gcmVqZWN0KGVycm9yKSA6IHJlc29sdmUoKSk7XG4gICAgfVxuXG4gICAgcmVzZXREZXZJbnZlcnNpb25GaXhlcygpIHtcbiAgICAgICAgdGhpcy5wb3J0LnBvc3RNZXNzYWdlKHt0eXBlOiAncmVzZXQtZGV2LWludmVyc2lvbi1maXhlcyd9KTtcbiAgICB9XG5cbiAgICBhcHBseURldlN0YXRpY1RoZW1lcyh0ZXh0OiBzdHJpbmcpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2VuZFJlcXVlc3Q8dm9pZD4oe3R5cGU6ICdhcHBseS1kZXYtc3RhdGljLXRoZW1lcycsIGRhdGE6IHRleHR9LCAoe2Vycm9yfSwgcmVzb2x2ZSwgcmVqZWN0KSA9PiBlcnJvciA/IHJlamVjdChlcnJvcikgOiByZXNvbHZlKCkpO1xuICAgIH1cblxuICAgIHJlc2V0RGV2U3RhdGljVGhlbWVzKCkge1xuICAgICAgICB0aGlzLnBvcnQucG9zdE1lc3NhZ2Uoe3R5cGU6ICdyZXNldC1kZXYtc3RhdGljLXRoZW1lcyd9KTtcbiAgICB9XG5cbiAgICBkaXNjb25uZWN0KCkge1xuICAgICAgICB0aGlzLnBvcnQuZGlzY29ubmVjdCgpO1xuICAgIH1cbn1cbiIsImltcG9ydCB7Z2V0VVJMSG9zdE9yUHJvdG9jb2x9IGZyb20gJy4uLy4uL3V0aWxzL3VybCc7XG5pbXBvcnQge0V4dGVuc2lvbkRhdGEsIFRhYkluZm8sIFRoZW1lLCBVc2VyU2V0dGluZ3N9IGZyb20gJy4uLy4uL2RlZmluaXRpb25zJztcblxuZXhwb3J0IGZ1bmN0aW9uIGdldE1vY2tEYXRhKG92ZXJyaWRlID0ge30gYXMgUGFydGlhbDxFeHRlbnNpb25EYXRhPik6IEV4dGVuc2lvbkRhdGEge1xuICAgIHJldHVybiBPYmplY3QuYXNzaWduKHtcbiAgICAgICAgaXNFbmFibGVkOiB0cnVlLFxuICAgICAgICBpc1JlYWR5OiB0cnVlLFxuICAgICAgICBzZXR0aW5nczoge1xuICAgICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICAgIHByZXNldHM6IFtdLFxuICAgICAgICAgICAgdGhlbWU6IHtcbiAgICAgICAgICAgICAgICBtb2RlOiAxLFxuICAgICAgICAgICAgICAgIGJyaWdodG5lc3M6IDExMCxcbiAgICAgICAgICAgICAgICBjb250cmFzdDogOTAsXG4gICAgICAgICAgICAgICAgZ3JheXNjYWxlOiAyMCxcbiAgICAgICAgICAgICAgICBzZXBpYTogMTAsXG4gICAgICAgICAgICAgICAgdXNlRm9udDogZmFsc2UsXG4gICAgICAgICAgICAgICAgZm9udEZhbWlseTogJ1NlZ29lIFVJJyxcbiAgICAgICAgICAgICAgICB0ZXh0U3Ryb2tlOiAwLFxuICAgICAgICAgICAgICAgIGVuZ2luZTogJ2Nzc0ZpbHRlcicsXG4gICAgICAgICAgICAgICAgc3R5bGVzaGVldDogJycsXG4gICAgICAgICAgICAgICAgc2Nyb2xsYmFyQ29sb3I6ICdhdXRvJyxcbiAgICAgICAgICAgICAgICBzdHlsZVN5c3RlbUNvbnRyb2xzOiB0cnVlLFxuICAgICAgICAgICAgfSBhcyBUaGVtZSxcbiAgICAgICAgICAgIGN1c3RvbVRoZW1lczogW10sXG4gICAgICAgICAgICBzaXRlTGlzdDogW10sXG4gICAgICAgICAgICBzaXRlTGlzdEVuYWJsZWQ6IFtdLFxuICAgICAgICAgICAgYXBwbHlUb0xpc3RlZE9ubHk6IGZhbHNlLFxuICAgICAgICAgICAgY2hhbmdlQnJvd3NlclRoZW1lOiBmYWxzZSxcbiAgICAgICAgICAgIGVuYWJsZUZvclBERjogdHJ1ZSxcbiAgICAgICAgICAgIGVuYWJsZUZvclByb3RlY3RlZFBhZ2VzOiBmYWxzZSxcbiAgICAgICAgICAgIG5vdGlmeU9mTmV3czogZmFsc2UsXG4gICAgICAgICAgICBzeW5jU2V0dGluZ3M6IHRydWUsXG4gICAgICAgICAgICBhdXRvbWF0aW9uOiAnJyxcbiAgICAgICAgICAgIHRpbWU6IHtcbiAgICAgICAgICAgICAgICBhY3RpdmF0aW9uOiAnMTg6MDAnLFxuICAgICAgICAgICAgICAgIGRlYWN0aXZhdGlvbjogJzk6MDAnLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGxvY2F0aW9uOiB7XG4gICAgICAgICAgICAgICAgbGF0aXR1ZGU6IDUyLjQyMzcxNzgsXG4gICAgICAgICAgICAgICAgbG9uZ2l0dWRlOiAzMS4wMjE3ODYsXG4gICAgICAgICAgICB9LFxuICAgICAgICB9IGFzIFVzZXJTZXR0aW5ncyxcbiAgICAgICAgZm9udHM6IFtcbiAgICAgICAgICAgICdzZXJpZicsXG4gICAgICAgICAgICAnc2Fucy1zZXJpZicsXG4gICAgICAgICAgICAnbW9ub3NwYWNlJyxcbiAgICAgICAgICAgICdjdXJzaXZlJyxcbiAgICAgICAgICAgICdmYW50YXN5JyxcbiAgICAgICAgICAgICdzeXN0ZW0tdWknXG4gICAgICAgIF0sXG4gICAgICAgIG5ld3M6IFtdLFxuICAgICAgICBzaG9ydGN1dHM6IHtcbiAgICAgICAgICAgICdhZGRTaXRlJzogJ0FsdCtTaGlmdCtBJyxcbiAgICAgICAgICAgICd0b2dnbGUnOiAnQWx0K1NoaWZ0K0QnXG4gICAgICAgIH0sXG4gICAgICAgIGRldnRvb2xzOiB7XG4gICAgICAgICAgICBkeW5hbWljRml4ZXNUZXh0OiAnJyxcbiAgICAgICAgICAgIGZpbHRlckZpeGVzVGV4dDogJycsXG4gICAgICAgICAgICBzdGF0aWNUaGVtZXNUZXh0OiAnJyxcbiAgICAgICAgICAgIGhhc0N1c3RvbUR5bmFtaWNGaXhlczogZmFsc2UsXG4gICAgICAgICAgICBoYXNDdXN0b21GaWx0ZXJGaXhlczogZmFsc2UsXG4gICAgICAgICAgICBoYXNDdXN0b21TdGF0aWNGaXhlczogZmFsc2UsXG4gICAgICAgIH0sXG4gICAgfSBhcyBFeHRlbnNpb25EYXRhLCBvdmVycmlkZSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRNb2NrQWN0aXZlVGFiSW5mbygpOiBUYWJJbmZvIHtcbiAgICByZXR1cm4ge1xuICAgICAgICB1cmw6ICdodHRwczovL2RhcmtyZWFkZXIub3JnLycsXG4gICAgICAgIGlzUHJvdGVjdGVkOiBmYWxzZSxcbiAgICAgICAgaXNJbkRhcmtMaXN0OiBmYWxzZSxcbiAgICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlQ29ubmVjdG9yTW9jaygpIHtcbiAgICBsZXQgbGlzdGVuZXI6IChkYXRhKSA9PiB2b2lkID0gbnVsbDtcbiAgICBjb25zdCBkYXRhID0gZ2V0TW9ja0RhdGEoKTtcbiAgICBjb25zdCB0YWIgPSBnZXRNb2NrQWN0aXZlVGFiSW5mbygpO1xuICAgIGNvbnN0IGNvbm5lY3RvciA9IHtcbiAgICAgICAgZ2V0RGF0YSgpIHtcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoZGF0YSk7XG4gICAgICAgIH0sXG4gICAgICAgIGdldEFjdGl2ZVRhYkluZm8oKSB7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRhYik7XG4gICAgICAgIH0sXG4gICAgICAgIHN1YnNjcmliZVRvQ2hhbmdlcyhjYWxsYmFjaykge1xuICAgICAgICAgICAgbGlzdGVuZXIgPSBjYWxsYmFjaztcbiAgICAgICAgfSxcbiAgICAgICAgY2hhbmdlU2V0dGluZ3Moc2V0dGluZ3MpIHtcbiAgICAgICAgICAgIE9iamVjdC5hc3NpZ24oZGF0YS5zZXR0aW5ncywgc2V0dGluZ3MpO1xuICAgICAgICAgICAgbGlzdGVuZXIoZGF0YSk7XG4gICAgICAgIH0sXG4gICAgICAgIHNldFRoZW1lKHRoZW1lKSB7XG4gICAgICAgICAgICBPYmplY3QuYXNzaWduKGRhdGEuc2V0dGluZ3MudGhlbWUsIHRoZW1lKTtcbiAgICAgICAgICAgIGxpc3RlbmVyKGRhdGEpO1xuICAgICAgICB9LFxuICAgICAgICBzZXRTaG9ydGN1dChjb21tYW5kLCBzaG9ydGN1dCkge1xuICAgICAgICAgICAgT2JqZWN0LmFzc2lnbihkYXRhLnNob3J0Y3V0cywge1tjb21tYW5kXTogc2hvcnRjdXR9KTtcbiAgICAgICAgICAgIGxpc3RlbmVyKGRhdGEpO1xuICAgICAgICB9LFxuICAgICAgICB0b2dnbGVVUkwodXJsKSB7XG4gICAgICAgICAgICBjb25zdCBwYXR0ZXJuID0gZ2V0VVJMSG9zdE9yUHJvdG9jb2wodXJsKTtcbiAgICAgICAgICAgIGNvbnN0IGluZGV4ID0gZGF0YS5zZXR0aW5ncy5zaXRlTGlzdC5pbmRleE9mKHBhdHRlcm4pO1xuICAgICAgICAgICAgaWYgKGluZGV4ID49IDApIHtcbiAgICAgICAgICAgICAgICBkYXRhLnNldHRpbmdzLnNpdGVMaXN0LnNwbGljZShpbmRleCwgMSwgcGF0dGVybik7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGRhdGEuc2V0dGluZ3Muc2l0ZUxpc3QucHVzaChwYXR0ZXJuKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGxpc3RlbmVyKGRhdGEpO1xuICAgICAgICB9LFxuICAgICAgICBtYXJrTmV3c0FzUmVhZChpZHM6IHN0cmluZ1tdKSB7XG4gICAgICAgICAgICBkYXRhLm5ld3NcbiAgICAgICAgICAgICAgICAuZmlsdGVyKCh7aWR9KSA9PiBpZHMuaW5jbHVkZXMoaWQpKVxuICAgICAgICAgICAgICAgIC5mb3JFYWNoKChuZXdzKSA9PiBuZXdzLnJlYWQgPSB0cnVlKTtcbiAgICAgICAgICAgIGxpc3RlbmVyKGRhdGEpO1xuICAgICAgICB9LFxuICAgICAgICBkaXNjb25uZWN0KCkge1xuICAgICAgICAgICAgLy9cbiAgICAgICAgfSxcbiAgICB9O1xuICAgIHJldHVybiBjb25uZWN0b3I7XG59XG4iLCJpbXBvcnQgQ29ubmVjdG9yIGZyb20gJy4vY29ubmVjdG9yJztcbmltcG9ydCB7Y3JlYXRlQ29ubmVjdG9yTW9ja30gZnJvbSAnLi9tb2NrJztcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gY29ubmVjdCgpIHtcbiAgICBpZiAodHlwZW9mIGNocm9tZSA9PT0gJ3VuZGVmaW5lZCcgfHwgIWNocm9tZS5leHRlbnNpb24pIHtcbiAgICAgICAgcmV0dXJuIGNyZWF0ZUNvbm5lY3Rvck1vY2soKSBhcyBDb25uZWN0b3I7XG4gICAgfVxuICAgIHJldHVybiBuZXcgQ29ubmVjdG9yKCk7XG59XG4iLCJpbXBvcnQge219IGZyb20gJ21hbGV2aWMnO1xuaW1wb3J0IHtzeW5jfSBmcm9tICdtYWxldmljL2RvbSc7XG5pbXBvcnQgQm9keSBmcm9tICcuL2NvbXBvbmVudHMvYm9keSc7XG5pbXBvcnQgY29ubmVjdCBmcm9tICcuLi9jb25uZWN0JztcblxuZnVuY3Rpb24gcmVuZGVyQm9keShkYXRhLCB0YWIsIGFjdGlvbnMpIHtcbiAgICBzeW5jKGRvY3VtZW50LmJvZHksIDxCb2R5IGRhdGE9e2RhdGF9IHRhYj17dGFifSBhY3Rpb25zPXthY3Rpb25zfSAvPik7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHN0YXJ0KCkge1xuICAgIGNvbnN0IGNvbm5lY3RvciA9IGNvbm5lY3QoKTtcbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigndW5sb2FkJywgKCkgPT4gY29ubmVjdG9yLmRpc2Nvbm5lY3QoKSk7XG5cbiAgICBjb25zdCBkYXRhID0gYXdhaXQgY29ubmVjdG9yLmdldERhdGEoKTtcbiAgICBjb25zdCB0YWIgPSBhd2FpdCBjb25uZWN0b3IuZ2V0QWN0aXZlVGFiSW5mbygpO1xuICAgIHJlbmRlckJvZHkoZGF0YSwgdGFiLCBjb25uZWN0b3IpO1xuICAgIGNvbm5lY3Rvci5zdWJzY3JpYmVUb0NoYW5nZXMoKGRhdGEpID0+IHJlbmRlckJvZHkoZGF0YSwgdGFiLCBjb25uZWN0b3IpKTtcbn1cblxuc3RhcnQoKTtcbiJdLCJuYW1lcyI6WyJjbGFzc2VzIiwicmVuZGVyIiwiZ2V0Q29udGV4dCJdLCJtYXBwaW5ncyI6Ijs7O0lBQUE7SUFDQSxTQUFTLENBQUMsQ0FBQyxjQUFjLEVBQUUsS0FBSyxFQUFFLEdBQUcsUUFBUSxFQUFFO0lBQy9DLElBQUksS0FBSyxHQUFHLEtBQUssSUFBSSxFQUFFLENBQUM7SUFDeEIsSUFBSSxJQUFJLE9BQU8sY0FBYyxLQUFLLFFBQVEsRUFBRTtJQUM1QyxRQUFRLE1BQU0sR0FBRyxHQUFHLGNBQWMsQ0FBQztJQUNuQyxRQUFRLE9BQU8sRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsQ0FBQztJQUM5QyxLQUFLO0lBQ0wsSUFBSSxJQUFJLE9BQU8sY0FBYyxLQUFLLFVBQVUsRUFBRTtJQUM5QyxRQUFRLE1BQU0sU0FBUyxHQUFHLGNBQWMsQ0FBQztJQUN6QyxRQUFRLE9BQU8sRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsQ0FBQztJQUNwRCxLQUFLO0lBQ0wsSUFBSSxNQUFNLElBQUksS0FBSyxDQUFDLHVCQUF1QixDQUFDLENBQUM7SUFDN0M7O0lDWkE7SUFDQSxTQUFTLGtCQUFrQixHQUFHO0lBQzlCLElBQUksTUFBTSxPQUFPLEdBQUcsRUFBRSxDQUFDO0lBQ3ZCLElBQUksT0FBTztJQUNYLFFBQVEsR0FBRyxDQUFDLE1BQU0sRUFBRTtJQUNwQixZQUFZLE9BQU8sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDakMsWUFBWSxPQUFPLElBQUksQ0FBQztJQUN4QixTQUFTO0lBQ1QsUUFBUSxL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
