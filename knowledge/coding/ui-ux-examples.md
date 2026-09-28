# UI/UX Practical Examples and Code Patterns

This document provides practical code examples and patterns for implementing common UI/UX concepts in web applications.

## Responsive Layout Patterns

### CSS Grid for Dashboard Layout

```css
.dashboard {
  display: grid;
  grid-template-columns: 250px 1fr;
  grid-template-rows: auto 1fr;
  min-height: 100vh;
}

.dashboard-header {
  grid-column: 1 / -1;
  padding: 1rem 2rem;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
}

.sidebar {
  padding: 1.5rem;
  background: #f9fafb;
  border-right: 1px solid #e5e7eb;
}

.main-content {
  padding: 2rem;
  overflow-y: auto;
}

/* Responsive: stack on mobile */
@media (max-width: 768px) {
  .dashboard {
    grid-template-columns: 1fr;
  }
  
  .sidebar {
    display: none; /* or convert to drawer */
  }
}
```

### Flexbox for Card Grid

```css
.card-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 1.5rem;
}

.card {
  flex: 1 1 300px; /* grow, shrink, basis */
  min-width: 280px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  padding: 1.5rem;
  transition: transform 0.2s, box-shadow 0.2s;
}

.card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}
```

## Accessible Form Patterns

### Accessible Form with Proper Labels

```html
<form class="contact-form" novalidate>
  <div class="form-group">
    <label for="name">Full Name</label>
    <input
      type="text"
      id="name"
      name="name"
      required
      aria-required="true"
      placeholder="Enter your full name"
    />
    <span class="error-message" role="alert"></span>
  </div>

  <div class="form-group">
    <label for="email">Email Address</label>
    <input
      type="email"
      id="email"
      name="email"
      required
      aria-required="true"
      placeholder="you@example.com"
    />
    <span class="error-message" role="alert"></span>
  </div>

  <div class="form-group">
    <label for="message">Message</label>
    <textarea
      id="message"
      name="message"
      rows="4"
      required
      aria-required="true"
      placeholder="How can we help you?"
    ></textarea>
    <span class="error-message" role="alert"></span>
  </div>

  <button type="submit" class="btn-primary">Send Message</button>
</form>
```

```css
.form-group {
  margin-bottom: 1.5rem;
}

label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: #374151;
}

input,
textarea {
  width: 100%;
  padding: 0.75rem;
  border: 2px solid #e5e7eb;
  border-radius: 6px;
  font-size: 1rem;
  transition: border-color 0.2s;
}

input:focus,
textarea:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

input:invalid,
textarea:invalid {
  border-color: #ef4444;
}

.error-message {
  display: block;
  margin-top: 0.5rem;
  color: #ef4444;
  font-size: 0.875rem;
}

.btn-primary {
  background: #3b82f6;
  color: white;
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 6px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-primary:hover {
  background: #2563eb;
}

.btn-primary:focus {
  outline: none;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.3);
}
```

### Form Validation with JavaScript

```javascript
class FormValidator {
  constructor(form) {
    this.form = form;
    this.inputs = form.querySelectorAll('input, textarea');
    this.init();
  }

  init() {
    this.inputs.forEach(input => {
      input.addEventListener('blur', () => this.validateField(input));
      input.addEventListener('input', () => this.clearError(input));
    });

    this.form.addEventListener('submit', (e) => this.handleSubmit(e));
  }

  validateField(input) {
    const errorSpan = input.parentElement.querySelector('.error-message');
    let isValid = true;
    let errorMessage = '';

    // Required validation
    if (input.required && !input.value.trim()) {
      isValid = false;
      errorMessage = 'This field is required';
    }

    // Email validation
    if (input.type === 'email' && input.value) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(input.value)) {
        isValid = false;
        errorMessage = 'Please enter a valid email address';
      }
    }

    // Min length validation
    if (input.minLength && input.value.length < input.minLength) {
      isValid = false;
      errorMessage = `Minimum ${input.minLength} characters required`;
    }

    // Update UI
    if (!isValid) {
      input.setAttribute('aria-invalid', 'true');
      errorSpan.textContent = errorMessage;
    } else {
      input.setAttribute('aria-invalid', 'false');
      errorSpan.textContent = '';
    }

    return isValid;
  }

  clearError(input) {
    const errorSpan = input.parentElement.querySelector('.error-message');
    if (input.getAttribute('aria-invalid') === 'true') {
      input.setAttribute('aria-invalid', 'false');
      errorSpan.textContent = '';
    }
  }

  handleSubmit(e) {
    e.preventDefault();
    let isFormValid = true;

    this.inputs.forEach(input => {
      if (!this.validateField(input)) {
        isFormValid = false;
      }
    });

    if (isFormValid) {
      // Submit form
      console.log('Form is valid, submitting...');
      this.form.submit();
    }
  }
}

// Usage
document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('.contact-form');
  if (form) {
    new FormValidator(form);
  }
});
```

