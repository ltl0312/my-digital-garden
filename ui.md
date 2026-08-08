<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lumina • Luxurious Digital Garden</title>

  <!-- Tailwind CSS -->
  <script src="https://cdn.tailwindcss.com"></script>

  <!-- Vue 3 CDN -->
  <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>

  <!-- Lucide Icons -->
  <script src="https://unpkg.com/lucide@latest"></script>

  <!-- Google Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;1,6..72,400&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">

  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          fontFamily: {
            sans: ['"Plus Jakarta Sans"', 'Inter', 'sans-serif'],
            serif: ['"Newsreader"', 'Georgia', 'serif'],
            mono: ['"JetBrains Mono"', 'monospace'],
          },
          colors: {
            garden: {
              50: '#f0fdf4',
              100: '#dcfce7',
              200: '#bbf7d0',
              300: '#86efac',
              400: '#4ade80',
              500: '#22c55e',
              600: '#16a34a',
              700: '#15803d',
              800: '#166534',
              900: '#14532d',
              950: '#052e16',
            },
            obsidian: {
              950: '#05080e',
              900: '#0B0F17',
              800: '#111827',
              700: '#1F293D',
              600: '#2D3B55',
            }
          },
          animation: {
            'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            'float': 'float 6s ease-in-out infinite',
            'glow': 'glow 2s ease-in-out infinite alternate',
          },
          keyframes: {
            float: {
              '0%, 100%': { transform: 'translateY(0px)' },
              '50%': { transform: 'translateY(-6px)' },
            },
            glow: {
              '0%': { opacity: '0.4', filter: 'drop-shadow(0 0 8px rgba(34, 197, 94, 0.4))' },
              '100%': { opacity: '0.8', filter: 'drop-shadow(0 0 16px rgba(34, 197, 94, 0.8))' }
            }
          }
        }
      }
    }
  </script>

  <style>
    /* Custom Scrollbar */
    ::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    ::-webkit-scrollbar-track {
      background: transparent;
    }
    ::-webkit-scrollbar-thumb {
      background: rgba(156, 163, 175, 0.3);
      border-radius: 9999px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: rgba(156, 163, 175, 0.5);
    }

​    /* Glassmorphism Cards - Dual Theme Adaptability */
​    .glass-card {
​      background: rgba(255, 255, 255, 0.75);
​      backdrop-filter: blur(16px);
​      -webkit-backdrop-filter: blur(16px);
​      border: 1px solid rgba(0, 0, 0, 0.08);
​      box-shadow: 0 10px 30px -5px rgba(0, 0, 0, 0.04), 0 4px 12px -2px rgba(0, 0, 0, 0.02);
​    }

​    .dark .glass-card {
​      background: rgba(17, 24, 39, 0.65);
​      backdrop-filter: blur(16px);
​      -webkit-backdrop-filter: blur(16px);
​      border: 1px solid rgba(255, 255, 255, 0.08);
​      box-shadow: 0 10px 30px -5px rgba(0, 0, 0, 0.5);
​    }

​    /* Glassmorphism Header */
​    .glass-header {
​      background: rgba(255, 255, 255, 0.82);
​      backdrop-filter: blur(20px);
​      -webkit-backdrop-filter: blur(20px);
​      border-bottom: 1px solid rgba(0, 0, 0, 0.08);
​    }

​    .dark .glass-header {
​      background: rgba(11, 15, 23, 0.82);
​      backdrop-filter: blur(20px);
​      -webkit-backdrop-filter: blur(20px);
​      border-bottom: 1px solid rgba(255, 255, 255, 0.07);
​    }

​    /* Wiki-Links Styling - Luminous Green in both themes */
​    .wiki-link {
​      color: #15803d;
​      background: rgba(34, 197, 94, 0.12);
​      padding: 2px 7px;
​      border-radius: 6px;
​      border-bottom: 1.5px solid rgba(22, 163, 74, 0.4);
​      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
​      cursor: pointer;
​      font-weight: 600;
​      display: inline-flex;
​      align-items: center;
​      gap: 4px;
​    }

​    .dark .wiki-link {
​      color: #4ade80;
​      background: rgba(74, 222, 128, 0.12);
​      border-bottom-color: rgba(74, 222, 128, 0.4);
​    }

​    .wiki-link:hover {
​      background: rgba(34, 197, 94, 0.22);
​      border-bottom-color: #16a34a;
​      transform: translateY(-1px);
​      box-shadow: 0 4px 12px rgba(34, 197, 94, 0.2);
​    }

​    .dark .wiki-link:hover {
​      background: rgba(74, 222, 128, 0.25);
​      border-bottom-color: #4ade80;
​    }

​    /* Selection highlight */
​    ::selection {
​      background: rgba(34, 197, 94, 0.25);
​      color: #15803d;
​    }

​    .dark ::selection {
​      background: rgba(34, 197, 94, 0.35);
​      color: #86efac;
​    }

​    /* Luminous Ambient Background Mesh */
​    .bg-mesh {
​      background-color: #f8fafc;
​      background-image: 
​        radial-gradient(at 0% 0%, rgba(34, 197, 94, 0.09) 0px, transparent 50%),
​        radial-gradient(at 100% 0%, rgba(99, 102, 241, 0.08) 0px, transparent 50%),
​        radial-gradient(at 50% 100%, rgba(16, 185, 129, 0.06) 0px, transparent 50%);
​    }

​    .dark .bg-mesh {
​      background-color: #0B0F17;
​      background-image: 
​        radial-gradient(at 0% 0%, rgba(34, 197, 94, 0.08) 0px, transparent 50%),
​        radial-gradient(at 100% 0%, rgba(99, 102, 241, 0.06) 0px, transparent 50%),
​        radial-gradient(at 50% 100%, rgba(16, 185, 129, 0.05) 0px, transparent 50%);
​    }
  </style>
</head>

<body class="text-slate-800 dark:text-slate-200 antialiased font-sans min-h-screen bg-mesh transition-colors duration-300 overflow-hidden" id="app">

  <!-- APP CONTAINER -->
  <div class="flex flex-col h-screen overflow-hidden relative">

​    <!-- 1. TOP NAVBAR -->
    <header class="glass-header h-16 px-5 flex items-center justify-between z-30 shrink-0 select-none">

​      <!-- Brand Logo & Title -->
      <div class="flex items-center space-x-3 cursor-pointer group" @click="setLayout('split')">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-garden-400 to-emerald-600 dark:from-garden-400 dark:to-emerald-700 flex items-center justify-center text-slate-950 shadow-lg shadow-garden-500/20 group-hover:scale-105 transition-transform duration-300">
          <i data-lucide="sprout" class="w-5 h-5 stroke-[2.5]"></i>
        </div>
        <div>
          <div class="flex items-center space-x-2">
            <span class="font-bold text-lg tracking-tight text-slate-900 dark:text-white group-hover:text-garden-600 dark:group-hover:text-garden-400 transition-colors">Lumina</span>
            <span class="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full bg-garden-500/10 text-garden-700 dark:text-garden-400 border border-garden-500/20 font-semibold">Garden v2.6</span>
          </div>
          <p class="text-xs text-slate-500 dark:text-slate-400 -mt-0.5 font-light">Non-linear Knowledge Sanctuary</p>
        </div>
      </div>

