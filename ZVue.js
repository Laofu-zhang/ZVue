// 初始化一个 ZVue
class ZVue {
    constructor(options) {
        // 初始化元素通过options绑定
        this.$data = options.data
        this.$el = options.el
        this.$options = options
        // 通过Compiler类对v-html,v-on,v-model,v-text,{{}}等Vue语法进行编译
        if(this.$el) {
            // 实现数据观察者
            new Observer(this.$data)
            // 实现指令解析器
            new Compiler(this.$el, this)
            // this.$data 代理成 this
            this.proxyData(this.$data)
        }
    }
    proxyData(data) {
        Object.keys(data).forEach(key=> {
            Object.defineProperty(this, key, {
                get(val) {
                    return data[key]
                },
                set(newVal) {
                    data[key] = newVal
                }
            })
        })
    }
}
const compileUtil = {
    getValue(expr, vm) {
        return expr.split('.').reduce((data, currentValue)=> {
            return data[currentValue]
        }, vm.$data)
    },
    setValue(expr, vm, inputValue) {
        return expr.split('.').reduce((data, currentValue)=> {
            return data[currentValue] = inputValue
        }, vm.$data)
    },
    getContentVal(expr, vm) {
        return expr.replace(/\{\{(.+?)\}\}/g, (...args) => {
            return this.getValue(args[1], vm)
        })
    },
    text(node, expr, vm) {//expr: msg
        // console.log(node, expr, vm)
        let value;
        if (expr.indexOf('{{') !== -1) {
            value = expr.replace(/\{\{(.+?)\}\}/g, (...args) => {
                new Watcher(vm, args[1], () => {
                    this.updater.textUpdater(node, this.getContentVal(expr, vm))
                })
                return this.getValue(args[1], vm)
            })
        } else {
            value = this.getValue(expr, vm)
        }
        this.updater.textUpdater(node, value)
    },
    html(node, expr, vm) {
        const value = this.getValue(expr, vm)
        new Watcher(vm, expr, (newVal) => {
            this.updater.htmlUpdater(node, newVal)
        })
        this.updater.htmlUpdater(node, value)

    },
    model(node, expr, vm) {
        // console.log(node, expr, vm)
        const value = this.getValue(expr, vm)
        // 绑定更新函数， 数据驱动视图
        new Watcher(vm, expr, (newVal) => {
            this.updater.modelUpdater(node, newVal)
        })
        // 视图=>数据=>视图
        node.addEventListener('input',(e)=> {
            // 设置值
            this.setValue(expr, vm, e.target.value)
        })
        this.updater.modelUpdater(node, value)
    },
    on(node, expr, vm, eventName) {
        let fn = vm.$options.methods && vm.$options.methods[expr];
        node.addEventListener(eventName, fn.bind(vm), false)
    },
    bind(node, expr, vm, attrName) {
        let value = this.getValue(expr, vm);
        node.setAttribute(attrName, value)
    },
    // 更新的函数
    updater: {
        textUpdater(node, value) {
            node.textContent = value
        },
        htmlUpdater(node, value) {
            node.innerHTML = value
        },
        modelUpdater(node, value) {
            node.value = value
        }
    }
}
// 模板编译器处理
class Compiler {
    constructor(el, vm) {
        this.el = this.isElementNode(el) ? el : document.querySelector(el);
        this.vm = vm;
        // 1.将编译的元素节点放入到文档碎片中，避免dom频繁的渲染回流，提高性能
        const fragments = this.node2fragments(this.el);
        // 2.编译模板
        this.compile(fragments);
        // 3. 追加子元素到根元素
        this.el.appendChild(fragments);
    }

    compile(fragments) {
        // 获取字节点
        const childNodes = fragments.childNodes;
        // 递归循环编译
        [...childNodes].forEach(child=> {
            // console.log(child)
            if (this.isElementNode(child)) {
                // 元素节点
                this.compileElement(child)
            } else {
                // 文本节点
                this.compileText(child)
            }
            //递归遍历
            if(child.childNodes && child.childNodes.length){
                this.compile(child);
            }
        })
        
    }

    compileElement(node) {
        // 获取节点属性
        let attributes = node.attributes;
        // 对每个属性进行编译
        [...attributes].forEach(attr => {
            let {name, value} = attr;
            // console.log(attr)
            if (this.isDirective(name)) {
                // 指令处理
                let [, directive] = name.split('-');
                let [dirName, eventName] = directive.split(':');
                
                compileUtil[dirName](node, value, this.vm, eventName);
                node.removeAttribute('v-' + directive)

            } else if(this.isEventName(name)) {
                // 事件处理

                let [, eventName] = name.split('@');
                compileUtil['on'](node, value, this.vm, eventName);
            }
        })
    }

    compileText(node) {
        // console.log('本文：：：：',node)
        const content = node.textContent;
        if(/\{\{(.+?)\}\}/.test(content)){
            compileUtil['text'](node, content, this.vm)
        }
    }

    node2fragments(el) {
        // 创建文档节点碎片对象
        const fragement = document.createDocumentFragment();
        let firstChild;
        while (firstChild = el.firstChild) {
            fragement.appendChild(firstChild)
        }
        return fragement
    }

    isElementNode(node) {
        // 判断节原始节点是否是一个元素
        return node.nodeType === 1;
    }

    isDirective(attrName) {
        return attrName.startsWith('v-')
    }

    isEventName(attrName) {
        return attrName.startsWith('@')
    }
}
// 数据劫持
class Observer {
    constructor(data) {
        this.observe(data)
    }
    observe(data) {
        if (data && typeof data === 'object') {
            Object.keys(data).forEach(key => {
                console.log(key)
                this.defindReactive(data, key, data[key])
            })
        }
    }
    // 劫持监听所有的属性 

    defindReactive(obj, key, value) {
        // 递归遍历
        this.observe(value)
        const dep = new Dep()
        
        Object.defineProperty(obj,key,{
            enumerable: true,
            configurable: false,
            get() {
                // 订阅数据变化时，往Dep中添加数据观察者
                Dep.target && dep.addSub(Dep.target);
                console.log('get val', value)
                return value
            },
            set:(newVal) => {
                this.observe(newVal)
                if(newVal !== value) {
                    value = newVal
                }
                // 通知变化
                dep.notify()
            }
        })
    }
}

class Watcher {
    constructor(vm, expr, cb) {
        this.vm = vm;
        this.expr = expr;
        this.cb = cb;
        this.oldVal = this.getOldVal();
    }
    getOldVal() {
        Dep.target = this
        const oldVal = compileUtil.getValue(this.expr, this.vm);
        Dep.target = null
        return oldVal
    }
    update() {
        const newVal = compileUtil.getValue(this.expr, this.vm);
        if (newVal !== this.oldVal) {
            this.cb(newVal)
        }
    }
}
// 通知Watch
class Dep {
    constructor() {
        this.subs = [];

    }
    // 收集观察者
    addSub(watcher) {
        this.subs.push(watcher);
    }
    // 通知观察者更新
    notify() {
        console.log('观察者', this.subs)
        this.subs.forEach(w => w.update())
    }
}