## Loading States and Feedback

### Skeleton Loading Pattern

```html
<div class="skeleton-card">
  <div class="skeleton-header">
    <div class="skeleton-avatar"></div>
    <div class="skeleton-title"></div>
  </div>
  <div class="skeleton-content">
    <div class="skeleton-line"></div>
    <div class="skeleton-line"></div>
    <div class="skeleton-line short"></div>
  </div>
</div>
```

```css
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.skeleton-card {
  background: #fff;
  border-radius: 8px;
  padding: 1.5rem;
  border: 1px solid #e5e7eb;
}

.skeleton-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
}

.skeleton-avatar,
.skeleton-title,
.skeleton-line {
  background: linear-gradient(
    90deg,
    #f3f4f6 25%,
    #e5e7eb 50%,
    #f3f4f6 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 4px;
}

.skeleton-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
}

.skeleton-title {
  flex: 1;
  height: 20px;
}

.skeleton-line {
  height: 16px;
  margin-bottom: 0.75rem;
}

.skeleton-line.short {
  width: 60%;
}
```

### Button Loading State

```html
<button class="btn" data-loading="false">
  <span class="btn-text">Submit</span>
  <span class="btn-loader" aria-hidden="true">
    <svg class="spinner" viewBox="0 0 50 50">
      <circle
        class="spinner-path"
        cx="25"
        cy="25"
        r="20"
        fill="none"
        stroke-width="5"
      />
    </svg>
  </span>
</button>
```

```css
.btn {
  position: relative;
  padding: 0.75rem 1.5rem;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 1rem;
  cursor: pointer;
  transition: background 0.2s;
}

.btn:hover {
  background: #2563eb;
}

.btn:disabled {
  background: #9ca3af;
  cursor: not-allowed;
}

.btn-loader {
  display: none;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

.btn[data-loading="true"] .btn-text {
  visibility: hidden;
}

.btn[data-loading="true"] .btn-loader {
  display: block;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.spinner {
  width: 20px;
  height: 20px;
  animation: spin 0.8s linear infinite;
}

.spinner-path {
  stroke: currentColor;
  stroke-linecap: round;
  animation: dash 1.5s ease-in-out infinite;
}

@keyframes dash {
  0% {
    stroke-dasharray: 1, 150;
    stroke-dashoffset: 0;
  }
  50% {
    stroke-dasharray: 90, 150;
    stroke-dashoffset: -35;
  }
  100% {
    stroke-dasharray: 90, 150;
    stroke-dashoffset: -124;
  }
}
```

```javascript
function setButtonLoading(button, isLoading) {
  button.setAttribute('data-loading', isLoading);
  button.disabled = isLoading;
}

// Usage
const submitButton = document.querySelector('.btn');
submitButton.addEventListener('click', async () => {
  setButtonLoading(submitButton, true);
  
  try {
    await submitForm();
  } finally {
    setButtonLoading(submitButton, false);
  }
});
```

## Modal/Dialog Pattern

### Accessible Modal

```html
<button class="btn-primary" data-modal-open="example-modal">
  Open Modal
</button>

<div
  class="modal"
  id="example-modal"
  role="dialog"
  aria-modal="true"
  aria-labelledby="modal-title"
  aria-hidden="true"
>
  <div class="modal-overlay" data-modal-close></div>
  <div class="modal-content" role="document">
    <div class="modal-header">
      <h2 id="modal-title">Modal Title</h2>
      <button
        class="modal-close"
        data-modal-close
        aria-label="Close modal"
      >
        <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24">
          <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2"/>
        </svg>
      </button>
    </div>
    <div class="modal-body">
      <p>Modal content goes here...</p>
    </div>
    <div class="modal-footer">
      <button class="btn-secondary" data-modal-close>Cancel</button>
      <button class="btn-primary">Confirm</button>
    </div>
  </div>
</div>
```

