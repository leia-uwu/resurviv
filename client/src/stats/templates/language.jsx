import { h, Fragment } from "jsx-dom";

export default function Language({ code }) {
  return (
    <>
      <a class="nav-link dropdown-toggle" href="#" id="selected-language" role="button" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
        {code.toUpperCase()}
      </a>
      <div class="dropdown-menu" aria-labelledby="navbarDropdown">
        <a class="dropdown-item dropdown-language" href="#" value='en'>English</a>
        <a class="dropdown-item dropdown-language" href="#" value='es'>Español</a>
      </div>
    </>
  )
}