​      <!-- Quick Command Bar Trigger -->
      <div class="hidden md:flex items-center cursor-pointer bg-slate-100/80 hover:bg-slate-200/80 dark:bg-obsidian-800/80 dark:hover:bg-obsidian-700/80 border border-slate-200 dark:border-white/10 hover:border-garden-500/40 px-4 py-2 rounded-full w-80 text-slate-500 dark:text-slate-400 text-sm transition-all duration-200 shadow-inner group"
           @click="showCommandPalette = true">
        <i data-lucide="search" class="w-4 h-4 mr-2.5 text-slate-400 group-hover:text-garden-600 dark:group-hover:text-garden-400 transition-colors"></i>
        <span class="flex-1 font-light">Search notes, tags, ideas...</span>
        <kbd class="text-[11px] font-mono bg-white dark:bg-obsidian-900/80 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded border border-slate-200 dark:border-white/10 shadow-sm">⌘K</kbd>
      </div>

​      <!-- Actions & Layout Controls -->
      <div class="flex items-center space-x-2">
        <!-- Layout Toggle Group -->
        <div class="bg-slate-200/70 dark:bg-obsidian-800/90 border border-slate-300/60 dark:border-white/10 p-1 rounded-xl flex items-center space-x-1 shadow-sm">
          <button @click="setLayout('reader')" 
                  :class="activeLayout === 'reader' ? 'bg-garden-500 text-slate-950 font-semibold shadow-md' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-white/5'"
                  class="px-3 py-1.5 rounded-lg text-xs flex items-center space-x-1.5 transition-all duration-200"
                  title="Article Reader Mode">
            <i data-lucide="book-open" class="w-3.5 h-3.5"></i>
            <span class="hidden sm:inline">Article</span>
          </button>

​          <button @click="setLayout('split')" 
​                  :class="activeLayout === 'split' ? 'bg-garden-500 text-slate-950 font-semibold shadow-md' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-white/5'"
​                  class="px-3 py-1.5 rounded-lg text-xs flex items-center space-x-1.5 transition-all duration-200"
​                  title="Split Reader & Graph">
​            <i data-lucide="columns" class="w-3.5 h-3.5"></i>
​            <span class="hidden sm:inline">Split</span>
​          </button>

​          <button @click="setLayout('graph')" 
​                  :class="activeLayout === 'graph' ? 'bg-garden-500 text-slate-950 font-semibold shadow-md' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-white/5'"
​                  class="px-3 py-1.5 rounded-lg text-xs flex items-center space-x-1.5 transition-all duration-200"
​                  title="Interactive Graph Mode">
​            <i data-lucide="share-2" class="w-3.5 h-3.5"></i>
​            <span class="hidden sm:inline">Graph</span>
​          </button>
​        </div>

        <div class="h-5 w-[1px] bg-slate-300 dark:bg-white/10 mx-1"></div>

​        <!-- Theme Toggle Button -->
​        <button @click="toggleTheme" 
​                class="w-9 h-9 rounded-xl glass-card flex items-center justify-center text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:border-garden-500/50 transition-all duration-200 active:scale-95"
​                title="Toggle Garden Theme">
​          <i :data-lucide="isDark ? 'sun' : 'moon'" class="w-4 h-4 text-garden-600 dark:text-garden-400"></i>
​        </button>

​        <!-- Sidebar Toggle (Mobile / Desktop) -->
​        <button @click="isSidebarOpen = !isSidebarOpen" 
​                class="w-9 h-9 rounded-xl glass-card flex items-center justify-center text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:border-garden-500/50 transition-all duration-200 active:scale-95">
​          <i data-lucide="sidebar" class="w-4 h-4"></i>
​        </button>
​      </div>
​    </header>

​    <!-- 2. MAIN BODY (LAYOUT ENGINE) -->
    <div class="flex-1 flex overflow-hidden relative">

​      <!-- A. LEFT NAVIGATION SIDEBAR -->
      <aside :class="[isSidebarOpen ? 'translate-x-0 w-80' : '-translate-x-full w-0 md:translate-x-0 md:w-0 lg:w-80']"
             class="transition-all duration-300 ease-out glass-card border-y-0 border-l-0 z-20 flex flex-col shrink-0 overflow-hidden">

​        <!-- Sidebar Search Header -->
        <div class="p-4 border-b border-slate-200/80 dark:border-white/10 space-y-3">
          <div class="relative">
            <input type="text" 
                   v-model="searchQuery" 
                   placeholder="Filter notes..." 
                   class="w-full bg-slate-100/90 dark:bg-obsidian-900/90 border border-slate-200 dark:border-white/10 rounded-xl px-3.5 py-2 pl-9 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-garden-500/60 focus:ring-1 focus:ring-garden-500/30 transition-all">
            <i data-lucide="filter" class="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400 dark:text-slate-500"></i>
            <button v-if="searchQuery" @click="searchQuery = ''" class="absolute right-3 top-2.5 text-slate-400 hover:text-slate-700 dark:hover:text-white text-xs">✕</button>
          </div>

​          <!-- Growth Stage Pills Filter -->
          <div class="flex items-center justify-between text-[11px] font-medium text-slate-500 dark:text-slate-400 pt-1">
            <span class="uppercase tracking-wider text-[10px] text-slate-400 dark:text-slate-500 font-bold">Stage</span>
            <div class="flex space-x-1">
              <button @click="selectedStage = 'all'" 
                      :class="selectedStage === 'all' ? 'text-garden-700 dark:text-garden-400 bg-garden-500/15 border-garden-500/40 font-semibold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 bg-slate-100 dark:bg-white/5 border-transparent'"
                      class="px-2.5 py-0.5 rounded-full border transition-all">All</button>
              <button @click="selectedStage = 'seedling'" 
                      :class="selectedStage === 'seedling' ? 'text-amber-700 dark:text-amber-400 bg-amber-500/15 border-amber-500/40 font-semibold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 bg-slate-100 dark:bg-white/5 border-transparent'"
                      class="px-2.5 py-0.5 rounded-full border transition-all">🌱</button>
              <button @click="selectedStage = 'growing'" 
                      :class="selectedStage === 'growing' ? 'text-sky-700 dark:text-sky-400 bg-sky-500/15 border-sky-500/40 font-semibold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 bg-slate-100 dark:bg-white/5 border-transparent'"
                      class="px-2.5 py-0.5 rounded-full border transition-all">🌿</button>
              <button @click="selectedStage = 'evergreen'" 
                      :class="selectedStage === 'evergreen' ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-500/15 border-emerald-500/40 font-semibold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 bg-slate-100 dark:bg-white/5 border-transparent'"
                      class="px-2.5 py-0.5 rounded-full border transition-all">🌳</button>
            </div>
          </div>
