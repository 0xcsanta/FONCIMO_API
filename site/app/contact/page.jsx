import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata = { title: "Contact - Foncimo" };

export default function ContactPage() {
  return (
    <>
      <Header />
      <main>
        <section className="page-hero">
          <div className="container">
            <span className="eyebrow">Contact</span>
            <h1>Besoin de clarté pour avancer&nbsp;?</h1>
          </div>
        </section>

        <section className="section">
          <div className="container contact-grid">
            <form className="form">
              <div className="field">
                <label htmlFor="name">Nom et prénom</label>
                <input id="name" name="name" type="text" required />
              </div>
              <div className="field">
                <label htmlFor="email">E-mail</label>
                <input id="email" name="email" type="email" required />
              </div>
              <div className="field">
                <label htmlFor="phone">Téléphone</label>
                <input id="phone" name="phone" type="tel" />
              </div>
              <div className="field">
                <label htmlFor="message">Votre message</label>
                <textarea id="message" name="message" required />
              </div>
              <button type="submit" className="btn btn-lime">
                Envoyer
              </button>
            </form>

            <aside className="contact-info">
              <div>
                <strong>Foncimo SA</strong>
                Pilotage de projet et expertise immobilière
              </div>
              <div>
                <strong>Adresse</strong>
                Pully, Vaud, Suisse romande
              </div>
              <div>
                <strong>E-mail</strong>
                contact@foncimo.ch
              </div>
              <div>
                <strong>LinkedIn</strong>
                <a
                  href="https://www.linkedin.com/company/foncimo-sa/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Foncimo SA
                </a>
              </div>
            </aside>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
