const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const quotes = [
  'They may be only a part of our lives, but to them, we are their whole world.',
  'A little food, a little kindness, a little love — sometimes, that means everything.',
  'You might not change the whole world, but you can change the whole world for one animal.',
  'Kindness has four paws, a wet nose, and a thousand ways to touch your heart.',
  "Home isn't complete until a little paw leaves prints on your heart.",
  "You don't need four paws to make a difference. You just need a heart that cares.",
  'Every paw deserves love. Every life deserves a chance.',
  'A happy animal makes a brighter world.'
];
$('#year').textContent = new Date().getFullYear();
const nav = $('#mainNav'), menuToggle = $('#menuToggle');
menuToggle.addEventListener('click', () => {
  const opened = nav.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(opened));
  menuToggle.setAttribute('aria-label', opened ? 'Close navigation' : 'Open navigation');
});
$$('#mainNav a').forEach(a => a.addEventListener('click', () => {
  nav.classList.remove('open'); menuToggle.setAttribute('aria-expanded','false');
}));

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  window.setTimeout(() => el.classList.remove('show'), 4200);
}
function setMessage(form, message, ok) {
  const el = $('.form-message', form);
  el.textContent = message;
  el.className = `form-message ${ok ? 'success' : 'error'}`;
}
async function request(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}
function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function petCard(pet) {
  return `<article class="pet-card">
    <span class="species-pill">${escapeHTML(pet.species)} · ${escapeHTML(pet.sex)}</span>
    <img src="${escapeHTML(pet.image_url)}" alt="${escapeHTML(pet.name)} the ${escapeHTML(pet.species.toLowerCase())}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1543466835-00a7907e9de1?auto=format&fit=crop&w=700&q=80'">
    <div class="pet-card-body"><h3>${escapeHTML(pet.name)}</h3><p class="pet-meta">${escapeHTML(pet.age)} · ${escapeHTML(pet.city)}</p>
    <button class="button adopt-button" data-pet="${Number(pet.id)}">Ask about ${escapeHTML(pet.name)}</button></div>
  </article>`;
}
async function loadPets() {
  const grid = $('#petGrid');
  try {
    const pets = await request('/api/pets');
    grid.innerHTML = pets.length ? pets.map(petCard).join('') : '<p>No pets are listed at the moment. Please check again later.</p>';
    $$('.adopt-button', grid).forEach(btn => btn.addEventListener('click', () => showAdoptionForm(pets.find(p => p.id === Number(btn.dataset.pet)))));
  } catch {
    grid.innerHTML = '<p>We could not load pet listings. Check that the PawCare server is running and refresh.</p>';
  }
}
function showAdoptionForm(pet) {
  if (!pet) return;
  const dialog = $('#petDialog');
  $('#petDialogContent').innerHTML = `
    <img src="${escapeHTML(pet.image_url)}" alt="${escapeHTML(pet.name)}">
    <h2>Meet ${escapeHTML(pet.name)}</h2>
    <p>${escapeHTML(pet.description)}</p>
    <p class="pet-meta">${escapeHTML(pet.species)} · ${escapeHTML(pet.age)} · ${escapeHTML(pet.city)}</p>
    <form id="adoptionForm">
      <input type="hidden" name="petId" value="${Number(pet.id)}">
      <label>Your name *<input name="name" required maxlength="100"></label>
      <label>Email *<input type="email" name="email" required maxlength="254"></label>
      <label>Phone *<input name="phone" required maxlength="30"></label>
      <label>Home type *<select name="housing" required><option value="">Choose</option><option>House</option><option>Apartment</option><option>Other</option></select></label>
      <label>Tell us about your home and pet-care plans *<textarea name="message" required maxlength="1200" rows="3"></textarea></label>
      <button class="button full-width" type="submit">Send Adoption Enquiry</button>
      <p class="form-message" aria-live="polite"></p>
    </form>`;
  dialog.showModal();
  $('#adoptionForm').addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.currentTarget, button = $('button[type=submit]', form);
    button.disabled = true;
    try {
      const result = await request('/api/adoption-requests', {method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(form))),headers:{'Content-Type':'application/json'}});
      setMessage(form,result.message,true); form.reset(); toast(result.message);
    } catch(err) { setMessage(form,err.message,false); }
    finally { button.disabled = false; }
  });
}
$('#petDialog').addEventListener('click', e => {
  if (e.target === $('#petDialog')) $('#petDialog').close();
});
async function wireForm(formId, url, multipart = false) {
  const form = $(formId);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const button = $('button[type="submit"]', form);
    button.disabled = true;
    const oldText = button.textContent;
    button.textContent = 'Sending…';
    try {
      const body = multipart ? new FormData(form) : JSON.stringify(Object.fromEntries(new FormData(form)));
      const result = await request(url, {method:'POST',body, ...(multipart ? {} : {headers:{'Content-Type':'application/json'}})});
      setMessage(form, result.message, true);
      form.reset();
      toast(result.message);
    } catch(err) {
      setMessage(form, err.message, false);
    } finally {
      button.disabled = false;
      button.textContent = oldText;
    }
  });
}
wireForm('#reportForm','/api/reports',true);
wireForm('#volunteerForm','/api/volunteers');
wireForm('#donationForm','/api/donations');

$('#mapForm').addEventListener('submit', e => {
  e.preventDefault();
  const location = $('#mapLocation').value.trim();
  const type = $('#mapType').value;
  if (!location) return;
  const query = `${type} near ${location}`;
  window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`,'_blank','noopener,noreferrer');
});

let quoteIndex = 0;
$('#nextQuote').addEventListener('click', () => {
  quoteIndex = (quoteIndex + 1) % quotes.length;
  $('.footer-quote p:last-of-type').textContent = `“${quotes[quoteIndex]}”`;
  toast('A little PawCare reminder for your day 🐾');
});
loadPets();
