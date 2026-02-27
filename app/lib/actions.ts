'use server';

import {z} from 'zod';
import postgres from 'postgres';
import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';

export type State = {
  errors?: {
    customerId?: string[];
    amount?: string[];
    status?: string[];
  },
  values?: {
    customerId?: string | null;
    amount?: string | null;
    status?: string | null;
  },
  message?: string | null;
}

const sql = postgres(process.env.POSTGRES_URL!, {ssl: 'require'})

const FormSchema = z.object({
  id: z.string(),
  customerId: z.string({
    invalid_type_error: 'Please select a customer.'
  }),
  amount: z.coerce
    .number()
    .gt(0, { message: 'Please enter an amount greater than $0.' }),
  status: z.enum(['paid', 'pending'], {
    invalid_type_error: 'Please select an invoice status.'
  }),
  date: z.string()
});

const CreateInvoice = FormSchema.omit({id: true, date: true})

export async function createInvoice(prevState: State, formData: FormData) {
  const rawCustomerId = formData.get('customerId');
  const rawAmount = formData.get('amount');
  const rawStatus = formData.get('status');

  const validatedFields = CreateInvoice.safeParse({
    customerId: rawCustomerId,
    amount: rawAmount,
    status: rawStatus,
  });

  // If form validation fails, return errors early. Otherwise, continue.
  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing fields. Failed to create invoice.',
      values: {
        customerId: typeof rawCustomerId === 'string' ? rawCustomerId : null,
        amount: typeof rawAmount === 'string' ? rawAmount : null,
        status: typeof rawStatus === 'string' ? rawStatus : null,
      },
    };
  }

  // Prepare data for insertion into the database
  const { customerId, amount, status } = validatedFields.data;
  const amountInCents = amount * 100;
  const date = new Date().toISOString().split('T')[0];

  // Insert data into the database
  try {
    await sql`
      INSERT INTO invoices (customer_id, amount, status, date)
      VALUES (${customerId}, ${amountInCents}, ${status}, ${date})
    `;
  } catch (e) {
    console.error(e);
    return {
      message: 'Database Error: Failed to create invoice',
    };
  }

  revalidatePath('/dashboard/invoices');
  redirect('/dashboard/invoices');
}

const UpdateInvoice = FormSchema.omit({id: true, date: true});

export async function updateInvoice(id: string, formData: FormData) {
  const {customerId, amount, status} = UpdateInvoice.parse({
    customerId: formData.get('customerId'),
    amount: formData.get('amount'),
    status: formData.get('status'),
  });

  const amountInCents = amount * 100;

  try {
    await sql`
      UPDATE invoices
      SET customer_id = ${customerId}, amount = ${amountInCents}, status = ${status}
      WHERE id = ${id}
    `;
  } catch (e) {
    console.error(e)
    return {
      message: 'Database Error: Failed to update invoice'
    }
  }

  revalidatePath('/dashboard/invoices');
  redirect('/dashboard/invoices');
}

export async function deleteInvoice(id: string) {
  try {
    await sql`DELETE FROM invoices WHERE id = ${id}`;
  } catch (e) {
    console.error(e)
  }
  revalidatePath('/dashboard/invoices');
}
