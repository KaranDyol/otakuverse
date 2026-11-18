/**
 * OtakuVerse — Core Application Logic
 * Powered by AniList GraphQL & The Movie Database (TMDB) API
 */

const TMDB_API_KEY = '5f6e3cfab072b566194a1445cb24b34b';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';
const TMDB_BACKDROP_BASE = 'https://image.tmdb.org/t/p/original';
const ANILIST_API_URL = 'https://graphql.anilist.co';

// State
let allItems = [];
let displayedItems = [];
let currentCategory = 'all'; // 'all' | 'anime' | 'kdrama' | 'watchlist'
let currentGenre = 'all';
let currentSearchQuery = '';
let activeModalItem = null;
let watchlist = JSON.parse(localStorage.getItem('otakuverse_watchlist') || '[]');

// DOM Elements
const loadingGrid = document.getElementById('loading-grid');
const cardsGrid = document.getElementById('cards-grid');
const emptyState = document.getElementById('empty-state');
const searchInput = document.getElementById('search-input');
const clearSearchBtn = document.getElementById('clear-search-btn');
const sectionTitle = document.getElementById('section-title');
const sectionDesc = document.getElementById('section-desc');
const itemsCountLabel = document.getElementById('items-count-label');
const watchlistBadge = document.getElementById('watchlist-badge');
const mobileWatchlistBadge = document.getElementById('mobile-watchlist-badge');

// Modal Elements
const detailsModal = document.getElementById('details-modal');
const modalBackdropImg = document.getElementById('modal-backdrop-img');
const modalPoster = document.getElementById('modal-poster');
const modalTitle = document.getElementById('modal-title');
const modalNativeTitle = document.getElementById('modal-native-title');
const modalTypeBadge = document.getElementById('modal-type-badge');
const modalYear = document.getElementById('modal-year');
const modalStatus = document.getElementById('modal-status');
const modalScore = document.getElementById('modal-score');
const modalGenres = document.getElementById('modal-genres');
const modalSynopsis = document.getElementById('modal-synopsis');
const modalTrailerBtn = document.getElementById('modal-trailer-btn');
const modalAddWatchlistBtn = document.getElementById('modal-add-watchlist-btn');
const modalExternalLink = document.getElementById('modal-external-link');
const modalTrailerWrapper = document.getElementById('modal-trailer-wrapper');
const modalTrailerFrame = document.getElementById('modal-trailer-frame');

// Hero Spotlight Elements
const heroBackdrop = document.getElementById('hero-backdrop');
const heroType = document.getElementById('hero-type');
const heroScore = document.getElementById('hero-score');
const heroTitle = document.getElementById('hero-title');
const heroOverview = document.getElementById('hero-overview');
const heroDetailsBtn = document.getElementById('hero-details-btn');
const heroWatchlistBtn = document.getElementById('hero-watchlist-btn');

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
  renderSkeleton();
  updateWatchlistBadge();
  setupSearch();
  loadData();
});

// --- Data Fetching ---

// 1. Fetch Anime from AniList (GraphQL)
async function fetchTrendingAnime() {
  const query = `
    query {
      Page(page: 1, perPage: 24) {
        media(type: ANIME, sort: TRENDING_DESC) {
          id
          title {
            romaji
            english
            native
          }
          coverImage {
            large
            extraLarge
          }
          bannerImage
          description(asHtml: false)
          averageScore
          genres
          seasonYear
          status
          format
          episodes
          trailer {
            id
            site
          }
          siteUrl
        }
      }
    }
  `;

  try {
    const response = await fetch(ANILIST_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ query })
    });
    const result = await response.json();
    const mediaList = result.data?.Page?.media || [];
    
    return mediaList.map(item => ({
      id: `anime-${item.id}`,
      originalId: item.id,
      type: 'anime',
      title: item.title.english || item.title.romaji,
      nativeTitle: item.title.native || item.title.romaji,
      poster: item.coverImage.extraLarge || item.coverImage.large,
      backdrop: item.bannerImage || item.coverImage.extraLarge,
      score: item.averageScore ? (item.averageScore / 10).toFixed(1) : 'N/A',
      year: item.seasonYear || 'N/A',
      status: item.status || 'Finished',
      genres: item.genres || [],
      overview: item.description ? item.description.replace(/<[^>]*>?/gm, '') : 'No synopsis available.',
      trailerId: item.trailer?.site === 'youtube' ? item.trailer.id : null,
      externalUrl: item.siteUrl,
      episodes: item.episodes ? `${item.episodes} Ep` : 'TV'
    }));
  } catch (error) {
    console.error('Error fetching AniList anime:', error);
    return [];
  }
}

