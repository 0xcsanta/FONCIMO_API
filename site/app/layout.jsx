import { Kanit } from "next/font/google";
import "./globals.css";

const kanit = Kanit({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-kanit",
  display: "swap",
});

export const metadata = {
  title: "Foncimo - Pilotage de projet et expertise immobilière",
  description:
    "Foncimo est spécialisé dans le pilotage de projet et l'expertise immobilière. Un accompagnement transparent et structuré en Suisse romande.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr" className={kanit.variable}>
      <body>{children}</body>
    </html>
  );
}