```css
.modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.3s, visibility 0.3s;
}

.modal[aria-hidden="false"] {
  opacity: 1;
  visibility: visible;
}

.modal-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(2px);
}

.modal-content {
  position: relative;
  background: #fff;
  border-radius: 12px;
  max-width: 500px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
  transform: scale(0.95);
  transition: transform 0.3s;
}

.modal[aria-hidden="false"] .modal-content {
  transform: scale(1);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.5rem;
  border-bottom: 1px solid #e5e7eb;
}

.modal-body {
  padding: 1.5rem;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  padding: 1.5rem;
  border-top: 1px solid #e5e7eb;
}

.modal-close {
  background: none;
  border: none;
  padding: 0.5rem;
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.2s;
}

.modal-close:hover {
  background: #f3f4f6;
}

.btn-secondary {
  background: #e5e7eb;
  color: #374151;
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-secondary:hover {
  background: #d1d5db;
}
```

```javascript
class Modal {
  constructor(modalElement) {
    this.modal = modalElement;
    this.openButton = document.querySelector(`[data-modal-open="${modalElement.id}"]`);
    this.closeButtons = modalElement.querySelectorAll('[data-modal-close]');
    this.previousActiveElement = null;
    
    this.init();
  }

  init() {
    this.openButton?.addEventListener('click', () => this.open());
    this.closeButtons.forEach(btn => {
      btn.addEventListener('click', () => this.close());
    });
    
    // Close on escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen()) {
        this.close();
      }
    });
    
    // Close on overlay click
    this.modal.querySelector('.modal-overlay').addEventListener('click', () => {
      this.close();
    });
  }

  open() {
    this.previousActiveElement = document.activeElement;
    this.modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    
    // Focus management
    setTimeout(() => {
      this.modal.querySelector('.modal-close').focus();
    }, 100);
  }

  close() {
    this.modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    
    // Restore focus
    if (this.previousActiveElement) {
      this.previousActiveElement.focus();
    }
  }

  isOpen() {
    return this.modal.getAttribute('aria-hidden') === 'false';
  }
}

// Usage
document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('example-modal');
  if (modal) {
    new Modal(modal);
  }
});
```

## Responsive Navigation

### Mobile Navigation with Hamburger Menu

```html
<nav class="navbar">
  <div class="nav-container">
    <a href="#" class="nav-logo">Brand</a>
    
    <button
      class="nav-toggle"
      aria-label="Toggle navigation"
      aria-expanded="false"
    >
      <span class="hamburger"></span>
    </button>
    
    <ul class="nav-menu">
      <li><a href="#" class="nav-link">Home</a></li>
      <li><a href="#" class="nav-link">About</a></li>
      <li><a href="#" class="nav-link">Services</a></li>
      <li><a href="#" class="nav-link">Contact</a></li>
    </ul>
  </div>
</nav>
```

```css
.navbar {
  background: #fff;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  position: sticky;
  top: 0;
  z-index: 100;
}

.nav-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1rem 2rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.nav-logo {
  font-size: 1.5rem;
  font-weight: bold;
  color: #3b82f6;
  text-decoration: none;
}

.nav-toggle {
  display: none;
  background: none;
  border: none;
  padding: 0.5rem;
  cursor: pointer;
}

.hamburger {
  display: block;
  width: 24px;
  height: 2px;
  background: #374151;
  position: relative;
  transition: background 0.3s;
}

.hamburger::before,
.hamburger::after {
  content: '';
  position: absolute;
  width: 24px;
  height: 2px;
  background: #374151;
  transition: transform 0.3s;
}

.hamburger::before {
  top: -8px;
}

.hamburger::after {
  top: 8px;
}

.nav-menu {
  display: flex;
  list-style: none;
  gap: 2rem;
  margin: 0;
  padding: 0;
}

.nav-link {
  color: #374151;
  text-decoration: none;
  font-weight: 500;
  transition: color 0.2s;
}

.nav-link:hover {
  color: #3b82f6;
}

/* Mobile styles */
@media (max-width: 768px) {
  .nav-toggle {
    display: block;
  }
  
  .nav-menu {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: #fff;
    flex-direction: column;
    padding: 1rem 2rem;
    gap: 0;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    transform: translateY(-100%);
    opacity: 0;
    visibility: hidden;
    transition: transform 0.3s, opacity 0.3s;
  }
  
  .nav-menu.active {
    transform: translateY(0);
    opacity: 1;
    visibility: visible;
  }
  
  .nav-link {
    display: block;
    padding: 1rem 0;
    border-bottom: 1px solid #e5e7eb;
  }
  
  .nav-link:last-child {
    border-bottom: none;
  }
  
  /* Animate hamburger */
  .nav-toggle[aria-expanded="true"] .hamburger {
    background: transparent;
  }
  
  .nav-toggle[aria-expanded="true"] .hamburger::before {
    transform: rotate(45deg);
    top: 0;
  }
  
  .nav-toggle[aria-expanded="true"] .hamburger::after {
    transform: rotate(-45deg);
    top: 0;
  }
}
```