// 2. Fetch Korean Dramas from TMDB
async function fetchTrendingKDramas() {
  try {
    const url = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&with_original_language=ko&sort_by=popularity.desc&page=1`;
    const response = await fetch(url);
    const data = await response.json();
    const results = data.results || [];

    // Map TMDB genre IDs to standard names
    const tmdbGenreMap = {
      18: 'Drama',
      35: 'Comedy',
      10759: 'Action',
      10765: 'Fantasy',
      9648: 'Mystery',
      10749: 'Romance',
      80: 'Crime'
    };

    return results.map(item => ({
      id: `kdrama-${item.id}`,
      originalId: item.id,
      type: 'kdrama',
      title: item.name,
      nativeTitle: item.original_name,
      poster: item.poster_path ? `${TMDB_IMAGE_BASE}${item.poster_path}` : 'https://placehold.co/400x600/161f33/8b5cf6?text=No+Poster',
      backdrop: item.backdrop_path ? `${TMDB_BACKDROP_BASE}${item.backdrop_path}` : (item.poster_path ? `${TMDB_IMAGE_BASE}${item.poster_path}` : ''),
      score: item.vote_average ? item.vote_average.toFixed(1) : 'N/A',
      year: item.first_air_date ? item.first_air_date.split('-')[0] : 'N/A',
      status: 'Series',
      genres: (item.genre_ids || []).map(id => tmdbGenreMap[id] || 'Drama').filter((v, i, a) => a.indexOf(v) === i),
      overview: item.overview || 'No synopsis available for this Korean drama.',
      trailerId: null, // Will fetch on demand if clicked
      externalUrl: `https://www.themoviedb.org/tv/${item.id}`,
      episodes: 'Series'
    }));
  } catch (error) {
    console.error('Error fetching TMDB K-Dramas:', error);
    return [];
  }
}

// Search Across Both Platforms
async function searchAll(query) {
  loadingGrid.classList.remove('hidden');
  cardsGrid.classList.add('hidden');
  emptyState.classList.add('hidden');

  const [animeResults, kdramaResults] = await Promise.all([
    searchAniList(query),
    searchTMDBKDramas(query)
  ]);

  allItems = interleaveArrays(animeResults, kdramaResults);
  applyFilters();
}

async function searchAniList(search) {
  const query = `
    query ($search: String) {
      Page(page: 1, perPage: 12) {
        media(type: ANIME, search: $search, sort: POPULARITY_DESC) {
          id
          title { romaji english native }
          coverImage { large extraLarge }
          bannerImage
          description(asHtml: false)
          averageScore
          genres
          seasonYear
          status
          siteUrl
        }
      }
    }
  `;
  try {
    const res = await fetch(ANILIST_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { search } })
    });
    const data = await res.json();
    return (data.data?.Page?.media || []).map(item => ({
      id: `anime-${item.id}`,
      originalId: item.id,
      type: 'anime',
      title: item.title.english || item.title.romaji,
      nativeTitle: item.title.native || item.title.romaji,
      poster: item.coverImage.extraLarge || item.coverImage.large,
      backdrop: item.bannerImage || item.coverImage.extraLarge,
      score: item.averageScore ? (item.averageScore / 10).toFixed(1) : 'N/A',
      year: item.seasonYear || 'N/A',
      status: item.status || 'Finished',
      genres: item.genres || [],
      overview: item.description ? item.description.replace(/<[^>]*>?/gm, '') : 'No synopsis available.',
      trailerId: null,
      externalUrl: item.siteUrl,
      episodes: 'TV'
    }));
  } catch {
    return [];
  }
}