​        </div>

​        <!-- Folder Tree & Note List -->
        <div class="flex-1 overflow-y-auto p-3 space-y-4">

​          <!-- Folder Category Sections -->
          <div v-for="(folder, folderName) in groupedNotes" :key="folderName" class="space-y-1">
            <div @click="toggleFolder(folderName)" 
                 class="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-white/5 cursor-pointer select-none transition-colors group">
              <div class="flex items-center space-x-2">
                <i :data-lucide="collapsedFolders[folderName] ? 'folder' : 'folder-open'" class="w-3.5 h-3.5 text-garden-600 dark:text-garden-400 group-hover:scale-110 transition-transform"></i>
                <span>{{ folderName }}</span>
              </div>
              <span class="text-[10px] bg-slate-200 dark:bg-white/5 px-2 py-0.5 rounded-full text-slate-500 dark:text-slate-400 font-mono">{{ folder.length }}</span>
            </div>

​            <!-- Notes List inside Folder -->
            <div v-show="!collapsedFolders[folderName]" class="pl-3 space-y-0.5 border-l border-slate-200 dark:border-white/5 ml-4 my-1">
              <div v-for="note in folder" 
                   :key="note.id" 
                   @click="selectNote(note)"
                   :class="[currentNote.id === note.id ? 'bg-garden-500/15 text-garden-800 dark:text-garden-300 border-l-2 border-garden-500 font-semibold pl-3' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-white/5 pl-2.5']"
                   class="py-2 pr-2 rounded-r-lg text-xs cursor-pointer transition-all duration-150 flex items-center justify-between group">
                <span class="truncate max-w-[170px]">{{ note.title }}</span>
                <span class="text-[10px] opacity-70 group-hover:opacity-100 transition-opacity">{{ getStageIcon(note.stage) }}</span>
              </div>
            </div>
​          </div>

​          <!-- Tags Cloud Widget -->
          <div class="pt-4 border-t border-slate-200/80 dark:border-white/10">
            <span class="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-bold block px-2 mb-2">Garden Tags</span>
            <div class="flex flex-wrap gap-1.5 px-1">
              <span v-for="tag in allTags" 
                    :key="tag.name"
                    @click="filterByTag(tag.name)"
                    :class="activeTagFilter === tag.name ? 'bg-garden-500 text-slate-950 font-bold shadow-sm' : 'bg-slate-200/60 dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-slate-200'"
                    class="text-[11px] px-2.5 py-1 rounded-md cursor-pointer transition-all flex items-center space-x-1">
                <span>#{{ tag.name }}</span>
                <span class="text-[9px] opacity-60">({{ tag.count }})</span>
              </span>
            </div>
          </div>

​        </div>

​        <!-- Sidebar Footer Status -->
        <div class="p-3 border-t border-slate-200 dark:border-white/10 text-xs text-slate-500 flex items-center justify-between bg-slate-100/60 dark:bg-obsidian-900/50">
          <div class="flex items-center space-x-2">
            <span class="w-2 h-2 rounded-full bg-garden-500 animate-pulse"></span>
            <span class="font-medium text-slate-600 dark:text-slate-400">Vault Synced</span>
          </div>
          <span class="font-mono text-[10px] text-slate-400">{{ notes.length }} Notes</span>
        </div>
​      </aside>

​      <!-- B. MAIN ARTICLE READER & GRAPH VIEW AREA -->
      <main class="flex-1 flex overflow-hidden relative">

​        <!-- 1. ARTICLE READER PANEL -->
        <div v-show="activeLayout === 'reader' || activeLayout === 'split'" 
             :class="[activeLayout === 'split' ? 'w-full md:w-1/2 lg:w-7/12 border-r border-slate-200 dark:border-white/10' : 'w-full']"
             class="h-full overflow-y-auto relative scroll-smooth flex flex-col">

​          <!-- Top Reading Progress Indicator -->
          <div class="sticky top-0 left-0 right-0 h-1 bg-slate-200 dark:bg-white/5 z-20">
            <div class="h-full bg-gradient-to-r from-garden-500 to-emerald-500 dark:from-garden-400 dark:to-emerald-400 transition-all duration-150" :style="{ width: readingProgress + '%' }"></div>
          </div>

​          <!-- Note Content Wrapper -->
          <div class="max-w-3xl w-full mx-auto px-6 md:px-12 py-10 flex-1">

​            <!-- Breadcrumbs & Category -->
            <div class="flex items-center space-x-2 text-xs text-slate-500 dark:text-slate-400 mb-6 font-mono">
              <span class="hover:text-garden-600 dark:hover:text-garden-400 cursor-pointer" @click="activeTagFilter = ''">Garden Vault</span>
              <span>/</span>
              <span class="text-garden-700 dark:text-garden-400 font-medium">{{ currentNote.category || 'Uncategorized' }}</span>
            </div>

​            <!-- Article Header -->
            <div class="space-y-4 mb-8 border-b border-slate-200 dark:border-white/10 pb-8">
              <div class="flex flex-wrap items-center gap-2">
                <!-- Stage Badge -->
                <span :class="getStageBadgeClass(currentNote.stage)" 
                      class="px-3 py-1 rounded-full text-xs font-semibold border flex items-center space-x-1.5 shadow-sm">
                  <span>{{ getStageIcon(currentNote.stage) }}</span>
                  <span class="capitalize">{{ currentNote.stage }}</span>
                </span>

​                <!-- Date -->
​                <span class="text-xs text-slate-600 dark:text-slate-400 flex items-center space-x-1 bg-slate-100 dark:bg-white/5 px-3 py-1 rounded-full border border-slate-200 dark:border-white/5">
​                  <i data-lucide="calendar" class="w-3 h-3 mr-1"></i>
​                  {{ currentNote.updatedAt }}
​                </span>

​                <!-- Reading Time -->
​                <span class="text-xs text-slate-600 dark:text-slate-400 flex items-center space-x-1 bg-slate-100 dark:bg-white/5 px-3 py-1 rounded-full border border-slate-200 dark:border-white/5">
​                  <i data-lucide="clock" class="w-3 h-3 mr-1"></i>
​                  {{ currentNote.readingTime }} min read
​                </span>
​              </div>

​              <!-- Main Title -->
              <h1 class="text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight font-sans">
                {{ currentNote.title }}
              </h1>

​              <!-- Tags list -->
              <div class="flex flex-wrap gap-1.5 pt-2">
                <span v-for="tag in currentNote.tags" :key="tag" 
                      @click="filterByTag(tag)"
                      class="text-xs font-medium text-garden-800 dark:text-garden-300 bg-garden-500/10 hover:bg-garden-500/20 border border-garden-500/20 px-2.5 py-0.5 rounded-full cursor-pointer transition-colors">
                  #{{ tag }}
                </span>
              </div>
