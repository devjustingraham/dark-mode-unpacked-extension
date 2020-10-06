(function () {
    'use strict'

    if (matchMedia('(prefers-color-scheme: dark)').matches &&
        !document.querySelector('.darkmode--fallback')) {
        const fallbackStyle = document.createElement('style')
        fallbackStyle.textContent = 'html, body, body :not(iframe) { background-color: #181a1b !important; border-color: #776e62 !important; color: #e8e6e3 !important; }'
        document.documentElement.appendChild(fallbackStyle)
        fallbackStyle.classList.add('darkmode')
        fallbackStyle.classList.add('darkmode--fallback')
        fallbackStyle.media = 'screen'
    }

}())
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmFsbGJhY2suanMiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9pbmplY3QvZmFsbGJhY2sudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaWYgKFxuICAgIG1hdGNoTWVkaWEoJyhwcmVmZXJzLWNvbG9yLXNjaGVtZTogZGFyayknKS5tYXRjaGVzICYmXG4gICAgIWRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5kYXJrcmVhZGVyLS1mYWxsYmFjaycpXG4pIHtcbiAgICBjb25zdCBmYWxsYmFja1N0eWxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3R5bGUnKTtcbiAgICBmYWxsYmFja1N0eWxlLnRleHRDb250ZW50ID0gJ2h0bWwsIGJvZHksIGJvZHkgOm5vdChpZnJhbWUpIHsgYmFja2dyb3VuZC1jb2xvcjogIzE4MWExYiAhaW1wb3J0YW50OyBib3JkZXItY29sb3I6ICM3NzZlNjIgIWltcG9ydGFudDsgY29sb3I6ICNlOGU2ZTMgIWltcG9ydGFudDsgfSc7XG4gICAgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LmFwcGVuZENoaWxkKGZhbGxiYWNrU3R5bGUpO1xuICAgIGZhbGxiYWNrU3R5bGUuY2xhc3NMaXN0LmFkZCgnZGFya3JlYWRlcicpO1xuICAgIGZhbGxiYWNrU3R5bGUuY2xhc3NMaXN0LmFkZCgnZGFya3JlYWRlci0tZmFsbGJhY2snKTtcbiAgICBmYWxsYmFja1N0eWxlLm1lZGlhID0gJ3NjcmVlbic7XG59XG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0lBQUEsSUFDSSxVQUFVLENBQUMsOEJBQThCLENBQUMsQ0FBQyxPQUFPO1FBQ2xELENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQyx1QkFBdUIsQ0FBQyxFQUNsRDtRQUNFLE1BQU0sYUFBYSxHQUFHLFFBQVEsQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDdEQsYUFBYSxDQUFDLFdBQVcsR0FBRyxzSUFBc0ksQ0FBQztRQUNuSyxRQUFRLENBQUMsZUFBZSxDQUFDLFdBQVcsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUNwRCxhQUFhLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUMxQyxhQUFhLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDO1FBQ3BELGFBQWEsQ0FBQyxLQUFLLEdBQUcsUUFBUSxDQUFDOzs7Ozs7OyJ9