async function searchTMDBKDramas(query) {
  try {
    const url = `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&page=1`;
    const res = await fetch(url);
    const data = await res.json();
    return (data.results || []).map(item => ({
      id: `kdrama-${item.id}`,
      originalId: item.id,
      type: 'kdrama',
      title: item.name,
      nativeTitle: item.original_name,
      poster: item.poster_path ? `${TMDB_IMAGE_BASE}${item.poster_path}` : 'https://placehold.co/400x600/161f33/8b5cf6?text=No+Poster',
      backdrop: item.backdrop_path ? `${TMDB_BACKDROP_BASE}${item.backdrop_path}` : '',
      score: item.vote_average ? item.vote_average.toFixed(1) : 'N/A',
      year: item.first_air_date ? item.first_air_date.split('-')[0] : 'N/A',
      status: 'Series',
      genres: ['Drama'],
      overview: item.overview || 'No synopsis available.',
      trailerId: null,
      externalUrl: `https://www.themoviedb.org/tv/${item.id}`,
      episodes: 'Series'
    }));
  } catch {
    return [];
  }
}

// Master Load Data
async function loadData() {
  loadingGrid.classList.remove('hidden');
  cardsGrid.classList.add('hidden');
  emptyState.classList.add('hidden');

  const [anime, kdramas] = await Promise.all([
    fetchTrendingAnime(),
    fetchTrendingKDramas()
  ]);

  allItems = interleaveArrays(anime, kdramas);
  
  if (allItems.length > 0) {
    updateHeroSpotlight(allItems[0]);
  }
  
  applyFilters();
}

// Interleave two lists so anime and kdrama alternate nicely
function interleaveArrays(arr1, arr2) {
  const result = [];
  const maxLen = Math.max(arr1.length, arr2.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < arr1.length) result.push(arr1[i]);
    if (i < arr2.length) result.push(arr2[i]);
  }
  return result;
}

// --- Filtering & Categories ---

function switchCategory(cat) {
  currentCategory = cat;
  
  // Update desktop nav
  ['all', 'anime', 'kdrama', 'watchlist'].forEach(c => {
    const el = document.getElementById(`nav-${c}`);
    if (el) {
      if (c === cat) {
        el.className = 'nav-btn active px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-200';
      } else {
        el.className = 'nav-btn px-4 py-1.5 rounded-full text-xs font-semibold text-slate-400 hover:text-white transition-all duration-200 flex items-center gap-1.5';
      }
    }
  });

  // Update mobile nav
  ['all', 'anime', 'kdrama'].forEach(c => {
    const el = document.getElementById(`m-nav-${c}`);
    if (el) {
      if (c === cat) {
        el.className = 'm-nav-btn active whitespace-nowrap px-3 py-1 text-xs rounded-lg font-medium';
      } else {
        el.className = 'm-nav-btn whitespace-nowrap px-3 py-1 text-xs rounded-lg font-medium text-slate-400';
      }
    }
  });

  // Update Headings
  if (cat === 'all') {
    sectionTitle.innerHTML = '🔥 Trending Anime & K-Dramas';
    sectionDesc.textContent = 'Top popular anime and trending Korean dramas right now';
    document.getElementById('hero-spotlight').classList.remove('hidden');
  } else if (cat === 'anime') {
    sectionTitle.innerHTML = '🎌 Popular Anime';
    sectionDesc.textContent = 'Latest trending Japanese animations and series from AniList';
    document.getElementById('hero-spotlight').classList.remove('hidden');
  } else if (cat === 'kdrama') {
    sectionTitle.innerHTML = '🌸 Popular Korean Dramas';
    sectionDesc.textContent = 'Binge-worthy romance, thriller, and mystery K-dramas from TMDB';
    document.getElementById('hero-spotlight').classList.remove('hidden');
  } else if (cat === 'watchlist') {
    sectionTitle.innerHTML = '📌 My Watchlist';
    sectionDesc.textContent = 'Your saved anime and dramas stored locally in your browser';
    document.getElementById('hero-spotlight').classList.add('hidden');
  }

  applyFilters();
}