​            </div>

​            <!-- Table of Contents floating widget -->
            <div v-if="currentNote.toc && currentNote.toc.length" class="mb-8 p-4 rounded-2xl glass-card text-xs">
              <div class="font-bold text-slate-800 dark:text-slate-200 mb-2 flex items-center space-x-1.5">
                <i data-lucide="list-tree" class="w-4 h-4 text-garden-600 dark:text-garden-400"></i>
                <span>Table of Contents</span>
              </div>
              <ul class="space-y-1.5 text-slate-600 dark:text-slate-400 pl-2">
                <li v-for="item in currentNote.toc" :key="item.id" 
                    :class="{'pl-3': item.level === 2}"
                    class="hover:text-garden-700 dark:hover:text-garden-300 transition-colors cursor-pointer">
                  • {{ item.title }}
                </li>
              </ul>
            </div>

​            <!-- Article Body Content -->
            <article class="prose dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 leading-relaxed space-y-6 text-base font-normal">

              <div v-html="renderedMarkdown"></div>

​            </article>

​            <!-- Backlinks Section -->
            <div class="mt-16 pt-8 border-t border-slate-200 dark:border-white/10 space-y-4">
              <div class="flex items-center space-x-2">
                <i data-lucide="link-2" class="w-4 h-4 text-garden-600 dark:text-garden-400"></i>
                <h3 class="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">Backlinks & Related Concepts ({{ backlinks.length }})</h3>
              </div>

              <div v-if="backlinks.length === 0" class="text-xs text-slate-400 dark:text-slate-500 italic">
                No notes link directly to this document yet.
              </div>

              <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div v-for="linkNote in backlinks" 
                     :key="linkNote.id"
                     @click="selectNote(linkNote)"
                     class="p-3.5 rounded-xl glass-card hover:border-garden-500/50 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 group">
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-garden-700 dark:group-hover:text-garden-300 transition-colors">{{ linkNote.title }}</span>
                    <span class="text-[10px]">{{ getStageIcon(linkNote.stage) }}</span>
                  </div>
                  <p class="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 font-light">{{ linkNote.summary }}</p>
                </div>
              </div>
​            </div>

​          </div>
​        </div>

​        <!-- 2. GRAPH VIEW PANEL -->
        <div v-show="activeLayout === 'graph' || activeLayout === 'split'" 
             :class="[activeLayout === 'split' ? 'hidden md:block md:w-1/2 lg:w-5/12' : 'w-full']"
             class="h-full relative bg-slate-100/50 dark:bg-obsidian-900/60 overflow-hidden flex flex-col select-none">

​          <!-- Graph Header Info Bar -->
          <div class="absolute top-4 left-4 z-10 flex items-center space-x-2 glass-card px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 text-xs text-slate-700 dark:text-slate-300">
            <i data-lucide="network" class="w-4 h-4 text-garden-600 dark:text-garden-400 animate-pulse"></i>
            <span class="font-semibold">Interactive Garden Graph</span>
            <span class="text-[10px] bg-slate-200 dark:bg-white/10 px-2 py-0.5 rounded-full text-slate-600 dark:text-slate-400 font-mono">{{ graphNodes.length }} Nodes</span>
          </div>

​          <!-- Canvas Interactive Force Graph -->
          <canvas ref="graphCanvas" class="w-full h-full cursor-grab active:cursor-grabbing"></canvas>

​          <!-- Floating Controls Widget -->
          <div class="absolute bottom-4 right-4 z-10 glass-card p-2 rounded-xl flex flex-col space-y-1">
            <button @click="resetGraphZoom" class="p-2 hover:bg-slate-200/60 dark:hover:bg-white/10 rounded-lg text-slate-700 dark:text-slate-300 transition-colors" title="Center View">
              <i data-lucide="maximize-2" class="w-4 h-4"></i>
            </button>
            <button @click="toggleGraphPhysics" class="p-2 hover:bg-slate-200/60 dark:hover:bg-white/10 rounded-lg transition-colors" :class="isPhysicsActive ? 'text-garden-600 dark:text-garden-400' : 'text-slate-400 dark:text-slate-500'" title="Toggle Physics">
              <i data-lucide="zap" class="w-4 h-4"></i>
            </button>
          </div>
​        </div>

​      </main>
​    </div>

​    <!-- 3. FLOATING WIKI-LINK HOVER PREVIEW CARD -->
    <div v-if="hoverPreview.visible" 
         :style="{ top: hoverPreview.y + 'px', left: hoverPreview.x + 'px' }"
         class="fixed z-50 w-72 p-4 glass-card rounded-2xl border border-garden-500/40 shadow-xl pointer-events-none transition-all duration-150 animate-fade-in">
      <div class="flex items-center justify-between mb-2">
        <span class="text-xs font-bold text-slate-900 dark:text-white">{{ hoverPreview.note.title }}</span>
        <span class="text-xs">{{ getStageIcon(hoverPreview.note.stage) }}</span>
      </div>
      <p class="text-xs text-slate-600 dark:text-slate-300 line-clamp-3 leading-relaxed mb-3 font-light">{{ hoverPreview.note.summary }}</p>
      <div class="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-400 pt-2 border-t border-slate-200 dark:border-white/10">
        <span>{{ hoverPreview.note.category }}</span>
        <span class="text-garden-600 dark:text-garden-400 font-semibold">Click to open →</span>
      </div>
    </div>

​    <!-- 4. COMMAND PALETTE MODAL (CMD + K) -->
    <div v-if="showCommandPalette" 
         @click.self="showCommandPalette = false"
         class="fixed inset-0 z-50 bg-slate-900/40 dark:bg-black/70 backdrop-blur-md flex items-start justify-center pt-20 px-4">
      <div class="w-full max-w-xl glass-card bg-white/90 dark:bg-obsidian-800/90 rounded-2xl border border-slate-200 dark:border-white/15 shadow-2xl overflow-hidden animate-scale-up">

​        <!-- Search Input -->
        <div class="p-4 border-b border-slate-200 dark:border-white/10 flex items-center space-x-3">
          <i data-lucide="search" class="w-5 h-5 text-garden-600 dark:text-garden-400"></i>
          <input type="text" 
                 v-model="commandQuery" 
                 ref="commandInput"
                 placeholder="Search notes, tags, or switch views..." 
                 class="w-full bg-transparent text-base text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none font-medium">
          <kbd class="text-xs text-slate-400 bg-slate-200/60 dark:bg-white/5 px-2 py-1 rounded">ESC</kbd>
        </div>

