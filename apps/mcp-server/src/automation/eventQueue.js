/** Stable minimum heap: virtual time first, then insertion sequence. */
export class EventQueue {
  #items = [];
  get size() {
    return this.#items.length;
  }
  peek() {
    return this.#items[0];
  }
  values() {
    return this.#items.values();
  }
  #before(a, b) {
    return a.at < b.at || (a.at === b.at && a.sequence < b.sequence);
  }
  push(item) {
    this.#items.push(item);
    let index = this.#items.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (!this.#before(this.#items[index], this.#items[parent])) break;
      [this.#items[index], this.#items[parent]] = [
        this.#items[parent],
        this.#items[index],
      ];
      index = parent;
    }
  }
  pop() {
    const first = this.#items[0],
      last = this.#items.pop();
    if (this.#items.length) {
      this.#items[0] = last;
      let index = 0;
      while (true) {
        const left = index * 2 + 1,
          right = left + 1;
        let child = index;
        if (
          left < this.#items.length &&
          this.#before(this.#items[left], this.#items[child])
        )
          child = left;
        if (
          right < this.#items.length &&
          this.#before(this.#items[right], this.#items[child])
        )
          child = right;
        if (child === index) break;
        [this.#items[index], this.#items[child]] = [
          this.#items[child],
          this.#items[index],
        ];
        index = child;
      }
    }
    return first;
  }
}