function filterGenre(genre) {
  currentGenre = genre;
  document.querySelectorAll('.genre-pill').forEach(btn => {
    if (btn.textContent.trim().toLowerCase() === genre.toLowerCase() || (genre === 'all' && btn.textContent.includes('All'))) {
      btn.className = 'genre-pill active px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-purple-600 text-white border border-purple-500 transition-all';
    } else {
      btn.className = 'genre-pill px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-900/60 text-slate-400 hover:text-white border border-slate-800 transition-all';
    }
  });
  applyFilters();
}

function resetFilters() {
  currentCategory = 'all';
  currentGenre = 'all';
  searchInput.value = '';
  currentSearchQuery = '';
  clearSearchBtn.classList.add('hidden');
  switchCategory('all');
  filterGenre('all');
  loadData();
}

function applyFilters() {
  let list = [];
  
  if (currentCategory === 'watchlist') {
    list = [...watchlist];
  } else if (currentCategory === 'anime') {
    list = allItems.filter(item => item.type === 'anime');
  } else if (currentCategory === 'kdrama') {
    list = allItems.filter(item => item.type === 'kdrama');
  } else {
    list = [...allItems];
  }

  // Apply genre filter
  if (currentGenre !== 'all') {
    list = list.filter(item => 
      item.genres && item.genres.some(g => g.toLowerCase().includes(currentGenre.toLowerCase()))
    );
  }

  displayedItems = list;
  renderCards(displayedItems);
}

// --- Render Functions ---

function renderSkeleton() {
  loadingGrid.innerHTML = '';
  for (let i = 0; i < 12; i++) {
    const card = document.createElement('div');
    card.className = 'flex flex-col space-y-2';
    card.innerHTML = `
      <div class="skeleton aspect-[2/3] w-full rounded-2xl"></div>
      <div class="skeleton h-3.5 w-3/4 rounded-md"></div>
      <div class="skeleton h-2.5 w-1/2 rounded-md"></div>
    `;
    loadingGrid.appendChild(card);
  }
}

