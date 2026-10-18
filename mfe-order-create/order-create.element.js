/**
 * <order-create-mfe> — remote micro-frontend for order capture.
 *
 * Contract v1
 *  Properties : customers: {id,name}[]   products: {sku,name,unitPrice}[]
 *  Attributes : currency (ISO 4217, default AUD)
 *  Events     : order-submitted  detail {customerId, productSku, quantity, notes?}
 *               order-cancelled
 *  Theming    : --mfe-primary, --mfe-font CSS custom properties
 *
 * The element owns UI/validation only; persistence stays with the host.
 */
const TAG = 'order-create-mfe';
const VERSION = '1.0.0';

const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host { display: block; font-family: var(--mfe-font, system-ui, sans-serif); color: #1f2937; }
    .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 24px; max-width: 760px; }
    .banner { display: inline-block; margin-bottom: 16px; padding: 2px 10px; border-radius: 999px;
              font-size: 11px; font-weight: 700; background: #fff1ec; color: #c2410c; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px 20px; }
    .full { grid-column: 1 / -1; }
    label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 600; }
    select, input, textarea { font: inherit; font-weight: 400; padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 6px; background: #fff000; }
    input[readonly] { background: #f9fafb; }
    [aria-invalid="true"] { border-color: #b91c1c; }
    .error { color: #b91c1c; font-size: 12px; font-weight: 400; min-height: 1em; }
    .summary { display: flex; justify-content: space-between; margin-top: 20px; padding: 12px 16px; border-radius: 6px; background: #f3f4f6; }
    .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }
    button { font: inherit; font-weight: 500; padding: 8px 16px; border-radius: 6px; border: 1px solid #d1d5db; background: #fff; cursor: pointer; }
    button[type="submit"] { background: var(--mfe-primary, #0b3d91); border-color: transparent; color: #fff; }
    @media (max-width: 640px) { .grid { grid-template-columns: 1fr; } }
  </style>
  <div class="card">
    <span class="banner">REMOTE MFE · ${TAG} v${VERSION}</span>
    <form novalidate>
      <div class="grid">
        <label>Customer
          <select name="customerId"></select>
          <span class="error" data-for="customerId"></span>
        </label>
        <label>Product
          <select name="productSku"></select>
          <span class="error" data-for="productSku"></span>
        </label>
        <label>Quantity
          <input name="quantity" type="number" min="1" max="10000" step="1" value="1">
          <span class="error" data-for="quantity"></span>
        </label>
        <label>Unit price
          <input name="unitPrice" type="text" readonly tabindex="-1">
        </label>
        <label class="full">Notes
          <textarea name="notes" rows="3" maxlength="500"></textarea>
        </label>
      </div>
      <div class="summary"><span>Order total</span><strong id="total">–</strong></div>
      <div class="actions">
        <button type="button" id="cancel">Cancel</button>
        <button type="submit">Submit order</button>
      </div>
    </form>
  </div>
`;

class OrderCreateMfe extends HTMLElement {
  static observedAttributes = ['currency'];

  #customers = [];
  #products = [];
  #root;
  #form;
  #abort;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: 'open' });
    this.#root.appendChild(template.content.cloneNode(true));
    this.#form = this.#root.querySelector('form');
  }

  get customers() { return this.#customers; }
  set customers(value) {
    this.#customers = Array.isArray(value) ? value : [];
    this.#fillSelect('customerId', this.#customers, c => [c.id, c.name], 'Select a customer');
  }

  get products() { return this.#products; }
  set products(value) {
    this.#products = Array.isArray(value) ? value : [];
    this.#fillSelect('productSku', this.#products, p => [p.sku, p.name], 'Select a product');
    this.#updateSummary();
  }

  connectedCallback() {
    // Re-apply props set before the element was upgraded.
    for (const prop of ['customers', 'products']) {
      if (Object.prototype.hasOwnProperty.call(this, prop)) {
        const value = this[prop];
        delete this[prop];
        this[prop] = value;
      }
    }
    this.#abort = new AbortController();
    const { signal } = this.#abort;
    this.#form.addEventListener('submit', e => this.#onSubmit(e), { signal });
    this.#form.addEventListener('input', () => this.#updateSummary(), { signal });
    this.#root.getElementById('cancel').addEventListener('click', () => this.#emit('order-cancelled'), { signal });
    this.#updateSummary();
  }

  disconnectedCallback() {
    this.#abort?.abort();
  }

  attributeChangedCallback() {
    this.#updateSummary();
  }

  #fillSelect(name, items, toOption, placeholder) {
    const select = this.#form.elements.namedItem(name);
    const current = select.value;
    // new Option() sets text via textContent — safe for untrusted labels.
    select.replaceChildren(
      new Option(placeholder, ''),
      ...items.map(item => {
        const [value, label] = toOption(item);
        return new Option(String(label), String(value));
      }),
    );
    select.value = current;
  }

  #formatter() {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: this.getAttribute('currency') || 'AUD' });
    } catch {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'AUD' });
    }
  }

  #updateSummary() {
    const f = this.#form.elements;
    const product = this.#products.find(p => p.sku === f.productSku.value);
    const qty = Number(f.quantity.value) || 0;
    const fmt = this.#formatter();
    f.unitPrice.value = product ? fmt.format(product.unitPrice) : '';
    this.#root.getElementById('total').textContent = product ? fmt.format(product.unitPrice * qty) : '–';
  }

  #validate(data) {
    const errors = {};
    if (!data.customerId) errors.customerId = 'Customer is required';
    if (!data.productSku) errors.productSku = 'Product is required';
    if (!Number.isInteger(data.quantity) || data.quantity < 1 || data.quantity > 10000) {
      errors.quantity = 'Enter a whole number between 1 and 10000';
    }
    for (const el of this.#root.querySelectorAll('.error')) {
      const msg = errors[el.dataset.for] ?? '';
      el.textContent = msg;
      this.#form.elements.namedItem(el.dataset.for).setAttribute('aria-invalid', String(!!msg));
    }
    return Object.keys(errors).length === 0;
  }

  #onSubmit(event) {
    event.preventDefault();
    const f = this.#form.elements;
    const detail = {
      customerId: f.customerId.value,
      productSku: f.productSku.value,
      quantity: Number(f.quantity.value),
      notes: f.notes.value.trim() || undefined,
    };
    if (!this.#validate(detail)) return;
    this.#emit('order-submitted', detail);
    this.#form.reset();
    this.#updateSummary();
  }

  #emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

if (!customElements.get(TAG)) {
  customElements.define(TAG, OrderCreateMfe);
}
