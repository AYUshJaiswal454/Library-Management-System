const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const User = require('../models/User');
const Category = require('../models/Category');
const Book = require('../models/Book');
const BookCopy = require('../models/BookCopy');
const Loan = require('../models/Loan');
const Reservation = require('../models/Reservation');
const Fine = require('../models/Fine');
const Notification = require('../models/Notification');
const AuditLog = require('../models/AuditLog');
const LibrarySetting = require('../models/LibrarySetting');

const seedDatabase = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/library_circulation';
    console.log(`[Seed] Connecting to database: ${mongoUri}...`);
    await mongoose.connect(mongoUri);

    console.log('[Seed] Clearing existing collections...');
    await Promise.all([
      User.deleteMany({}),
      Category.deleteMany({}),
      Book.deleteMany({}),
      BookCopy.deleteMany({}),
      Loan.deleteMany({}),
      Reservation.deleteMany({}),
      Fine.deleteMany({}),
      Notification.deleteMany({}),
      AuditLog.deleteMany({}),
      LibrarySetting.deleteMany({})
    ]);

    // 1. Create Default Library Policy Settings
    console.log('[Seed] Creating Library Circulation Policy...');
    const settings = await LibrarySetting.create({
      key: 'DEFAULT_POLICY',
      libraryName: 'Central Institutional Library & Resource Centre',
      libraryCode: 'CIL-MAIN',
      loanPeriodDays: 14,
      maxLoanLimit: 4,
      finePerDay: 5,
      gracePeriodDays: 1,
      maxFineAmount: 500,
      maxHoldLimit: 3,
      holdPickupWindowDays: 5,
      blockingFineThreshold: 100,
      currencySymbol: '₹',
      contactEmail: 'librarian@library.gov.in',
      contactPhone: '+91 11 2345 6789',
      address: 'Knowledge Complex, Institutional Area, Sector 4'
    });

    // 2. Create Categories (9 categories)
    console.log('[Seed] Creating Categories...');
    const categories = await Category.insertMany([
      { name: 'Computer Science & Engineering', code: 'CSE', deweyDecimalRange: '004-006', description: 'Algorithms, Software Engineering, AI, Systems' },
      { name: 'Mathematics & Statistics', code: 'MATH', deweyDecimalRange: '510-519', description: 'Pure Mathematics, Calculus, Linear Algebra, Probability' },
      { name: 'Physics & Astronomy', code: 'PHYS', deweyDecimalRange: '520-539', description: 'Classical Mechanics, Quantum Mechanics, Relativity' },
      { name: 'Literature & Classics', code: 'LIT', deweyDecimalRange: '800-899', description: 'World Literature, Fiction, Poetry, Drama' },
      { name: 'History & Archaeology', code: 'HIST', deweyDecimalRange: '900-999', description: 'World History, Ancient Civilizations, Modern Era' },
      { name: 'Economics & Finance', code: 'ECON', deweyDecimalRange: '330-339', description: 'Microeconomics, Macroeconomics, Behavioral Economics' },
      { name: 'Law & Jurisprudence', code: 'LAW', deweyDecimalRange: '340-349', description: 'Constitutional Law, Civil Law, International Treaties' },
      { name: 'Philosophy & Ethics', code: 'PHIL', deweyDecimalRange: '100-199', description: 'Epistemology, Moral Philosophy, Logic' },
      { name: 'Environmental Science', code: 'ENV', deweyDecimalRange: '577-579', description: 'Ecology, Climate Studies, Sustainability' }
    ]);

    const catMap = {};
    categories.forEach(c => { catMap[c.code] = c._id; });

    // 3. Create Staff & Members
    console.log('[Seed] Creating Staff & Member Accounts...');
    const defaultPasswordHash = await User.hashPassword('Member@2026');
    const staffPasswordHash = await User.hashPassword('Librarian@2026');
    const adminPasswordHash = await User.hashPassword('Admin@2026');

    const adminUser = await User.create({
      name: 'Dr. S. R. Ranganathan',
      email: 'admin@library.gov.in',
      passwordHash: adminPasswordHash,
      role: 'ADMIN',
      memberId: 'ADM-2026-0001',
      phone: '+91 98111 00001',
      departmentOrBatch: 'Library Administration'
    });

    const librarian1 = await User.create({
      name: 'Ms. Sunita Deshmukh',
      email: 'librarian@library.gov.in',
      passwordHash: staffPasswordHash,
      role: 'LIBRARIAN',
      memberId: 'LIB-2026-0001',
      phone: '+91 98111 00002',
      departmentOrBatch: 'Circulation & Reference'
    });

    const librarian2 = await User.create({
      name: 'Mr. Arvind Swaminathan',
      email: 'assistant.librarian@library.gov.in',
      passwordHash: staffPasswordHash,
      role: 'LIBRARIAN',
      memberId: 'LIB-2026-0002',
      phone: '+91 98111 00003',
      departmentOrBatch: 'Technical Services & Ingestion'
    });

    const membersData = [
      { name: 'Aarav Sharma', email: 'aarav.sharma@institution.edu', memberId: 'MEM-2026-0101', dept: 'CS Batch 2026', phone: '+91 98765 00101' },
      { name: 'Priya Patel', email: 'priya.patel@institution.edu', memberId: 'MEM-2026-0102', dept: 'ECE Batch 2025', phone: '+91 98765 00102' },
      { name: 'Rohit Verma', email: 'rohit.verma@institution.edu', memberId: 'MEM-2026-0103', dept: 'Mechanical Batch 2026', phone: '+91 98765 00103' },
      { name: 'Ananya Sen', email: 'ananya.sen@institution.edu', memberId: 'MEM-2026-0104', dept: 'Economics Batch 2025', phone: '+91 98765 00104' },
      { name: 'Vikram Aditya', email: 'vikram.aditya@institution.edu', memberId: 'MEM-2026-0105', dept: 'Physics Batch 2024', phone: '+91 98765 00105' },
      { name: 'Sneha Reddy', email: 'sneha.reddy@institution.edu', memberId: 'MEM-2026-0106', dept: 'Mathematics Batch 2026', phone: '+91 98765 00106' },
      { name: 'Karan Mehta', email: 'karan.mehta@institution.edu', memberId: 'MEM-2026-0107', dept: 'Law Batch 2025', phone: '+91 98765 00107' },
      { name: 'Neha Gupta', email: 'neha.gupta@institution.edu', memberId: 'MEM-2026-0108', dept: 'Literature Batch 2024', phone: '+91 98765 00108' },
      { name: 'Arjun Nair', email: 'arjun.nair@institution.edu', memberId: 'MEM-2026-0109', dept: 'Civil Batch 2026', phone: '+91 98765 00109' },
      { name: 'Divya Joshi', email: 'divya.joshi@institution.edu', memberId: 'MEM-2026-0110', dept: 'Philosophy Batch 2025', phone: '+91 98765 00110' },
      { name: 'Manish Tiwari', email: 'manish.tiwari@institution.edu', memberId: 'MEM-2026-0111', dept: 'Environmental Science', phone: '+91 98765 00111', isRestricted: true, restrictionReason: 'Suspended due to unreturned physical assets and pending inquiries' },
      { name: 'Pooja Das', email: 'pooja.das@institution.edu', memberId: 'MEM-2026-0112', dept: 'History Batch 2024', phone: '+91 98765 00112' }
    ];

    const members = [];
    for (const m of membersData) {
      const u = await User.create({
        name: m.name,
        email: m.email,
        passwordHash: defaultPasswordHash,
        role: 'MEMBER',
        memberId: m.memberId,
        departmentOrBatch: m.dept,
        phone: m.phone,
        isRestricted: m.isRestricted || false,
        restrictionReason: m.restrictionReason || ''
      });
      members.push(u);
    }

    // 4. Create 36 Bibliographic Titles across 9 categories
    console.log('[Seed] Creating 36 Bibliographic Records...');
    const booksRaw = [
      // Computer Science
      { title: 'Introduction to Algorithms', author: 'Thomas H. Cormen, Charles E. Leiserson, Ronald L. Rivest', isbn: '9780262033848', cat: 'CSE', year: 2022, publisher: 'MIT Press', callNumber: 'QA76.6 .C662', copies: 3 },
      { title: 'Clean Code: A Handbook of Agile Software Craftsmanship', author: 'Robert C. Martin', isbn: '9780132350884', cat: 'CSE', year: 2008, publisher: 'Prentice Hall', callNumber: 'QA76.76.D47 M37', copies: 3 },
      { title: 'Structure and Interpretation of Computer Programs', author: 'Harold Abelson, Gerald Jay Sussman', isbn: '9780262510875', cat: 'CSE', year: 1996, publisher: 'MIT Press', callNumber: 'QA76.6 .A255', copies: 2 },
      { title: 'Design Patterns: Elements of Reusable Object-Oriented Software', author: 'Erich Gamma, Richard Helm, Ralph Johnson, John Vlissides', isbn: '9780201633610', cat: 'CSE', year: 1994, publisher: 'Addison-Wesley', callNumber: 'QA76.64 .D47', copies: 2 },
      { title: 'Designing Data-Intensive Applications', author: 'Martin Kleppmann', isbn: '9781449373320', cat: 'CSE', year: 2017, publisher: "O'Reilly Media", callNumber: 'QA76.9.D3 K58', copies: 2 },

      // Mathematics
      { title: 'Principles of Mathematical Analysis', author: 'Walter Rudin', isbn: '9780070542358', cat: 'MATH', year: 1976, publisher: 'McGraw-Hill', callNumber: 'QA300 .R8', copies: 3 },
      { title: 'Linear Algebra and Its Applications', author: 'Gilbert Strang', isbn: '9780030105678', cat: 'MATH', year: 2006, publisher: 'Thomson Brooks/Cole', callNumber: 'QA184 .S8', copies: 2 },
      { title: 'Concrete Mathematics: A Foundation for Computer Science', author: 'Ronald L. Graham, Donald E. Knuth, Oren Patashnik', isbn: '9780201558029', cat: 'MATH', year: 1994, publisher: 'Addison-Wesley', callNumber: 'QA39.2 .G733', copies: 2 },
      { title: 'Introduction to Probability Models', author: 'Sheldon M. Ross', isbn: '9780128143469', cat: 'MATH', year: 2019, publisher: 'Academic Press', callNumber: 'QA273 .R84', copies: 2 },

      // Physics
      { title: 'The Feynman Lectures on Physics (Vol. 1)', author: 'Richard P. Feynman, Robert B. Leighton, Matthew Sands', isbn: '9780465024933', cat: 'PHYS', year: 2011, publisher: 'Basic Books', callNumber: 'QC21.2 .F49', copies: 3 },
      { title: 'Introduction to Quantum Mechanics', author: 'David J. Griffiths, Darrell F. Schroeter', isbn: '9781107189638', cat: 'PHYS', year: 2018, publisher: 'Cambridge University Press', callNumber: 'QC174.12 .G75', copies: 2 },
      { title: 'Classical Mechanics', author: 'Herbert Goldstein, Charles P. Poole, John L. Safko', isbn: '9780201657029', cat: 'PHYS', year: 2002, publisher: 'Addison-Wesley', callNumber: 'QA805 .G6', copies: 2 },
      { title: 'A Brief History of Time', author: 'Stephen Hawking', isbn: '9780553380163', cat: 'PHYS', year: 1998, publisher: 'Bantam Books', callNumber: 'QB981 .H377', copies: 2 },

      // Literature
      { title: 'Pride and Prejudice', author: 'Jane Austen', isbn: '9780141439518', cat: 'LIT', year: 2002, publisher: 'Penguin Classics', callNumber: 'PR4034 .P7', copies: 3 },
      { title: 'To Kill a Mockingbird', author: 'Harper Lee', isbn: '9780061120084', cat: 'LIT', year: 2006, publisher: 'Harper Perennial', callNumber: 'PS3562.E353 T6', copies: 2 },
      { title: '1984', author: 'George Orwell', isbn: '9780451524935', cat: 'LIT', year: 1950, publisher: 'Signet Classic', callNumber: 'PR6029.R8 N4', copies: 2 },
      { title: 'The Great Gatsby', author: 'F. Scott Fitzgerald', isbn: '9780743273565', cat: 'LIT', year: 2004, publisher: 'Scribner', callNumber: 'PS3511.I9 G7', copies: 2 },

      // History
      { title: 'Sapiens: A Brief History of Humankind', author: 'Yuval Noah Harari', isbn: '9780062316097', cat: 'HIST', year: 2015, publisher: 'Harper', callNumber: 'CB113.H37 H37', copies: 3 },
      { title: 'The Discovery of India', author: 'Jawaharlal Nehru', isbn: '9780143031031', cat: 'HIST', year: 2004, publisher: 'Penguin India', callNumber: 'DS436 .N4', copies: 2 },
      { title: 'Guns, Germs, and Steel: The Fates of Human Societies', author: 'Jared Diamond', isbn: '9780393317558', cat: 'HIST', year: 1999, publisher: 'W. W. Norton & Company', callNumber: 'HM206 .D44', copies: 2 },
      { title: 'India After Gandhi: The History of the World’s Largest Democracy', author: 'Ramachandra Guha', isbn: '9780060958589', cat: 'HIST', year: 2008, publisher: 'Ecco', callNumber: 'DS480.84 .G84', copies: 2 },

      // Economics
      { title: 'Thinking, Fast and Slow', author: 'Daniel Kahneman', isbn: '9780374533557', cat: 'ECON', year: 2013, publisher: 'Farrar, Straus and Giroux', callNumber: 'BF441 .K238', copies: 3 },
      { title: 'Principles of Economics', author: 'N. Gregory Mankiw', isbn: '9781305585126', cat: 'ECON', year: 2017, publisher: 'Cengage Learning', callNumber: 'HB171.5 .M37', copies: 2 },
      { title: 'The Wealth of Nations', author: 'Adam Smith', isbn: '9780199555987', cat: 'ECON', year: 2008, publisher: 'Oxford World’s Classics', callNumber: 'HB161 .S6', copies: 2 },
      { title: 'Poor Economics: A Radical Rethinking of the Way to Fight Global Poverty', author: 'Abhijit V. Banerjee, Esther Duflo', isbn: '9781610390934', cat: 'ECON', year: 2012, publisher: 'PublicAffairs', callNumber: 'HC79.P6 B36', copies: 2 },

      // Law
      { title: 'The Indian Constitution: Cornerstone of a Nation', author: 'Granville Austin', isbn: '9780195649598', cat: 'LAW', year: 1999, publisher: 'Oxford University Press', callNumber: 'KNS1760 .A97', copies: 2 },
      { title: 'The Rule of Law', author: 'Tom Bingham', isbn: '9780141034539', cat: 'LAW', year: 2011, publisher: 'Penguin UK', callNumber: 'K3171 .B56', copies: 2 },
      { title: 'An Introduction to the Principles of Morals and Legislation', author: 'Jeremy Bentham', isbn: '9780198205166', cat: 'LAW', year: 1996, publisher: 'Clarendon Press', callNumber: 'K334 .B46', copies: 2 },

      // Philosophy
      { title: 'Meditations', author: 'Marcus Aurelius', isbn: '9780812968255', cat: 'PHIL', year: 2003, publisher: 'Modern Library', callNumber: 'B580 .A4', copies: 2 },
      { title: 'Critique of Pure Reason', author: 'Immanuel Kant', isbn: '9780521657297', cat: 'PHIL', year: 1998, publisher: 'Cambridge University Press', callNumber: 'B2778.E5 G89', copies: 2 },
      { title: 'Justice: What’s the Right Thing to Do?', author: 'Michael J. Sandel', isbn: '9780374532505', cat: 'PHIL', year: 2010, publisher: 'Farrar, Straus and Giroux', callNumber: 'B105.J87 S26', copies: 2 },

      // Environmental Science
      { title: 'Silent Spring', author: 'Rachel Carson', isbn: '9780618249060', cat: 'ENV', year: 2002, publisher: 'Mariner Books', callNumber: 'QH545.P4 C3', copies: 2 },
      { title: 'The Sixth Extinction: An Unnatural History', author: 'Elizabeth Kolbert', isbn: '9781250062185', cat: 'ENV', year: 2015, publisher: 'Picador', callNumber: 'QE721.2.E97 K65', copies: 2 },
      { title: 'Ecology: From Individuals to Ecosystems', author: 'Michael Begon, Colin R. Townsend, John L. Harper', isbn: '9781405111171', cat: 'ENV', year: 2006, publisher: 'Blackwell Publishing', callNumber: 'QH541 .B43', copies: 2 }
    ];

    const createdBooks = [];
    const allCopies = [];

    for (const b of booksRaw) {
      const bookDoc = await Book.create({
        title: b.title,
        author: b.author,
        isbn: b.isbn,
        category: catMap[b.cat],
        publisher: b.publisher,
        publicationYear: b.year,
        language: 'English',
        callNumber: b.callNumber,
        description: `Standard academic and reference edition of "${b.title}" catalogued for the ${b.cat} departmental collection.`
      });
      createdBooks.push(bookDoc);

      for (let i = 1; i <= b.copies; i++) {
        const barcode = `BC-${b.cat}-${b.isbn.slice(-4)}-${String.fromCharCode(64 + i)}`;
        const copyDoc = await BookCopy.create({
          barcode,
          book: bookDoc._id,
          copyNumber: i,
          status: 'AVAILABLE',
          condition: i === 1 ? 'NEW' : 'GOOD',
          shelfLocation: `Stack ${b.cat.charAt(0)} · Row ${(i % 3) + 1} / Shelf ${i}`,
          price: 499 + (i * 50),
          issueHistory: [{
            action: 'STATUS_CHANGE',
            performedBy: librarian1._id,
            timestamp: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
            notes: 'Initial Accession Ingestion'
          }]
        });
        allCopies.push(copyDoc);
      }
    }

    console.log(`[Seed] Created ${createdBooks.length} titles and ${allCopies.length} physical copies.`);

    // 5. Setup Live Operational Scenarios (Active Loans, Overdues, Holds, Damaged, Lost)
    console.log('[Seed] Configuring operational circulation state...');

    // A. Clean Code (Book 1): All copies checked out to create an active Hold Queue
    const cleanCodeBook = createdBooks[1]; // Clean Code
    const cleanCodeCopies = allCopies.filter(c => c.book.toString() === cleanCodeBook._id.toString());

    // Issue Copy A to Member 0 (Aarav) - Active Loan
    cleanCodeCopies[0].status = 'ISSUED';
    await cleanCodeCopies[0].save();
    const loan1 = await Loan.create({
      bookCopy: cleanCodeCopies[0]._id,
      book: cleanCodeBook._id,
      user: members[0]._id,
      issuedBy: librarian1._id,
      issuedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
      dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      status: 'ACTIVE'
    });

    // Issue Copy B to Member 1 (Priya) - Active Loan
    cleanCodeCopies[1].status = 'ISSUED';
    await cleanCodeCopies[1].save();
    const loan2 = await Loan.create({
      bookCopy: cleanCodeCopies[1]._id,
      book: cleanCodeBook._id,
      user: members[1]._id,
      issuedBy: librarian1._id,
      issuedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      dueDate: new Date(Date.now() + 9 * 24 * 60 * 60 * 1000),
      status: 'ACTIVE'
    });

    // Issue Copy C to Member 2 (Rohit) - Active Loan
    cleanCodeCopies[2].status = 'ISSUED';
    await cleanCodeCopies[2].save();
    const loan3 = await Loan.create({
      bookCopy: cleanCodeCopies[2]._id,
      book: cleanCodeBook._id,
      user: members[2]._id,
      issuedBy: librarian1._id,
      issuedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      dueDate: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000),
      status: 'ACTIVE'
    });

    // Place Holds for Clean Code (Member 3 is #1 in queue, Member 4 is #2 in queue)
    await Reservation.create({
      book: cleanCodeBook._id,
      user: members[3]._id, // Ananya
      status: 'PENDING',
      queuePosition: 1,
      requestDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    });

    await Reservation.create({
      book: cleanCodeBook._id,
      user: members[4]._id, // Vikram
      status: 'PENDING',
      queuePosition: 2,
      requestDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
    });

    // B. Introduction to Algorithms (Book 0): Has 1 Targeted Hold in AVAILABLE_FOR_PICKUP
    const algoBook = createdBooks[0];
    const algoCopies = allCopies.filter(c => c.book.toString() === algoBook._id.toString());
    algoCopies[0].status = 'RESERVED';
    await algoCopies[0].save();

    const pickupDeadline = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000);
    await Reservation.create({
      book: algoBook._id,
      user: members[5]._id, // Sneha Reddy
      bookCopy: algoCopies[0]._id,
      status: 'AVAILABLE_FOR_PICKUP',
      queuePosition: 1,
      pickupDeadline,
      notifiedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      requestDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
    });

    await Notification.create({
      user: members[5]._id,
      title: 'Book Ready for Pickup!',
      message: `Your reserved title "Introduction to Algorithms" (Barcode: ${algoCopies[0].barcode}) is waiting at the circulation desk until ${pickupDeadline.toLocaleDateString()}.`,
      type: 'HOLD_READY',
      link: '/member/holds'
    });

    // C. Live Overdue Loans with Fine Accruals
    // Member 6 (Karan) has an overdue loan (Principles of Mathematical Analysis)
    const rudinBook = createdBooks[5];
    const rudinCopies = allCopies.filter(c => c.book.toString() === rudinBook._id.toString());
    rudinCopies[0].status = 'ISSUED';
    await rudinCopies[0].save();

    const overdueLoan1 = await Loan.create({
      bookCopy: rudinCopies[0]._id,
      book: rudinBook._id,
      user: members[6]._id, // Karan Mehta
      issuedBy: librarian1._id,
      issuedAt: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000),
      dueDate: new Date(Date.now() - 11 * 24 * 60 * 60 * 1000), // 11 days overdue
      status: 'OVERDUE',
      fineCalculated: 50 // (11 - 1 grace) * 5 = 50
    });

    await Fine.create({
      user: members[6]._id,
      loan: overdueLoan1._id,
      book: rudinBook._id,
      amount: 50,
      daysOverdue: 11,
      status: 'PENDING'
    });

    await Notification.create({
      user: members[6]._id,
      title: 'Overdue Notice & Fine Accrual',
      message: `Your loan for "Principles of Mathematical Analysis" is 11 days overdue. Fine accrued: ₹50.`,
      type: 'OVERDUE_ALERT',
      link: '/member/fines'
    });

    // Member 7 (Neha Gupta) has another overdue loan (The Feynman Lectures)
    const feynmanBook = createdBooks[9];
    const feynmanCopies = allCopies.filter(c => c.book.toString() === feynmanBook._id.toString());
    feynmanCopies[0].status = 'ISSUED';
    await feynmanCopies[0].save();

    const overdueLoan2 = await Loan.create({
      bookCopy: feynmanCopies[0]._id,
      book: feynmanBook._id,
      user: members[7]._id, // Neha Gupta
      issuedBy: librarian2._id,
      issuedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      dueDate: new Date(Date.now() - 16 * 24 * 60 * 60 * 1000), // 16 days overdue
      status: 'OVERDUE',
      fineCalculated: 75 // (16 - 1 grace) * 5 = 75
    });

    await Fine.create({
      user: members[7]._id,
      loan: overdueLoan2._id,
      book: feynmanBook._id,
      amount: 75,
      daysOverdue: 16,
      status: 'PENDING'
    });

    // D. One DAMAGED copy and One LOST copy
    // Pride and Prejudice Copy C is DAMAGED
    const prideBook = createdBooks[13];
    const prideCopies = allCopies.filter(c => c.book.toString() === prideBook._id.toString());
    prideCopies[2].status = 'DAMAGED';
    prideCopies[2].condition = 'DAMAGED';
    prideCopies[2].notes = 'Severe binding tear reported on return';
    await prideCopies[2].save();

    // Sapiens Copy C is LOST
    const sapiensBook = createdBooks[17];
    const sapiensCopies = allCopies.filter(c => c.book.toString() === sapiensBook._id.toString());
    sapiensCopies[2].status = 'LOST';
    sapiensCopies[2].notes = 'Patron reported item missing in transit; replacement invoice issued';
    await sapiensCopies[2].save();

    // E. Past Returned Loan History
    const pastLoanBook = createdBooks[14]; // To Kill a Mockingbird
    const pastCopy = allCopies.find(c => c.book.toString() === pastLoanBook._id.toString());
    await Loan.create({
      bookCopy: pastCopy._id,
      book: pastLoanBook._id,
      user: members[0]._id, // Aarav
      issuedBy: librarian1._id,
      issuedAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
      dueDate: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
      returnedAt: new Date(Date.now() - 32 * 24 * 60 * 60 * 1000),
      status: 'RETURNED',
      fineCalculated: 0,
      finePaid: true
    });

    // F. Initial Audit Log Entries
    await AuditLog.create([
      {
        actor: librarian1._id,
        actorName: librarian1.name,
        actorRole: 'LIBRARIAN',
        action: 'POLICY_CONFIGURED',
        targetType: 'LibrarySetting',
        targetId: settings._id,
        details: { policy: 'Standard Institutional Circulation Rules' }
      },
      {
        actor: librarian1._id,
        actorName: librarian1.name,
        actorRole: 'LIBRARIAN',
        action: 'LOAN_ISSUED',
        targetType: 'Loan',
        targetId: loan1._id,
        details: { barcode: cleanCodeCopies[0].barcode, memberId: members[0].memberId }
      },
      {
        actor: librarian2._id,
        actorName: librarian2.name,
        actorRole: 'LIBRARIAN',
        action: 'COPY_STATUS_CHANGE',
        targetType: 'BookCopy',
        targetId: prideCopies[2]._id,
        details: { barcode: prideCopies[2].barcode, oldStatus: 'AVAILABLE', newStatus: 'DAMAGED' }
      }
    ]);

    console.log('[Seed] Database seeding completed successfully!');
    console.log('-------------------------------------------------------');
    console.log('DEMO CREDENTIALS:');
    console.log('  Librarian:  librarian@library.gov.in / Librarian@2026');
    console.log('  Admin:      admin@library.gov.in     / Admin@2026');
    console.log('  Member 1:   aarav.sharma@institution.edu / Member@2026 (Active loan)');
    console.log('  Member 4:   ananya.sen@institution.edu   / Member@2026 (Queue #1 on Clean Code)');
    console.log('  Member 6:   sneha.reddy@institution.edu  / Member@2026 (Hold Ready for Pickup)');
    console.log('  Member 7:   karan.mehta@institution.edu  / Member@2026 (Overdue Loan with Fine)');
    console.log('  Member 11:  manish.tiwari@institution.edu / Member@2026 (Restricted Account)');
    console.log('-------------------------------------------------------');

    process.exit(0);
  } catch (err) {
    console.error('[Seed Error]:', err);
    process.exit(1);
  }
};

seedDatabase();