function renderCards(items) {
  loadingGrid.classList.add('hidden');
  cardsGrid.innerHTML = '';
  
  itemsCountLabel.textContent = `${items.length} titles`;

  if (items.length === 0) {
    cardsGrid.classList.add('hidden');
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  cardsGrid.classList.remove('hidden');

  items.forEach(item => {
    const isSaved = isItemInWatchlist(item.id);
    const card = document.createElement('div');
    card.className = 'media-card group relative flex flex-col cursor-pointer bg-brand-surface rounded-2xl border border-slate-800/80 overflow-hidden';
    card.onclick = () => openDetailsModal(item);

    const typeColor = item.type === 'anime' 
      ? 'bg-purple-600/90 text-white' 
      : 'bg-pink-600/90 text-white';

    card.innerHTML = `
      <!-- Poster Image -->
      <div class="relative aspect-[2/3] w-full overflow-hidden bg-slate-900">
        <img 
          src="${item.poster}" 
          alt="${escapeHtml(item.title)}" 
          loading="lazy" 
          class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          onerror="this.src='https://placehold.co/400x600/161f33/8b5cf6?text=No+Poster'"
        >
        
        <!-- Score Badge -->
        <div class="absolute top-2.5 left-2.5 z-10 flex items-center gap-1 bg-black/70 backdrop-blur-md px-2 py-0.5 rounded-lg text-amber-400 font-bold text-[11px] border border-white/10">
          <i class="ph-fill ph-star text-amber-400"></i> ${item.score}
        </div>

        <!-- Type Tag -->
        <div class="absolute top-2.5 right-2.5 z-10 ${typeColor} font-bold text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md shadow-md">
          ${item.type === 'anime' ? 'Anime' : 'K-Drama'}
        </div>

        <!-- Hover Overlay with Bookmark button -->
        <div class="poster-overlay absolute inset-0 bg-gradient-to-t from-brand-dark via-transparent to-transparent opacity-0 transition-opacity duration-300 flex items-end justify-between p-3">
          <button 
            onclick="event.stopPropagation(); toggleWatchlist('${item.id}');" 
            class="w-8 h-8 rounded-full ${isSaved ? 'bg-purple-600 text-white' : 'bg-slate-900/80 text-slate-300 hover:text-white'} flex items-center justify-center border border-white/10 backdrop-blur-md transition-all active:scale-90"
            title="${isSaved ? 'Remove from Watchlist' : 'Add to Watchlist'}"
          >
            <i class="${isSaved ? 'ph-fill' : 'ph-bold'} ph-bookmark-simple"></i>
          </button>
        </div>
      </div>

      <!-- Card Info -->
      <div class="p-3 space-y-1 flex flex-col flex-grow">
        <h3 class="text-xs sm:text-sm font-bold text-white line-clamp-1 group-hover:text-purple-400 transition-colors">
          ${escapeHtml(item.title)}
        </h3>
        <div class="flex items-center justify-between text-[11px] text-slate-400 pt-0.5">
          <span>${item.year}</span>
          <span class="truncate max-w-[90px] text-slate-500">${item.genres[0] || 'Drama'}</span>
        </div>
      </div>
    `;

    cardsGrid.appendChild(card);
  });
}

// Hero Spotlight Update
function updateHeroSpotlight(item) {
  if (!item) return;
  heroBackdrop.style.backgroundImage = `url(${item.backdrop || item.poster})`;
  heroType.textContent = item.type === 'anime' ? 'Featured Anime' : 'Featured K-Drama';
  heroScore.innerHTML = `<i class="ph-fill ph-star"></i> ${item.score}`;
  heroTitle.textContent = item.title;
  heroOverview.textContent = item.overview;
  
  heroDetailsBtn.onclick = () => openDetailsModal(item);
  heroWatchlistBtn.onclick = () => toggleWatchlist(item.id);
  
  const isSaved = isItemInWatchlist(item.id);
  heroWatchlistBtn.innerHTML = isSaved 
    ? `<i class="ph-fill ph-check text-purple-400 text-base"></i> In Watchlist`
    : `<i class="ph-bold ph-plus text-base"></i> Add to List`;
}

// --- Modal Logic ---

async function openDetailsModal(item) {
  activeModalItem = item;
  stopTrailer();

  modalBackdropImg.src = item.backdrop || item.poster;
  modalPoster.src = item.poster;
  modalTitle.textContent = item.title;
  modalNativeTitle.textContent = item.nativeTitle || '';
  modalTypeBadge.textContent = item.type === 'anime' ? 'Anime' : 'Korean Drama';
  modalTypeBadge.className = item.type === 'anime'
    ? 'px-2.5 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/30'
    : 'px-2.5 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider bg-pink-500/20 text-pink-300 border border-pink-500/30';

  modalYear.textContent = item.year;
  modalStatus.textContent = item.status;
  modalScore.innerHTML = `<i class="ph-fill ph-star"></i> <span>${item.score}</span>`;
  modalSynopsis.textContent = item.overview;
  modalExternalLink.href = item.externalUrl || '#';

  // Render Genres
  modalGenres.innerHTML = (item.genres || []).map(g => 
    `<span class="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">${g}</span>`
  ).join('');

  // Update watchlist button state
  updateModalWatchlistBtn();

  // If TMDB K-drama, attempt to fetch YouTube trailer ID dynamically
  if (item.type === 'kdrama' && !item.trailerId) {
    try {
      const vidRes = await fetch(`https://api.themoviedb.org/3/tv/${item.originalId}/videos?api_key=${TMDB_API_KEY}`);
      const vidData = await vidRes.json();
      const trailer = (vidData.results || []).find(v => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'));
      if (trailer) {
        item.trailerId = trailer.key;
      }
    } catch (e) {
      console.log('No video trailer found:', e);
    }
  }

  // Trailer button display
  modalTrailerBtn.innerHTML = `<i class="ph-fill ph-play text-sm"></i> Watch Trailer`;

  detailsModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeDetailsModal() {
  stopTrailer();
  detailsModal.classList.add('hidden');
  document.body.style.overflow = '';
}

function playTrailer() {
  if (!activeModalItem) return;

  if (activeModalItem.trailerId) {
    modalTrailerFrame.src = `https://www.youtube.com/embed/${activeModalItem.trailerId}?autoplay=1`;
    modalTrailerWrapper.classList.remove('hidden');
  } else {
    // Open YouTube search in new tab if direct trailer not found
    const query = encodeURIComponent(`${activeModalItem.title} trailer`);
    window.open(`https://www.youtube.com/results?search_query=${query}`, '_blank');
  }
}

function stopTrailer() {
  modalTrailerFrame.src = '';
  modalTrailerWrapper.classList.add('hidden');
}

// Close on backdrop click
detailsModal.addEventListener('click', (e) => {
  if (e.target === detailsModal) {
    closeDetailsModal();
  }
});

// Close on Esc key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !detailsModal.classList.contains('hidden')) {
    closeDetailsModal();
  }
});

