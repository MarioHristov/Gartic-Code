<!-- static/js/landing.js -->
// Avatar selection and nickname shuffle
const fileInput     = document.getElementById('avatarUpload');
const previewImg    = document.getElementById('avatarPreview');
const hiddenPreset  = document.getElementById('avatarPreset');
const prevBtn       = document.getElementById('prevAvatar');
const nextBtn       = document.getElementById('nextAvatar');
const shuffleBtn    = document.getElementById('nickname-button');
const nicknameInput = document.querySelector('.nickname-input');

let currentIndex = 0;

function updatePreviewFromPreset() {
  const fname = window.presetFilenames[currentIndex];
  const url   = window.avatarBaseUrl + fname;
  previewImg.src      = url;
  hiddenPreset.value  = fname;
  fileInput.value     = '';
}

prevBtn.addEventListener('click', () => {
  currentIndex = (currentIndex > 0) ? currentIndex - 1 : window.presetFilenames.length - 1;
  updatePreviewFromPreset();
});
nextBtn.addEventListener('click', () => {
  currentIndex = (currentIndex < window.presetFilenames.length - 1) ? currentIndex + 1 : 0;
  updatePreviewFromPreset();
});

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (!file) return;
  const objectUrl = URL.createObjectURL(file);
  previewImg.src = objectUrl;
  previewImg.onload = () => URL.revokeObjectURL(objectUrl);
  hiddenPreset.value = '';
});

function generateRandomNum(begin, end) {
  return Math.round(Math.random() * end) + begin;
}

function pickWeighted(items) {
  const totalWeight = items.reduce((sum, it) => sum + it.weight, 0);
  let rand = Math.random() * totalWeight;
  for (let it of items) {
    if (rand < it.weight) return it.name;
    rand -= it.weight;
  }
}

function generateAttribute() {
  const attrs = [
    { name: "Geek",         weight: 10000 },
    { name: "Brogrammer",   weight: 10000 },
    { name: "CodingMonkey", weight: 10000 },
    { name: "JLongMa",      weight: 9500  },
    { name: "Hacker",       weight: 8000  },
    { name: "LockedIN",     weight: 7000  },
    { name: "Neo",          weight: 6500  },
    { name: "Barista",      weight: 5500  },
    { name: "BratNZ",       weight: 5000  },
    { name: "Niggammer",    weight:    5  },
    { name: "NiggaPremium", weight:    5  }
  ];
  return pickWeighted(attrs);
}

function shuffleName() {
  nicknameInput.value = generateAttribute() + generateRandomNum(0,456);
}

// Initialize on load
window.addEventListener('DOMContentLoaded', () => {
  shuffleName();
  updatePreviewFromPreset();
});