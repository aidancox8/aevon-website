(function(){
  function tick(){
    const root = document.querySelector('.dashboard');
    if(!root) return;
    const metrics = root.querySelectorAll('.db-mv');
    if(metrics.length >= 3){
      const rev = 48200 + Math.floor(Math.random()*900);
      metrics[0].textContent = '$' + (rev/1000).toFixed(1) + 'k';
      metrics[1].textContent = String(20 + Math.floor(Math.random()*8));
      metrics[2].textContent = String(8 + Math.floor(Math.random()*4));
    }
    const bars = root.querySelectorAll('.db-bar');
    if(bars.length){
      const b = bars[Math.floor(Math.random()*bars.length)];
      const h = 35 + Math.floor(Math.random()*55);
      b.style.transition = 'height .8s ease';
      b.style.height = h + '%';
    }
    if(Math.random() < 0.45){
      const feed = root.querySelector('.db-feed');
      if(feed){
        const events = [
          { col:'#a78bfa', text:'Invoice #4821 paid' },
          { col:'#4ade80', text:'New onboarding completed' },
          { col:'#6366F1', text:'Stock reorder triggered' },
          { col:'#f59e0b', text:'Ticket #312 escalated' },
          { col:'#a78bfa', text:'Knowledge article published' }
        ];
        const e = events[Math.floor(Math.random()*events.length)];
        const div = document.createElement('div');
        div.className = 'db-fi';
        div.style.cssText = 'opacity:0; transform:translateY(-6px); transition:opacity .4s, transform .4s';
        div.innerHTML = '<div class="db-fi-dot" style="background:'+e.col+'"></div><div class="db-fi-text">'+e.text+'</div><div class="db-fi-time">now</div>';
        feed.insertBefore(div, feed.firstChild);
        requestAnimationFrame(function(){ div.style.opacity='1'; div.style.transform='none'; });
        const items = feed.querySelectorAll('.db-fi');
        if(items.length > 5) items[items.length-1].remove();
      }
    }
  }
  setInterval(tick, 2400);
})();
