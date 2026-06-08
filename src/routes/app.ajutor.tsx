import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { HelpCircle, Mail, Search } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/app/ajutor")({
  head: () => ({ meta: [{ title: "Ajutor - IMMapp" }] }),
  component: HelpPage,
});

const faqItems = [
  {
    question: "Ce tip de fisiere pot incarca?",
    answer:
      "IMMapp accepta fisiere XML e-Factura in sectiunea Documente. Aceste documente sunt folosite pentru dashboard, rapoarte si AI Forecast.",
  },
  {
    question: "Cum se actualizeaza AI Forecast?",
    answer:
      "Dupa fiecare import sau stergere de documente, predictia poate fi actualizata pentru a reflecta datele curente.",
  },
  {
    question: "De ce apar valori negative la cash-flow?",
    answer:
      "Valorile negative pot indica presiune pe lichiditate sau cheltuieli estimate mai mari decat veniturile pentru perioada analizata.",
  },
  {
    question: "Ce inseamna nivelul de incredere?",
    answer:
      "Nivelul de incredere arata cat de stabila este estimarea pe baza istoricului disponibil. Cu mai multe documente pe mai multe luni, estimarea devine mai relevanta.",
  },
  {
    question: "Cum sterg documente?",
    answer:
      "In pagina Documente poti selecta unul sau mai multe documente si le poti sterge dupa confirmare.",
  },
];

function HelpPage() {
  const [search, setSearch] = useState("");

  const filteredFaqItems = useMemo(() => {
    const searchValue = search.trim().toLowerCase();

    if (!searchValue) {
      return faqItems;
    }

    return faqItems.filter((item) =>
      `${item.question} ${item.answer}`.toLowerCase().includes(searchValue),
    );
  }, [search]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ajutor"
        description="Gaseste rapid raspunsuri despre importul e-Facturilor, dashboard, AI Forecast si rapoarte."
      />

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardContent className="p-5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cauta in ajutor..."
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="border-slate-200 bg-white shadow-sm xl:col-span-2">
          <CardContent className="p-5">
            {filteredFaqItems.length === 0 ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center text-center">
                <HelpCircle className="h-8 w-8 text-slate-400" />
                <h2 className="mt-4 text-base font-semibold text-slate-900">
                  Nu am gasit raspunsuri pentru cautarea ta
                </h2>
                <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
                  Incearca un termen diferit sau contacteaza suportul pentru ajutor.
                </p>
              </div>
            ) : (
              <Accordion type="single" collapsible className="w-full">
                {filteredFaqItems.map((item, index) => (
                  <AccordionItem key={item.question} value={`faq-${index}`}>
                    <AccordionTrigger className="text-left text-sm font-semibold text-slate-900">
                      {item.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-sm leading-6 text-slate-600">
                      {item.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="p-5">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Mail className="h-5 w-5" />
            </div>
            <h2 className="text-base font-semibold text-slate-900">Nu ai gasit raspunsul?</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Echipa de suport te poate ajuta cu importul documentelor, rapoarte sau predictii.
            </p>
            <Button className="mt-5 w-full">Contacteaza suportul</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
