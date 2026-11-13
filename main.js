/* Pew Pew — background field and small page behaviours.
   The background is a shader: a picture drawn live by code.
   It drifts slowly, and shifts as you scroll and move the pointer. */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- reveal text as it enters the screen ---- */
  var items = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !reduceMotion) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.2, rootMargin: '0px 0px -8% 0px' });
    items.forEach(function (el) { io.observe(el); });
  } else {
    items.forEach(function (el) { el.classList.add('is-in'); });
  }

  /* ---- small logo in the top bar appears after the hero ---- */
  function onScrollFlag() {
    root.classList.toggle('scrolled', window.scrollY > window.innerHeight * 0.6);
  }
  window.addEventListener('scroll', onScrollFlag, { passive: true });
  onScrollFlag();

  /* ---- shader background ---- */
  var canvas = document.getElementById('field');
  var gl = canvas && (canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' }));
  if (!gl) { if (canvas) canvas.style.display = 'none'; return; }

  var VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';

  var FRAG = [
    'precision highp float;',
    'uniform vec2 uRes;',
    'uniform float uTime;',
    'uniform float uScroll;',   // 0 at top, 1 at bottom of page
    'uniform vec2 uPointer;',   // 0..1, eased
    '',
    'float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}',
    'float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);',
    '  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}',
    'float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.03+vec2(11.7,3.1);a*=.5;}return v;}',
    '',
    'void main(){',
    '  vec2 uv=gl_FragCoord.xy/uRes.xy;',
    '  vec2 p=(gl_FragCoord.xy-.5*uRes.xy)/min(uRes.x,uRes.y);',
    '  float t=uTime*.035;',
    '  p.y+=uScroll*1.6;',                                   // travel through the field while scrolling
    '  vec2 m=(uPointer-.5)*.35;',
    '  vec2 q=vec2(fbm(p*1.1+vec2(t,-t*.6)+m),fbm(p*1.1+vec2(-t*.8,t)+4.2-m));',
    '  float warp=1.2+uScroll*1.4;',                         // the folds tighten further down the page
    '  float f=fbm(p*1.3+q*warp+vec2(0.,t*.5));',
    '  float ridge=smoothstep(.38,.78,f);',
    '  float line=1.-smoothstep(0.,.018,abs(fract(f*7.+uScroll*2.)-.5)-.47);', // faint contour lines
    '  vec3 black=vec3(.059,.059,.055);',
    '  vec3 lift=vec3(.125,.120,.110);',
    '  vec3 warm=vec3(.945,.933,.902);',
    '  vec3 col=mix(black,lift,ridge);',
    '  col+=warm*line*.022*ridge;',
    '  col+=warm*.03*pow(ridge,3.)*(.5+.5*sin(t*3.+f*6.));',
    '  float vig=smoothstep(1.25,.25,length(uv-.5)*1.5);',
    '  col=mix(black,col,vig);',
    '  col+=(hash(gl_FragCoord.xy+fract(uTime))-.5)*.012;',  // film grain, stops colour banding
    '  gl_FragColor=vec4(col,1.);',
    '}'
  ].join('\n');

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }
  var vs = compile(gl.VERTEX_SHADER, VERT);
  var fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) { canvas.style.display = 'none'; return; }
  var prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { canvas.style.display = 'none'; return; }
  gl.useProgram(prog);

  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  var uRes = gl.getUniformLocation(prog, 'uRes');
  var uTime = gl.getUniformLocation(prog, 'uTime');
  var uScroll = gl.getUniformLocation(prog, 'uScroll');
  var uPointer = gl.getUniformLocation(prog, 'uPointer');

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var w = Math.round(window.innerWidth * dpr);
    var h = Math.round(window.innerHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  }
  window.addEventListener('resize', resize);
  resize();

  var scrollTarget = 0, scrollNow = 0;
  var ptrTarget = [0.5, 0.5], ptrNow = [0.5, 0.5];

  function readScroll() {
    var max = document.documentElement.scrollHeight - window.innerHeight;
    scrollTarget = max > 0 ? window.scrollY / max : 0;
  }
  window.addEventListener('scroll', readScroll, { passive: true });
  readScroll();

  window.addEventListener('pointermove', function (e) {
    ptrTarget[0] = e.clientX / window.innerWidth;
    ptrTarget[1] = 1 - e.clientY / window.innerHeight;
  }, { passive: true });

  var start = performance.now();
  var running = true;

  function draw(now) {
    scrollNow += (scrollTarget - scrollNow) * 0.06;   // eased, so scrolling feels soft
    ptrNow[0] += (ptrTarget[0] - ptrNow[0]) * 0.04;
    ptrNow[1] += (ptrTarget[1] - ptrNow[1]) * 0.04;
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, reduceMotion ? 12.0 : (now - start) / 1000);
    gl.uniform1f(uScroll, reduceMotion ? scrollTarget : scrollNow);
    gl.uniform2f(uPointer, ptrNow[0], ptrNow[1]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function loop(now) {
    if (!running) return;
    draw(now);
    requestAnimationFrame(loop);
  }

  if (reduceMotion) {
    // One still frame, redrawn only when the page moves.
    draw(performance.now());
    window.addEventListener('scroll', function () { draw(performance.now()); }, { passive: true });
    window.addEventListener('resize', function () { draw(performance.now()); });
  } else {
    document.addEventListener('visibilitychange', function () {
      running = !document.hidden;
      if (running) requestAnimationFrame(loop);
    });
    requestAnimationFrame(loop);
  }
})();
