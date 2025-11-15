import { getCookies, setCookie, deleteCookie } from "https://deno.land/std@0.208.0/http/cookie.ts";

const kv = await Deno.openKv();

interface Movie {
  id: string;
  title: string;
  poster: string;
  review: string;
  screenshots: string[];
  downloadUrl: string;
}

function HtmlResponse(body: string, title = "My Movie App"): Response {
  return new Response(
    `<!DOCTYPE html>
    <html lang="my">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
      <style>
        body { font-family: sans-serif; margin: 0; background-color: #f4f4f4; }
        .container { max-width: 800px; margin: 20px auto; padding: 20px; background-color: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        a { color: #007bff; text-decoration: none; }
        .movie-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
        .movie-card img { width: 100%; border-radius: 8px; }
        .movie-card h3 { margin: 8px 0; font-size: 1rem; }
        input, textarea, button { width: 100%; padding: 12px; margin-bottom: 1rem; border-radius: 4px; border: 1px solid #ccc; box-sizing: border-box; }
        button { background-color: #007bff; color: white; cursor: pointer; border: none; font-size: 1rem; }
        button.danger { background-color: #dc3545; }
        .admin-nav { background-color: #343a40; padding: 1rem; text-align: center; }
        .admin-nav a { color: white; margin: 0 15px; }
      </style>
    </head>
    <body>
      ${body}
    </body>
    </html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const { pathname } = url;
  const method = req.method;

  if (pathname === "/" && method === "GET") {
    let movies: Movie[] = [];
    const entries = kv.list<Movie>({ prefix: ["movies"] });
    for await (const entry of entries) {
      movies.push(entry.value);
    }
    movies = movies.reverse();

    const body = `
      <div class="container">
        <h1>ဇာတ်ကားများ</h1>
        <div class="movie-grid">
          ${movies.map(movie => `
            <a href="/movie/${movie.id}" class="movie-card">
              <img src="${movie.poster}" alt="${movie.title}" />
              <h3>${movie.title}</h3>
            </a>
          `).join('') || '<p>ဇာတ်ကားများ မထည့်သွင်းရသေးပါ။</p>'}
        </div>
        <p style="text-align:center; margin-top:2rem;"><a href="/admin">Admin Panel သို့သွားရန်</a></p>
      </div>
    `;
    return HtmlResponse(body, "ဇာတ်ကားများ");
  }

  const movieDetailPattern = new URLPattern({ pathname: "/movie/:id" });
  if (movieDetailPattern.test(url) && method === "GET") {
    const { id } = movieDetailPattern.exec(url)!.pathname.groups;
    const result = await kv.get<Movie>(["movies", id!]);

    if (!result.value) return new Response("Movie not found", { status: 404 });
    const movie = result.value;
    
    const body = `
      <div class="container">
        <h1>${movie.title}</h1>
        <img src="${movie.poster}" alt="${movie.title}" style="max-width:250px; border-radius:8px;" />
        <h2>သုံးသပ်ချက်</h2>
        <p>${movie.review}</p>
        <h2>Screenshots</h2>
        <div style="display:flex; flex-wrap:wrap; gap:10px;">
          ${movie.screenshots.map(ss => `<img src="${ss}" style="width: 48%; border-radius: 4px;" alt="screenshot" />`).join('')}
        </div>
        <div style="margin-top:2rem;">
          <a href="${movie.downloadUrl}" style="padding:10px 15px; background:blue; color:white; border-radius:5px;">Download</a>
        </div>
        <p style="margin-top: 2rem;"><a href="/"> &laquo; ပင်မစာမျက်နှာသို့</a></p>
      </div>
    `;
    return HtmlResponse(body, movie.title);
  }

  const { auth } = getCookies(req.headers);
  const isLoggedIn = auth === Deno.env.get("SECRET_COOKIE_VALUE");

  const adminNav = `
    <div class="admin-nav">
      <a href="/admin">Dashboard</a>
      <a href="/admin/add">အသစ်ထည့်ရန်</a>
      <a href="/logout">ထွက်ရန်</a>
    </div>`;

  if (pathname === "/admin/login") {
    if (method === "GET") {
      const body = `
        <div class="container">
          <h1>Admin Login</h1>
          <form method="POST">
            <input type="text" name="username" placeholder="Username" required />
            <input type="password" name="password" placeholder="Password" required />
            <button type="submit">Login</button>
          </form>
        </div>`;
      return HtmlResponse(body, "Admin Login");
    }
    if (method === "POST") {
      const form = await req.formData();
      if (form.get("username") === Deno.env.get("ADMIN_USERNAME") && form.get("password") === Deno.env.get("ADMIN_PASSWORD")) {
        const headers = new Headers({ location: "/admin" });
        const secret = Deno.env.get("SECRET_COOKIE_VALUE") || crypto.randomUUID();
        setCookie(headers, { name: "auth", value: secret, maxAge: 60 * 60 * 24, path: "/" });
        return new Response(null, { status: 303, headers });
      }
      return new Response(null, { status: 303, headers: { location: "/admin/login?error=1" } });
    }
  }
  
  if (pathname === "/logout") {
      const headers = new Headers({ location: "/admin/login" });
      deleteCookie(headers, "auth", { path: "/" });
      return new Response(null, { status: 303, headers });
  }

  if (pathname.startsWith("/admin") && !isLoggedIn) {
      return new Response(null, { status: 303, headers: { location: "/admin/login" } });
  }

  if (pathname === "/admin") {
      let movies: Movie[] = [];
      const entries = kv.list<Movie>({ prefix: ["movies"] });
      for await (const entry of entries) { movies.push(entry.value); }
      movies = movies.reverse();
      
      const body = `
        ${adminNav}
        <div class="container">
            <h2>ဇာတ်ကား စာရင်း</h2>
            ${movies.map(m => `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #eee;">
                    <span>${m.title}</span>
                    <div>
                        <a href="/admin/edit/${m.id}">ပြင်ရန်</a> |
                        <form method="POST" action="/admin/delete/${m.id}" style="display:inline;" onsubmit="return confirm('ဤဇာတ်ကားကို ဖျက်မှာသေချာလား?');">
                            <button type="submit" style="all:unset; color:red; cursor:pointer; padding-left: 5px;">ဖျက်ရန်</button>
                        </form>
                    </div>
                </div>`).join('') || "<p>ဇာတ်ကားများ မရှိသေးပါ။</p>"}
        </div>`;
      return HtmlResponse(body, "Admin Dashboard");
  }

  if (pathname === "/admin/add") {
    if (method === "GET") {
        const body = `
            ${adminNav}
            <div class="container">
                <h2>ဇာတ်ကားအသစ်ထည့်ရန်</h2>
                <form method="POST">
                  <input type="text" name="title" placeholder="ဇာတ်ကားအမည်" required />
                  <input type="url" name="poster" placeholder="ပိုစတာပုံ URL" required />
                  <textarea name="review" placeholder="အညွှန်း" required rows="4"></textarea>
                  <textarea name="screenshots" placeholder="Screenshot URLs (ကော်မာခြားပြီးထည့်ပါ)" rows="3"></textarea>
                  <input type="url" name="downloadUrl" placeholder="Download URL" required />
                  <button type="submit">သိမ်းဆည်းမည်</button>
                </form>
            </div>`;
        return HtmlResponse(body, "ဇာတ်ကားအသစ်ထည့်ရန်");
    }
    if (method === "POST") {
        const form = await req.formData();
        const movie: Movie = {
            id: crypto.randomUUID(),
            title: form.get("title") as string,
            poster: form.get("poster") as string,
            review: form.get("review") as string,
            screenshots: (form.get("screenshots") as string)?.split(',').map(s => s.trim()).filter(s => s) || [],
            downloadUrl: form.get("downloadUrl") as string
        };
        await kv.set(["movies", movie.id], movie);
        return new Response(null, { status: 303, headers: { location: "/admin" } });
    }
  }

  const editPattern = new URLPattern({ pathname: "/admin/edit/:id" });
  if (editPattern.test(url)) {
      const { id } = editPattern.exec(url)!.pathname.groups;
      if (method === "GET") {
          const movie = (await kv.get<Movie>(["movies", id!])).value;
          if (!movie) return new Response("Not Found", { status: 404 });
          const body = `
              ${adminNav}
              <div class="container">
                  <h2>"${movie.title}" ကို ပြင်ဆင်ရန်</h2>
                  <form method="POST">
                      <input type="text" name="title" value="${movie.title}" required />
                      <input type="url" name="poster" value="${movie.poster}" required />
                      <textarea name="review" required rows="4">${movie.review}</textarea>
                      <textarea name="screenshots" rows="3">${movie.screenshots.join(', ')}</textarea>
                      <input type="url" name="downloadUrl" value="${movie.downloadUrl}" required />
                      <button type="submit">အသစ်ပြင်ဆင်မည်</button>
                  </form>
              </div>`;
          return HtmlResponse(body, `ပြင်ဆင်ရန်: ${movie.title}`);
      }
      if (method === "POST") {
          const form = await req.formData();
          const movie: Movie = {
              id: id!,
              title: form.get("title") as string,
              poster: form.get("poster") as string,
              review: form.get("review") as string,
              screenshots: (form.get("screenshots") as string)?.split(',').map(s => s.trim()).filter(s => s) || [],
              downloadUrl: form.get("downloadUrl") as string
          };
          await kv.set(["movies", movie.id], movie);
          return new Response(null, { status: 303, headers: { location: "/admin" } });
      }
  }

  const deletePattern = new URLPattern({ pathname: "/admin/delete/:id" });
  if (deletePattern.test(url) && method === "POST") {
      const { id } = deletePattern.exec(url)!.pathname.groups;
      await kv.delete(["movies", id!]);
      return new Response(null, { status: 303, headers: { location: "/admin" } });
  }

  return new Response("404: Page not found", { status: 404 });
});

```}

  const deletePattern = new URLPattern({ pathname: "/admin/delete/:id" });
  if (deletePattern.test(url) && method === "POST") {
      const { id } = deletePattern.exec(url)!.pathname.groups;
      await kv.delete(["movies", id!]);
      return new Response(null, { status: 303, headers: { location: "/admin" } });
  }

  return new Response("404: Page not found", { status: 404 });
});
