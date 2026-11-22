// The clinic contact form on health.html and health-demo.html.
// Same endpoint as the home page form. page: location.pathname says which page it came from.
(function () {
  var form = document.getElementById('clinic-form');
  if (!form) return;
  var err = document.getElementById('c-err');
  var btn = document.getElementById('c-send');
  var ref = new URLSearchParams(location.search).get('ref') || '';
  var EMAIL_RE = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/;
  function finish() {
    form.hidden = true;
    var done = document.getElementById('clinic-done'); done.hidden = false;
    done.focus({ preventScroll: true });
    done.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  form.addEventListener('input', function () { err.textContent = ''; });
  // A text box appears when "Other" or "Something else" is chosen.
  var emrSel = document.getElementById('c-emr'), emrWrap = document.getElementById('c-emr-other-wrap');
  var elseBox = document.getElementById('c-interest-else'), elseWrap = document.getElementById('c-interest-other-wrap');
  function showOther(focus) {
    var a = emrSel.value === 'Other', b = elseBox.checked;
    if (focus && a && emrWrap.hidden) { emrWrap.hidden = false; document.getElementById('c-emr-other').focus(); }
    if (focus && b && elseWrap.hidden) { elseWrap.hidden = false; document.getElementById('c-interest-other').focus(); }
    emrWrap.hidden = !a; elseWrap.hidden = !b;
  }
  emrSel.addEventListener('change', function () { showOther(true); });
  elseBox.addEventListener('change', function () { showOther(true); });
  showOther(false);
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    err.textContent = '';
    var name = document.getElementById('c-name').value.trim();
    var email = document.getElementById('c-email').value.trim();
    if (!name || !email || !EMAIL_RE.test(email)) { err.textContent = 'A name and a valid email, and I can reply.'; return; }
    if (document.getElementById('c-website').value) { finish(); return; }
    var clinic = document.getElementById('c-clinic').value.trim();
    var emr = document.getElementById('c-emr').value;
    var emrOther = document.getElementById('c-emr-other').value.trim();
    if (emr === 'Other' && emrOther) emr = 'Other: ' + emrOther;
    var elseText = document.getElementById('c-interest-other').value.trim();
    var interest = Array.from(document.querySelectorAll('input[name=c-interest]:checked')).map(function (c) {
      return c.value === 'Something else' && elseText ? 'Something else: ' + elseText : c.value;
    }).join(', ');
    var msg = document.getElementById('c-msg').value.trim();
    btn.disabled = true; btn.textContent = 'Sending...';
    fetch('https://qzxtfgzpyptvriorfhxw.supabase.co/functions/v1/interest', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, email: email, phone: '',
        message: ['Aevon Health enquiry', clinic ? 'Clinic: ' + clinic : '', emr ? 'EMR: ' + emr : '',
          interest ? 'Interested in: ' + interest : '', msg].filter(Boolean).join('\n\n'),
        page: location.pathname, ref: ref })
    }).then(function (res) {
      if (!res.ok) throw new Error('status ' + res.status);
      finish();
    }).catch(function () {
      btn.disabled = false; btn.textContent = 'Send';
      err.innerHTML = 'That did not send. Email <a href="mailto:hello@aevon.ca">hello@aevon.ca</a> and I will pick it up.';
    });
  });
})();