​        <!-- Command Results List -->
        <div class="max-h-80 overflow-y-auto p-2 space-y-1">
          <div v-for="result in filteredCommandResults" 
               :key="result.id"
               @click="executeCommand(result)"
               class="p-3 rounded-xl hover:bg-garden-500/15 cursor-pointer flex items-center justify-between transition-colors group">
            <div class="flex items-center space-x-3">
              <i :data-lucide="result.icon || 'file-text'" class="w-4 h-4 text-slate-500 dark:text-slate-400 group-hover:text-garden-600 dark:group-hover:text-garden-300"></i>
              <div>
                <div class="text-sm font-semibold text-slate-800 dark:text-slate-200 group-hover:text-slate-950 dark:group-hover:text-white">{{ result.title }}</div>
                <div class="text-xs text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300">{{ result.subtitle }}</div>
              </div>
            </div>
            <span class="text-xs text-slate-500 dark:text-slate-400 group-hover:text-garden-600 dark:group-hover:text-garden-300 font-mono">{{ result.badge }}</span>
          </div>

          <div v-if="filteredCommandResults.length === 0" class="p-8 text-center text-slate-400 text-sm">
            No matching garden notes found.
          </div>
​        </div>

​        <!-- Palette Footer -->
        <div class="p-3 border-t border-slate-200 dark:border-white/10 bg-slate-100/80 dark:bg-obsidian-900/60 text-[11px] text-slate-500 flex justify-between">
          <span>Navigation: <kbd class="bg-slate-200 dark:bg-white/10 px-1 rounded">↑</kbd> <kbd class="bg-slate-200 dark:bg-white/10 px-1 rounded">↓</kbd> to select</span>
          <span>Press <kbd class="bg-slate-200 dark:bg-white/10 px-1 rounded">Enter</kbd> to jump</span>
        </div>
​      </div>
​    </div>

  </div>

  <!-- VUE APPLICATION LOGIC & GRAPH SIMULATION -->
  <script>
    const { createApp, ref, computed, onMounted, onUnmounted, watch, nextTick } = Vue;

