import { InMarketOrderType } from "./types/spot";


export function remaining(order: InMarketOrderType): bigint {
    return order.quantity - order.filled;
}

export class OrderNode {
    order: InMarketOrderType;
    next: OrderNode | null = null;
    prev: OrderNode | null = null;

    constructor(order: InMarketOrderType) {
        this.order = order;
    }
}

export class OrderList {
    head: OrderNode | null = null;
    tail: OrderNode | null = null;
    size = 0;
    totalQty: bigint = 0n;

    append(order: InMarketOrderType): OrderNode {
        const node = new OrderNode(order);

        if (!this.head) {
            this.head = this.tail = node;
        } else {
            node.prev = this.tail;
            this.tail!.next = node;
            this.tail = node;
        }
        this.totalQty += remaining(order);
        this.size++;
        return node;
    }

    remove(node: OrderNode) {
        const qty = remaining(node.order);

        if (node.prev) {
            node.prev.next = node.next;
        } else {
            this.head = node.next;
        }

        if (node.next) {
            node.next.prev = node.prev;
        } else {
            this.tail = node.prev;
        }

        node.next = null;
        node.prev = null;
        this.totalQty -= qty;
        this.size--;
    }

    // check: is in use
    decreaseQty(qty: bigint) {
        this.totalQty -= qty;
    }

    shift(): OrderNode | null {
        if (!this.head) return null;
        const node = this.head;
        this.remove(node);
        return node;
    }

    isEmpty() {
        return this.size === 0;
    }
}