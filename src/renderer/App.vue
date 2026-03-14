<template>
  <div class="app">
    <nav class="sidebar">
      <h1>Släktforskning</h1>
      <router-link to="/">Persons</router-link>
      <router-link to="/families">Families</router-link>
      <router-link to="/sources">Sources</router-link>
    </nav>
    <main class="content">
      <router-view />
    </main>
  </div>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #f5f5f5;
  color: #333;
}

.app {
  display: flex;
  height: 100vh;
}

.sidebar {
  width: 200px;
  background: #2c3e50;
  color: white;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sidebar h1 {
  font-size: 16px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
}

.sidebar a {
  color: rgba(255, 255, 255, 0.7);
  text-decoration: none;
  padding: 8px 12px;
  border-radius: 4px;
}

.sidebar a:hover,
.sidebar a.router-link-active {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.content {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
}
</style>
