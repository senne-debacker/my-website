import { RARITIES, FISH_SPECIES, FISH_BY_ID, fishInRarity, formatWeight } from './fishDatabase.js'

// The fish logbook: which species you have caught, how many, and the heaviest of each. Saved in
// localStorage, so it survives reloads. Two parts: createLogbookStore is the bookkeeping (no DOM,
// checked in tests/fishing.check.mjs), createLogbook is the screen (#logbook in index.html).

const STORAGE_KEY = 'wake.logbook'

// localStorage can be missing or throw (private windows, blocked site data): then the book simply
// is not remembered.
function browserStorage() {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function createLogbookStore(storage = browserStorage()) {
  const caught = new Map() // species id -> { count, best (kg) }
  try {
    const saved = JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null')
    for (const [id, entry] of Object.entries(saved?.fish ?? {})) {
      // Only species that still exist, with sane numbers.
      if (FISH_BY_ID.has(id) && Number.isFinite(entry?.count) && entry.count > 0 && Number.isFinite(entry.best) && entry.best > 0) {
        caught.set(id, { count: Math.floor(entry.count), best: entry.best })
      }
    }
  } catch {
    // unreadable: start with an empty book
  }
  const save = () => {
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify({ version: 1, fish: Object.fromEntries(caught) }))
    } catch {
      // not saved
    }
  }

  return {
    get: (id) => caught.get(id) ?? null,
    species: () => caught.size,
    total: () => [...caught.values()].reduce((sum, entry) => sum + entry.count, 0),

    // Writes a catch into the book. isNew: the first one of its species; isRecord: heavier than the
    // best one so far (a first catch is not called a record).
    record({ id, weight }) {
      if (!FISH_BY_ID.has(id)) throw new Error(`Unknown fish "${id}"`)
      const entry = caught.get(id) ?? { count: 0, best: 0 }
      const isNew = entry.count === 0
      const isRecord = !isNew && weight > entry.best
      caught.set(id, { count: entry.count + 1, best: Math.max(entry.best, weight) })
      save()
      return { isNew, isRecord }
    },

    clear() {
      caught.clear()
      save()
    },
  }
}

// The logbook screen: every species as a tile (a black silhouette until you have caught one), grouped
// by rarity, and a detail panel for the selected one. `onClose` is called when it has been closed.
// Esc and B close it; they are stopped in the capture phase so the game does not see them.
export function createLogbook({ onClose, storage } = {}) {
  const store = createLogbookStore(storage)
  const $ = (id) => document.getElementById(id)
  const root = $('logbook')
  const grid = $('logbook-grid')
  const closeButton = $('logbook-close')
  const detail = { image: $('detail-image'), name: $('detail-name'), rarity: $('detail-rarity'), stats: $('detail-stats'), text: $('detail-text') }
  const tiles = new Map() // species id -> its button
  let selected = FISH_SPECIES[0].id
  let open = false

  // Built once; refresh() only changes classes and text afterwards.
  for (const [rarity, info] of Object.entries(RARITIES)) {
    const group = document.createElement('section')
    group.className = 'logbook-group'
    group.style.setProperty('--rarity', info.colour)
    const heading = document.createElement('h3')
    heading.append(info.label)
    const count = document.createElement('small')
    count.dataset.rarity = rarity
    heading.append(count)
    const list = document.createElement('div')
    list.className = 'logbook-tiles'
    for (const fish of fishInRarity(rarity)) {
      const tile = document.createElement('button')
      tile.type = 'button'
      tile.className = 'tile'
      tile.dataset.id = fish.id
      const image = document.createElement('span')
      image.className = 'tile-image'
      image.innerHTML = fish.imgUrl // our own static SVG strings (fishDatabase.js)
      const name = document.createElement('span')
      name.className = 'tile-name'
      tile.append(image, name)
      list.append(tile)
      tiles.set(fish.id, tile)
    }
    group.append(heading, list)
    grid.append(group)
  }

  function refresh() {
    for (const [id, tile] of tiles) {
      const entry = store.get(id)
      tile.classList.toggle('locked', !entry)
      tile.classList.toggle('selected', id === selected)
      tile.querySelector('.tile-name').textContent = entry ? FISH_BY_ID.get(id).name : '???'
    }
    for (const count of grid.querySelectorAll('small[data-rarity]')) {
      const species = fishInRarity(count.dataset.rarity)
      count.textContent = `${species.filter((fish) => store.get(fish.id)).length} / ${species.length}`
    }
    $('logbook-count').textContent = `${store.species()} / ${FISH_SPECIES.length} species`

    const fish = FISH_BY_ID.get(selected)
    const entry = store.get(selected)
    const info = RARITIES[fish.rarity]
    $('logbook-detail').style.setProperty('--rarity', info.colour)
    detail.image.innerHTML = fish.imgUrl
    detail.image.classList.toggle('locked', !entry)
    detail.name.textContent = entry ? fish.name : '???'
    detail.rarity.textContent = info.label
    detail.stats.textContent = entry
      ? `Caught ${entry.count} × · Best ${formatWeight(entry.best)} · Range ${formatWeight(fish.weight[0])} to ${formatWeight(fish.weight[1])}`
      : 'Not caught yet'
    detail.text.textContent = entry ? fish.description : 'Catch one to learn what it is.'
  }

  grid.addEventListener('click', (event) => {
    const tile = event.target.closest('.tile')
    if (!tile) return
    selected = tile.dataset.id
    refresh()
  })

  function close() {
    if (!open) return
    open = false
    removeEventListener('keydown', onKeyDown, true)
    root.classList.remove('show')
    closeButton.blur()
    onClose?.()
  }
  function onKeyDown(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (event.code === 'Escape' || (event.key.length === 1 && event.key.toLowerCase() === 'b')) {
      event.preventDefault()
      event.stopImmediatePropagation()
      if (!event.repeat) close()
    }
  }
  closeButton.addEventListener('click', close)
  root.addEventListener('pointerdown', (event) => event.target === root && close()) // a click on the dim area

  refresh()

  return {
    store,
    get isOpen() {
      return open
    },
    // Records a catch (see createLogbookStore) and updates the screen.
    record(entry) {
      const result = store.record(entry)
      selected = entry.id
      refresh()
      return result
    },
    open() {
      if (open) return
      open = true
      refresh()
      root.classList.add('show')
      closeButton.focus({ preventScroll: true })
      addEventListener('keydown', onKeyDown, true)
    },
    close,
    toggle() {
      if (open) close()
      else this.open()
    },
  }
}
