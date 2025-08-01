// logout.js
document.querySelectorAll('a[href="logout.php"]').forEach(btn => {
  btn.addEventListener('click', function(e) {
    e.preventDefault();
    localStorage.removeItem('userEmail');
    window.location.href = '/loginchoice.html';
  });
});