// --- Watchlist Management ---

function isItemInWatchlist(id) {
  return watchlist.some(item => item.id === id);
}

function toggleWatchlist(id) {
  const item = allItems.find(i => i.id === id) || (activeModalItem && activeModalItem.id === id ? activeModalItem : null);
  if (!item) return;

  const index = watchlist.findIndex(i => i.id === id);
  if (index > -1) {
    watchlist.splice(index, 1);
  } else {
    watchlist.unshift(item);
  }

  localStorage.setItem('otakuverse_watchlist', JSON.stringify(watchlist));
  updateWatchlistBadge();
  
  if (currentCategory === 'watchlist') {
    applyFilters();
  } else {
    renderCards(displayedItems);
  }
}

function toggleModalWatchlist() {
  if (!activeModalItem) return;
  toggleWatchlist(activeModalItem.id);
  updateModalWatchlistBtn();
}

function updateModalWatchlistBtn() {
  if (!activeModalItem) return;
  const isSaved = isItemInWatchlist(activeModalItem.id);
  if (isSaved) {
    modalAddWatchlistBtn.innerHTML = `<i class="ph-fill ph-check text-purple-400 text-sm"></i> <span>Saved to Watchlist</span>`;
    modalAddWatchlistBtn.classList.add('border-purple-500/50', 'bg-purple-900/20');
  } else {
    modalAddWatchlistBtn.innerHTML = `<i class="ph-bold ph-bookmark-simple text-sm"></i> <span>Add to Watchlist</span>`;
    modalAddWatchlistBtn.classList.remove('border-purple-500/50', 'bg-purple-900/20');
  }
}

function updateWatchlistBadge() {
  const count = watchlist.length;
  watchlistBadge.textContent = count;
  mobileWatchlistBadge.textContent = count;
}

// --- Search Handler ---

let searchDebounceTimer;
function setupSearch() {
  searchInput.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    currentSearchQuery = val;

    if (val.length > 0) {
      clearSearchBtn.classList.remove('hidden');
    } else {
      clearSearchBtn.classList.add('hidden');
    }

    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      if (val.length >= 2) {
        searchAll(val);
      } else if (val.length === 0) {
        loadData();
      }
    }, 450);
  });
}

function clearSearch() {
  searchInput.value = '';
  currentSearchQuery = '';
  clearSearchBtn.classList.add('hidden');
  loadData();
}

// Helper to escape HTML characters
function escapeHtml(string) {
  const div = document.createElement('div');
  div.textContent = string;
  return div.innerHTML;
}
