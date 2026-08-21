import type { Metadata } from "next";
import "./globals.css";
import "./actions.css";
export const metadata:Metadata={title:"LabStatus",description:"That Eye Place lab job tracking and timestamp history."};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><body>{children}</body></html>}