```javascript
class MobileNav {
  constructor() {
    this.toggle = document.querySelector('.nav-toggle');
    this.menu = document.querySelector('.nav-menu');
    this.links = document.querySelectorAll('.nav-link');
    
    this.init();
  }

  init() {
    this.toggle.addEventListener('click', () => this.toggleMenu());
    
    // Close menu when clicking a link
    this.links.forEach(link => {
      link.addEventListener('click', () => this.closeMenu());
    });
    
    // Close menu on window resize
    window.addEventListener('resize', () => {
      if (window.innerWidth > 768) {
        this.closeMenu();
      }
    });
  }

  toggleMenu() {
    const isOpen = this.menu.classList.toggle('active');
    this.toggle.setAttribute('aria-expanded', isOpen);
    document.body.style.overflow = isOpen ? 'hidden' : '';
  }

  closeMenu() {
    this.menu.classList.remove('active');
    this.toggle.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }
}

// Usage
document.addEventListener('DOMContentLoaded', () => {
  new MobileNav();
});
```

## Toast Notifications

### Toast Notification System

```html
<div class="toast-container" role="alert" aria-live="polite"></div>
```

```css
.toast-container {
  position: fixed;
  top: 1rem;
  right: 1rem;
  z-index: 2000;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.toast {
  background: #fff;
  border-radius: 8px;
  padding: 1rem 1.5rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 300px;
  animation: slideIn 0.3s ease-out;
}

.toast.success {
  border-left: 4px solid #10b981;
}

.toast.error {
  border-left: 4px solid #ef4444;
}

.toast.warning {
  border-left: 4px solid #f59e0b;
}

.toast.info {
  border-left: 4px solid #3b82f6;
}

.toast-content {
  flex: 1;
}

.toast-title {
  font-weight: 600;
  margin-bottom: 0.25rem;
}

.toast-message {
  font-size: 0.875rem;
  color: #6b7280;
}

.toast-close {
  background: none;
  border: none;
  padding: 0.25rem;
  cursor: pointer;
  color: #9ca3af;
  transition: color 0.2s;
}

.toast-close:hover {
  color: #374151;
}

@keyframes slideIn {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes slideOut {
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(100%);
    opacity: 0;
  }
}
```