​    createApp({
​      setup() {
​        // --- VAULT DATA (Digital Garden Notes) ---
​        const notes = ref([
​          {
​            id: 'vue3-composition-api',
​            title: 'Vue 3 & Composition API Performance',
​            category: 'Frontend Engineering',
​            stage: 'evergreen',
​            updatedAt: '2026-08-05',
​            readingTime: 4,
​            tags: ['vue', 'frontend', 'javascript', 'performance'],
​            summary: 'Deep dive into Vue 3 Proxy reactivity system, memory allocation benchmarks, and optimization strategies for large-scale Web apps.',
​            toc: [
​              { id: 'sec-1', title: 'Proxy vs Object.defineProperty', level: 1 },
​              { id: 'sec-2', title: 'Compiler-Informed Virtual DOM', level: 1 },
​              { id: 'sec-3', title: 'Memory Benchmarks', level: 2 }
​            ],
​            content: `
              <p class="lead text-lg text-slate-800 dark:text-slate-200 font-serif">Vue 3 represents a fundamental shift in how reactive state is tracked and rendered in modern web applications. By migrating from ES5 getters/setters to native ES6 Proxies, the framework achieves near-zero overhead reactivity.</p>

              <h2 id="sec-1" class="text-2xl font-bold text-slate-900 dark:text-white mt-8 mb-4">1. Proxy vs Object.defineProperty</h2>
              <p>In Vue 2, reactive properties had to be defined upfront. Vue 3 solves this by wrapping reactive targets with native Proxies, allowing dynamic property addition, array index mutations, and lazy nested tracking.</p>

              <div class="my-6 p-4 rounded-xl bg-garden-500/10 border-l-4 border-garden-500 text-sm text-garden-900 dark:text-garden-200 font-medium">
                <strong>Key Insight:</strong> Coupled with [[Graph Visualization Physics in Canvas]], rendering hundreds of non-linear nodes in Vue 3 becomes butter-smooth.
              </div>

              <h2 id="sec-2" class="text-2xl font-bold text-slate-900 dark:text-white mt-8 mb-4">2. Compiler-Informed Virtual DOM</h2>
              <p>The Vue 3 template compiler analyzes template structure statically, generating <em>Block Trees</em> and <em>Patch Flags</em>. This means update speed is proportional to the amount of dynamic content, not total template size.</p>

              <pre class="bg-slate-900 dark:bg-obsidian-800 p-4 rounded-xl border border-slate-700 dark:border-white/10 font-mono text-xs text-emerald-400 dark:text-emerald-300 overflow-x-auto my-4"><code>const count = ref(0);
const double = computed(() => count.value * 2);
// Reactive effect tracking happens lazily
effect(() => {
  console.log("Count changed:", count.value);
});</code></pre>

              <p>When combined with [[Nuxt 3 Server Engine & Nitro]], client-side hydration overhead drops by up to 40%.</p>
​            `
​          },
​          {
​            id: 'canvas-graph-physics',
​            title: 'Graph Visualization Physics in Canvas',
​            category: 'Computer Graphics',
​            stage: 'growing',
​            updatedAt: '2026-08-07',
​            readingTime: 5,
​            tags: ['graph', 'canvas', 'math', 'physics'],
​            summary: 'Implementing a 60fps force-directed graph simulation using Hooke\'s Law and Coulomb\'s repulsion in HTML5 Canvas.',
​            toc: [
​              { id: 'sec-1', title: 'Coulomb Repulsion Forces', level: 1 },
​              { id: 'sec-2', title: 'Hooke Spring Attraction', level: 1 }
​            ],
​            content: `
              <p class="lead text-lg text-slate-800 dark:text-slate-200 font-serif">Force-directed graphs map abstract relationships into organic, physical spaces. By simulating physical forces between nodes, the layout self-organizes pleasantly.</p>

              <h2 id="sec-1" class="text-2xl font-bold text-slate-900 dark:text-white mt-8 mb-4">Coulomb Repulsion Forces</h2>
              <p>Every node exerts a repulsive force on every other node proportional to the inverse square of their distance:</p>

              <p class="font-mono text-sm bg-slate-900 dark:bg-obsidian-800 p-3 rounded-lg border border-slate-700 dark:border-white/10 text-emerald-400 dark:text-emerald-300 my-4">F_repulsion = k_repel / (distance^2)</p>

              <p>To keep the graph readable and responsive, we integrate velocity damping and link distance constraints in our single HTML canvas engine, linking seamlessly to [[Building Modern Digital Gardens]].</p>
​            `
​          },
​          {
​            id: 'building-digital-gardens',
​            title: 'Building Modern Digital Gardens',
​            category: 'Knowledge Management',
​            stage: 'evergreen',
​            updatedAt: '2026-08-08',
​            readingTime: 3,
​            tags: ['architecture', 'knowledge-base', 'design'],
​            summary: 'Why Digital Gardens replace traditional blogs: topological navigation, bidirectional links, and evolving thought seeds.',
​            toc: [
​              { id: 'sec-1', title: 'Topological vs Chronological', level: 1 },
​              { id: 'sec-2', title: 'The Three Stages of Seed Growth', level: 1 }
​            ],
​            content: `
              <p class="lead text-lg text-slate-800 dark:text-slate-200 font-serif">A Digital Garden is an intentional space for thinking in public. Unlike blogs that order posts chronologically, gardens organize thoughts topologically through interconnected links.</p>

              <h2 id="sec-1" class="text-2xl font-bold text-slate-900 dark:text-white mt-8 mb-4">Topological vs Chronological</h2>
              <p>Blogs treat old posts as decaying archives. Gardens treat notes as living plants. You refine, expand, and prune notes over time. We classify notes into three stages:</p>

              <ul class="list-disc pl-5 space-y-2 my-4 text-slate-700 dark:text-slate-300">
                <li><strong class="text-emerald-600 dark:text-emerald-400">🌱 Seedling:</strong> Raw ideas, initial highlights, or rough thoughts.</li>
                <li><strong class="text-emerald-600 dark:text-emerald-400">🌿 Growing:</strong> Developing synthesis with multiple connections like [[TypeScript Type System Magic]].</li>
                <li><strong class="text-emerald-600 dark:text-emerald-400">🌳 Evergreen:</strong> Mature, well-curated cornerstone essays.</li>
              </ul>
​            `
​          },
​          {
​            id: 'typescript-type-magic',
​            title: 'TypeScript Type System Magic',
​            category: 'Language Deep Dive',
​            stage: 'growing',
​            updatedAt: '2026-08-03',
​            readingTime: 6,
​            tags: ['typescript', 'javascript', 'frontend'],
​            summary: 'Exploring conditional types, template literal types, and infer keywords to craft bulletproof API contracts.',
​            toc: [{ id: 'sec-1', title: 'Template Literal Magic', level: 1 }],
​            content: `
              <p class="lead text-lg text-slate-800 dark:text-slate-200 font-serif">TypeScript’s type system is Turing-complete. We can compute complex types at compile time without adding a single byte to JavaScript bundles.</p>

              <p>Combining conditional types with <code class="text-emerald-600 dark:text-emerald-400">infer</code> allows automatic extraction of promise return types or Vue composition props as seen in [[Vue 3 & Composition API Performance]].</p>
​            `
​          },
​          {
​            id: 'tailwind-glassmorphism-design',
​            title: 'Tailwind CSS Glassmorphism Design',
​            category: 'UI/UX Design',
​            stage: 'seedling',
​            updatedAt: '2026-08-01',
​            readingTime: 2,
​            tags: ['css', 'design', 'ui'],
​            summary: 'Aesthetic principles behind translucent backdrop blurs, ambient lighting grids, and high-end UI design systems.',
​            toc: [],
​            content: `
              <p class="lead text-lg text-slate-800 dark:text-slate-200 font-serif">Glassmorphism creates depth and spatial hierarchy through multi-layered frosted glass panels, subtle borders, and vivid ambient glow points.</p>
              <p>When designing [[Building Modern Digital Gardens]], glass cards create an immersive futuristic sanctuary feel in both Light and Dark modes.</p>
​            `
​          },
​          {
​            id: 'nuxt-nitro-engine',
​            title: 'Nuxt 3 Server Engine & Nitro',
​            category: 'Fullstack Frameworks',
​            stage: 'growing',
​            updatedAt: '2026-08-04',
​            readingTime: 4,
​            tags: ['nuxt', 'vue', 'backend'],
​            summary: 'How Nitro enables cross-platform serverless deployment, auto-imports, and edge caching for Nuxt 3.',
​            toc: [],
​            content: `
              <p class="lead text-lg text-slate-800 dark:text-slate-200 font-serif">Nitro is the next-generation server engine powering Nuxt 3, supporting multi-engine deployments from Node to Cloudflare Workers.</p>
              <p>It pairs seamlessly with [[Vue 3 & Composition API Performance]] for instant server-rendered HTML.</p>
​            `
​          }
​        ]);

​        // --- STATE MANAGEMENT ---
​        const currentNote = ref(notes.value[0]);
​        const activeLayout = ref('split'); // 'reader' | 'split' | 'graph'
​        const isSidebarOpen = ref(true);
​        const searchQuery = ref('');
​        const selectedStage = ref('all');
​        const activeTagFilter = ref('');
​        const collapsedFolders = ref({});
​        const isDark = ref(true);

​        // Command Palette
​        const showCommandPalette = ref(false);
​        const commandQuery = ref('');
​        const commandInput = ref(null);

​        // Hover Preview
​        const hoverPreview = ref({
​          visible: false,
​          x: 0,
​          y: 0,
​          note: null
​        });

​        // Reading progress
​        const readingProgress = ref(45);

​        // Canvas Graph Physics
​        const graphCanvas = ref(null);
​        const isPhysicsActive = ref(true);

​        // --- COMPUTED PROPERTIES ---
​        const allTags = computed(() => {
​          const map = {};
​          notes.value.forEach(note => {
​            note.tags.forEach(t => {
​              map[t] = (map[t] || 0) + 1;
​            });
​          });
​          return Object.keys(map).map(k => ({ name: k, count: map[k] }));
​        });

​        const filteredNotes = computed(() => {
​          return notes.value.filter(note => {
​            const matchesQuery = !searchQuery.value || 
​              note.title.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
​              note.summary.toLowerCase().includes(searchQuery.value.toLowerCase());
​            
​            const matchesStage = selectedStage.value === 'all' || note.stage === selectedStage.value;
​            const matchesTag = !activeTagFilter.value || note.tags.includes(activeTagFilter.value);

​            return matchesQuery && matchesStage && matchesTag;
​          });
​        });

​        const groupedNotes = computed(() => {
​          const groups = {};
​          filteredNotes.value.forEach(note => {
​            const cat = note.category || 'General';
​            if (!groups[cat]) groups[cat] = [];
​            groups[cat].push(note);
​          });
​          return groups;
​        });

​        // Backlinks calculator
​        const backlinks = computed(() => {
​          if (!currentNote.value) return [];
​          const currentTitle = currentNote.value.title;
​          return notes.value.filter(n => {
​            return n.id !== currentNote.value.id && n.content.includes(`[[${currentTitle}]]`);
​          });
​        });

​        // Markdown Renderer with Wiki-links Converter
​        const renderedMarkdown = computed(() => {
​          if (!currentNote.value) return '';
​          let html = currentNote.value.content;

​          // Replace [[Wiki Link]] with interactive span
​          html = html.replace(/\[\[(.*?)\]\]/g, (match, p1) => {
​            const targetNote = notes.value.find(n => n.title.toLowerCase() === p1.toLowerCase().trim());
​            const targetId = targetNote ? targetNote.id : '';
​            return `<span class="wiki-link" data-note-id="${targetId}" data-note-title="${p1}">
                      <svg class="w-3 h-3 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 005.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>
​                      ${p1}
​                    </span>`;
​          });

​          return html;
​        });

​        // Command Palette Fuzzy Search Results
​        const filteredCommandResults = computed(() => {
​          const q = commandQuery.value.toLowerCase().trim();
​          const results = [];

​          // View Switching Commands
​          if (!q || 'reader split graph theme'.includes(q)) {
​            results.push({ id: 'cmd-split', title: 'Switch to Split View', subtitle: 'View Article and Graph side-by-side', icon: 'columns', badge: 'Layout', action: () => setLayout('split') });
​            results.push({ id: 'cmd-graph', title: 'Switch to Fullscreen Graph', subtitle: 'Explore 2D Knowledge Cosmos', icon: 'share-2', badge: 'Layout', action: () => setLayout('graph') });
​            results.push({ id: 'cmd-theme', title: 'Toggle Light / Dark Theme', subtitle: 'Switch color palette', icon: 'sun', badge: 'Setting', action: toggleTheme });
​          }

​          // Notes Search
​          notes.value.forEach(n => {
​            if (!q || n.title.toLowerCase().includes(q) || n.tags.some(t => t.toLowerCase().includes(q))) {
​              results.push({
​                id: n.id,
​                title: n.title,
​                subtitle: `${n.category} • ${n.summary.slice(0, 50)}...`,
​                icon: 'file-text',
​                badge: getStageIcon(n.stage),
​                action: () => selectNote(n)
​              });
​            }
​          });

​          return results;
​        });

​        // --- GRAPH ENGINE (CANVAS FORCE SIMULATION) ---
​        let graphNodes = [];
​        let graphEdges = [];
​        let animFrameId = null;
​        let draggedNode = null;

​        function initGraphData() {
​          const width = 600;
​          const height = 600;

​          graphNodes = notes.value.map((n, i) => {
​            const angle = (i / notes.value.length) * Math.PI * 2;
​            const dist = 140 + Math.random() * 60;
​            return {
​              id: n.id,
​              title: n.title,
​              stage: n.stage,
​              x: width / 2 + Math.cos(angle) * dist,
​              y: height / 2 + Math.sin(angle) * dist,
​              vx: (Math.random() - 0.5) * 2,
​              vy: (Math.random() - 0.5) * 2,
​              radius: n.stage === 'evergreen' ? 14 : (n.stage === 'growing' ? 10 : 8),
​              color: n.stage === 'evergreen' ? '#16a34a' : (n.stage === 'growing' ? '#0284c7' : '#9333ea')
​            };
​          });

​          graphEdges = [];
​          // Build edges based on wiki-links
​          notes.value.forEach(sourceNote => {
​            notes.value.forEach(targetNote => {
​              if (sourceNote.id !== targetNote.id && sourceNote.content.includes(`[[${targetNote.title}]]`)) {
​                const source = graphNodes.find(gn => gn.id === sourceNote.id);
​                const target = graphNodes.find(gn => gn.id === targetNote.id);
​                if (source && target) {
​                  graphEdges.push({ source, target });
​                }
​              }
​            });
​          });
​        }

​        function renderGraphCanvas() {
​          if (!graphCanvas.value) return;
​          const canvas = graphCanvas.value;
​          const ctx = canvas.getContext('2d');
​          const width = canvas.width = canvas.parentElement.clientWidth;
​          const height = canvas.height = canvas.parentElement.clientHeight;

​          // Physics Step
​          if (isPhysicsActive.value) {
​            // Repulsion
​            for (let i = 0; i < graphNodes.length; i++) {
​              for (let j = i + 1; j < graphNodes.length; j++) {
​                const n1 = graphNodes[i];
​                const n2 = graphNodes[j];
​                const dx = n2.x - n1.x;
​                const dy = n2.y - n1.y;
​                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
​                if (dist < 250) {
​                  const force = (250 - dist) / dist * 0.15;
​                  n1.vx -= dx * force * 0.05;
​                  n1.vy -= dy * force * 0.05;
​                  n2.vx += dx * force * 0.05;
​                  n2.vy += dy * force * 0.05;
​                }
​              }
​            }

​            // Spring Attraction
​            graphEdges.forEach(edge => {
​              const dx = edge.target.x - edge.source.x;
​              const dy = edge.target.y - edge.source.y;
​              const dist = Math.sqrt(dx * dx + dy * dy) || 1;
​              const force = (dist - 100) * 0.005;
​              edge.source.vx += dx * force;
​              edge.source.vy += dy * force;
​              edge.target.vx -= dx * force;
​              edge.target.vy -= dy * force;
​            });

​            // Center Gravity & Velocity Update
​            graphNodes.forEach(node => {
​              if (node === draggedNode) return;
​              node.vx += (width / 2 - node.x) * 0.0008;
​              node.vy += (height / 2 - node.y) * 0.0008;
​              node.vx *= 0.88; // Damping
​              node.vy *= 0.88;
​              node.x += node.vx;
​              node.y += node.vy;
​            });
​          }

​          // Clear Screen according to theme
​          ctx.clearRect(0, 0, width, height);
​          ctx.save();

​          // Draw Edges
​          graphEdges.forEach(edge => {
​            const isHighlighted = currentNote.value && 
​              (edge.source.id === currentNote.value.id || edge.target.id === currentNote.value.id);

​            ctx.beginPath();
​            ctx.moveTo(edge.source.x, edge.source.y);
​            ctx.lineTo(edge.target.x, edge.target.y);
​            
​            if (isDark.value) {
​              ctx.strokeStyle = isHighlighted ? 'rgba(74, 222, 128, 0.7)' : 'rgba(255, 255, 255, 0.12)';
​            } else {
​              ctx.strokeStyle = isHighlighted ? 'rgba(22, 163, 74, 0.8)' : 'rgba(15, 23, 42, 0.15)';
​            }

​            ctx.lineWidth = isHighlighted ? 2.5 : 1.2;
​            ctx.stroke();

​            // Pulse particle on active edge
​            if (isHighlighted && isPhysicsActive.value) {
​              const time = Date.now() * 0.002;
​              const progress = (time % 1);
​              const px = edge.source.x + (edge.target.x - edge.source.x) * progress;
​              const py = edge.source.y + (edge.target.y - edge.source.y) * progress;
​              ctx.beginPath();
​              ctx.arc(px, py, 3.5, 0, Math.PI * 2);
​              ctx.fillStyle = isDark.value ? '#86efac' : '#15803d';
​              ctx.shadowColor = isDark.value ? '#4ade80' : '#16a34a';
​              ctx.shadowBlur = 8;
​              ctx.fill();
​              ctx.shadowBlur = 0;
​            }
​          });

​          // Draw Nodes
​          graphNodes.forEach(node => {
​            const isSelected = currentNote.value && node.id === currentNote.value.id;

​            // Outer Glow
​            ctx.beginPath();
​            ctx.arc(node.x, node.y, isSelected ? node.radius + 7 : node.radius + 3, 0, Math.PI * 2);
​            if (isDark.value) {
​              ctx.fillStyle = isSelected ? 'rgba(74, 222, 128, 0.28)' : 'rgba(255, 255, 255, 0.04)';
​            } else {
​              ctx.fillStyle = isSelected ? 'rgba(34, 197, 94, 0.22)' : 'rgba(15, 23, 42, 0.05)';
​            }
​            ctx.fill();

​            // Core Circle
​            ctx.beginPath();
​            ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
​            ctx.fillStyle = isSelected ? (isDark.value ? '#4ade80' : '#16a34a') : node.color;
​            ctx.shadowColor = isSelected ? (isDark.value ? '#22c55e' : '#15803d') : node.color;
​            ctx.shadowBlur = isSelected ? 16 : 6;
​            ctx.fill();
​            ctx.shadowBlur = 0;

​            // Title Label (Dark in Light Mode, White in Dark Mode)
​            ctx.font = isSelected ? '700 12px "Plus Jakarta Sans"' : '500 11px "Plus Jakarta Sans"';
​            ctx.fillStyle = isDark.value ? (isSelected ? '#ffffff' : 'rgba(226, 232, 240, 0.85)') : (isSelected ? '#0f172a' : '#334155');
​            ctx.textAlign = 'center';
​            ctx.fillText(node.title, node.x, node.y + node.radius + 15);
​          });

​          ctx.restore();
​          animFrameId = requestAnimationFrame(renderGraphCanvas);
​        }

​        // --- HELPER FUNCTIONS ---
​        function selectNote(note) {
​          currentNote.value = note;
​          showCommandPalette.value = false;
​          hoverPreview.value.visible = false;
​          window.scrollTo({ top: 0, behavior: 'smooth' });
​        }

​        function setLayout(layout) {
​          activeLayout.value = layout;
​          nextTick(() => {
​            if (layout === 'graph' || layout === 'split') {
​              initGraphData();
​            }
​          });
​        }

​        function toggleTheme() {
​          isDark.value = !isDark.value;
​          if (isDark.value) {
​            document.documentElement.classList.add('dark');
​          } else {
​            document.documentElement.classList.remove('dark');
​          }
​        }

​        function getStageIcon(stage) {
​          switch (stage) {
​            case 'seedling': return '🌱';
​            case 'growing': return '🌿';
​            case 'evergreen': return '🌳';
​            default: return '📄';
​          }
​        }

​        function getStageBadgeClass(stage) {
​          switch (stage) {
​            case 'seedling': return 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/20';
​            case 'growing': return 'bg-sky-500/10 text-sky-800 dark:text-sky-300 border-sky-500/20';
​            case 'evergreen': return 'bg-garden-500/10 text-garden-800 dark:text-garden-300 border-garden-500/20';
​            default: return 'bg-slate-200 dark:bg-white/5 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-white/10';
​          }
​        }

​        function toggleFolder(folderName) {
​          collapsedFolders.value[folderName] = !collapsedFolders.value[folderName];
​        }

​        function filterByTag(tagName) {
​          activeTagFilter.value = activeTagFilter.value === tagName ? '' : tagName;
​        }

​        function executeCommand(cmd) {
​          if (cmd.action) cmd.action();
​        }

​        function resetGraphZoom() {
​          initGraphData();
​        }

​        function toggleGraphPhysics() {
​          isPhysicsActive.value = !isPhysicsActive.value;
​        }

​        // Mouse listeners for Wiki-link hover previews
​        function setupWikiLinkListeners() {
​          document.addEventListener('mouseover', (e) => {
​            const linkEl = e.target.closest('.wiki-link');
​            if (linkEl) {
​              const noteId = linkEl.getAttribute('data-note-id');
​              const targetNote = notes.value.find(n => n.id === noteId);
​              if (targetNote) {
​                const rect = linkEl.getBoundingClientRect();
​                hoverPreview.value = {
​                  visible: true,
​                  x: Math.min(rect.left, window.innerWidth - 300),
​                  y: rect.bottom + 8,
​                  note: targetNote
​                };
​              }
​            }
​          });

​          document.addEventListener('mouseout', (e) => {
​            if (e.target.closest('.wiki-link')) {
​              hoverPreview.value.visible = false;
​            }
​          });

​          document.addEventListener('click', (e) => {
​            const linkEl = e.target.closest('.wiki-link');
​            if (linkEl) {
​              const noteId = linkEl.getAttribute('data-note-id');
​              const targetNote = notes.value.find(n => n.id === noteId);
​              if (targetNote) {
​                selectNote(targetNote);
​              }
​            }
​          });
​        }

​        // Global Keyboard Shortcuts (Cmd+K)
​        function setupKeyboardShortcuts() {
​          window.addEventListener('keydown', (e) => {
​            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
​              e.preventDefault();
​              showCommandPalette.value = !showCommandPalette.value;
​              if (showCommandPalette.value) {
​                nextTick(() => commandInput.value?.focus());
​              }
​            }
​            if (e.key === 'Escape' && showCommandPalette.value) {
​              showCommandPalette.value = false;
​            }
​          });
​        }

​        // Scroll listener for reading progress bar
​        function setupScrollListener() {
​          const readerEl = document.querySelector('.overflow-y-auto');
​          if (readerEl) {
​            readerEl.addEventListener('scroll', () => {
​              const scrollTop = readerEl.scrollTop;
​              const scrollHeight = readerEl.scrollHeight - readerEl.clientHeight;
​              readingProgress.value = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;
​            });
​          }
​        }

​        // Lifecycle Hooks
​        onMounted(() => {
​          lucide.createIcons();
​          initGraphData();
​          renderGraphCanvas();
​          setupWikiLinkListeners();
​          setupKeyboardShortcuts();
​          setupScrollListener();
​        });

​        onUnmounted(() => {
​          if (animFrameId) cancelAnimationFrame(animFrameId);
​        });

​        // Watchers
​        watch(showCommandPalette, (val) => {
​          if (val) {
​            nextTick(() => lucide.createIcons());
​          }
​        });

​        return {
​          notes,
​          currentNote,
​          activeLayout,
​          isSidebarOpen,
​          searchQuery,
​          selectedStage,
​          activeTagFilter,
​          collapsedFolders,
​          isDark,
​          allTags,
​          filteredNotes,
​          groupedNotes,
​          backlinks,
​          renderedMarkdown,
​          showCommandPalette,
​          commandQuery,
​          commandInput,
​          filteredCommandResults,
​          hoverPreview,
​          readingProgress,
​          graphCanvas,
​          graphNodes,
​          isPhysicsActive,
​          selectNote,
​          setLayout,
​          toggleTheme,
​          getStageIcon,
​          getStageBadgeClass,
​          toggleFolder,
​          filterByTag,
​          executeCommand,
​          resetGraphZoom,
​          toggleGraphPhysics
​        };
​      }
​    }).mount('#app');
  </script>
</body>
</html>