/**
 * Library Circulation Platform - Client Enhancements
 * Pure Vanilla JavaScript for fast, progressive enhancement
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Circulation Desk: Live Diagnostic Checker
  const memberInput = document.getElementById('issueMemberId');
  const barcodeInput = document.getElementById('issueBarcode');
  const checkStatusBox = document.getElementById('eligibilityDiagnostic');

  const runEligibilityCheck = async () => {
    if (!memberInput || !barcodeInput || !checkStatusBox) return;
    const memberId = memberInput.value.trim();
    const barcode = barcodeInput.value.trim();

    if (memberId.length >= 3 && barcode.length >= 3) {
      checkStatusBox.style.display = 'block';
      checkStatusBox.innerHTML = '<span class="status-badge status-neutral">Evaluating Circulation Eligibility...</span>';

      try {
        const res = await fetch(`/api/eligibility?memberId=${encodeURIComponent(memberId)}&barcode=${encodeURIComponent(barcode)}`);
        const data = await res.json();

        if (data.eligible) {
          checkStatusBox.innerHTML = `
            <div class="alert alert-success" style="margin-top: 10px; margin-bottom: 0;">
              <strong>✓ Eligible for Issue:</strong> ${data.member.name} (${data.member.memberId}) · Copy: ${data.copy.barcode} (${data.copy.shelfLocation})
            </div>`;
        } else {
          const listItems = data.failureReasons.map(r => `<li>${r}</li>`).join('');
          checkStatusBox.innerHTML = `
            <div class="alert alert-danger" style="margin-top: 10px; margin-bottom: 0;">
              <strong>✕ Issue Blocked:</strong>
              <ul style="margin-left: 20px; margin-top: 4px;">${listItems}</ul>
            </div>`;
        }
      } catch (err) {
        checkStatusBox.innerHTML = '<div class="alert alert-warning" style="margin-top:10px; margin-bottom:0;">Could not evaluate eligibility asynchronously.</div>';
      }
    } else {
      checkStatusBox.style.display = 'none';
    }
  };

  if (memberInput && barcodeInput) {
    memberInput.addEventListener('input', debounce(runEligibilityCheck, 400));
    barcodeInput.addEventListener('input', debounce(runEligibilityCheck, 400));
  }

  // 2. Desk Focus Management
  const returnInput = document.getElementById('returnBarcode');
  if (returnInput && document.activeElement === document.body) {
    returnInput.focus();
  }

  // 3. Confirmation Dialogs on Destructive Actions
  document.querySelectorAll('[data-confirm]').forEach(el => {
    el.addEventListener('click', (e) => {
      const msg = el.getAttribute('data-confirm') || 'Are you sure you want to perform this circulation action?';
      if (!confirm(msg)) {
        e.preventDefault();
      }
    });
  });
});

// Utility Debounce
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}