```javascript
class ToastManager {
  constructor() {
    this.container = document.querySelector('.toast-container');
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.className = 'toast-container';
      this.container.setAttribute('role', 'alert');
      this.container.setAttribute('aria-live', 'polite');
      document.body.appendChild(this.container);
    }
  }

  show(message, type = 'info', duration = 5000) {
    const toast = this.createToast(message, type);
    this.container.appendChild(toast);

    // Auto dismiss
    if (duration > 0) {
      setTimeout(() => this.dismiss(toast), duration);
    }

    return toast;
  }

  createToast(message, type) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = this.getIcon(type);
    
    toast.innerHTML = `
      <div class="toast-icon">${icon}</div>
      <div class="toast-content">
        <div class="toast-title">${this.capitalize(type)}</div>
        <div class="toast-message">${message}</div>
      </div>
      <button class="toast-close" aria-label="Close notification">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <path d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"/>
        </svg>
      </button>
    `;

    toast.querySelector('.toast-close').addEventListener('click', () => {
      this.dismiss(toast);
    });

    return toast;
  }

  getIcon(type) {
    const icons = {
      success: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>',
      error: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
      warning: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>',
      info: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/></svg>'
    };
    return icons[type] || icons.info;
  }

  dismiss(toast) {
    toast.style.animation = 'slideOut 0.3s ease-out forwards';
    setTimeout(() => {
      toast.remove();
    }, 300);
  }

  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  success(message, duration) {
    return this.show(message, 'success', duration);
  }

  error(message, duration) {
    return this.show(message, 'error', duration);
  }

  warning(message, duration) {
    return this.show(message, 'warning', duration);
  }

  info(message, duration) {
    return this.show(message, 'info', duration);
  }
}

// Usage
const toast = new ToastManager();
toast.success('Operation completed successfully!');
toast.error('Something went wrong. Please try again.');
toast.warning('Your session will expire in 5 minutes.');
toast.info('New feature available!');
```

## Dark Mode Toggle

### Dark Mode Implementation

```html
<button class="theme-toggle" aria-label="Toggle dark mode">
  <span class="theme-icon-sun">☀️</span>
  <span class="theme-icon-moon">🌙</span>
</button>
```

```css
:root {
  --bg-primary: #ffffff;
  --bg-secondary: #f9fafb;
  --text-primary: #111827;
  --text-secondary: #6b7280;
  --border-color: #e5e7eb;
  --accent-color: #3b82f6;
}

[data-theme="dark"] {
  --bg-primary: #111827;
  --bg-secondary: #1f2937;
  --text-primary: #f9fafb;
  --text-secondary: #9ca3af;
  --border-color: #374151;
  --accent-color: #60a5fa;
}

body {
  background: var(--bg-primary);
  color: var(--text-primary);
  transition: background 0.3s, color 0.3s;
}

.theme-toggle {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 50%;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.3s;
}

.theme-toggle:hover {
  background: var(--border-color);
}

.theme-icon-sun,
.theme-icon-moon {
  font-size: 1.25rem;
  display: none;
}

[data-theme="dark"] .theme-icon-moon {
  display: none;
}

[data-theme="dark"] .theme-icon-sun {
  display: block;
}

:not([data-theme="dark"]) .theme-icon-sun {
  display: none;
}

:not([data-theme="dark"]) .theme-icon-moon {
  display: block;
}
```

```javascript
class ThemeManager {
  constructor() {
    this.toggle = document.querySelector('.theme-toggle');
    this.prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
    this.init();
  }

  init() {
    // Load saved theme or use system preference
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      this.setTheme(savedTheme);
    } else if (this.prefersDark.matches) {
      this.setTheme('dark');
    }

    // Toggle button
    this.toggle?.addEventListener('click', () => this.toggleTheme());

    // Listen for system preference changes
    this.prefersDark.addEventListener('change', (e) => {
      if (!localStorage.getItem('theme')) {
        this.setTheme(e.matches ? 'dark' : 'light');
      }
    });
  }

  setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }

  toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    this.setTheme(newTheme);
  }
}

// Usage
document.addEventListener('DOMContentLoaded', () => {
  new ThemeManager();
});
```

## Accessibility Utilities

### Skip Navigation Link

```html
<a href="#main-content" class="skip-link">
  Skip to main content
</a>

<main id="main-content">
  <!-- Main content -->
</main>
```

```css
.skip-link {
  position: absolute;
  top: -40px;
  left: 0;
  background: #3b82f6;
  color: white;
  padding: 8px 16px;
  text-decoration: none;
  z-index: 100;
  transition: top 0.3s;
}

.skip-link:focus {
  top: 0;
}
```

### Focus Management

```javascript
class FocusManager {
  static trapFocus(container) {
    const focusableElements = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];

    container.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        if (e.shiftKey) {
          if (document.activeElement === firstFocusable) {
            lastFocusable.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === lastFocusable) {
            firstFocusable.focus();
            e.preventDefault();
          }
        }
      }
    });
  }

  static setInitialFocus(container) {
    const focusable = container.querySelector(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    focusable?.focus();
  }
}
```

These patterns provide practical implementations of common UI/UX concepts. Use them as starting points and adapt to your specific needs.
